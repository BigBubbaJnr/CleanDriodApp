/**
 * Large File Scanner — real MediaLibrary scanning, no demo data.
 *
 * Phase 1 (fast): paginate all photos + videos, estimate sizes from
 *   dimensions/duration, sort descending, keep top 200.
 * Phase 2 (accurate): call FileSystem.getInfoAsync on top 30 items to get
 *   real file sizes; replace estimates for those entries.
 *
 * Per-file info shown: name, size (real/est), type, age, recommendation.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useCleaner, estimateImageSize, estimateVideoSize, getRealFileSize } from '@/context/CleanerContext';
import { SCAN_CAP_TOOL, POOL_CONCURRENCY } from '@/constants/limits';
import { logError } from '@/utils/logger';
import { runWithPool } from '@/utils/pool';
import VerifyingPanel from '@/components/VerifyingPanel';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes, getAgeText } from '@/utils/format';
import { sleep } from '@/utils/sleep';
import SegBar from '@/components/SegBar';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Recommendation engine ────────────────────────────────────────────────────

function getRecommendation(type: LargeFileType, ageDays: number, sizeBytes: number): string {
  const mb = Math.round(sizeBytes / (1024 * 1024));
  if (type === 'video') {
    if (ageDays > 365) return `${mb} MB — over a year old; almost certainly safe to remove or archive to cloud`;
    if (ageDays > 180) return `${mb} MB — 6+ months old; back up to cloud then delete to reclaim this space`;
    if (ageDays > 90) return `${mb} MB — 3+ months old; review whether you still need it`;
    if (mb > 1024) return `Over 1 GB — back up to Google Photos or Drive before deleting`;
    return `Recent video — keep if you still need it`;
  }
  if (type === 'image') {
    if (ageDays > 365) return `${mb} MB photo from over a year ago — consider archiving to cloud`;
    if (mb > 30) return `${mb} MB — likely uncompressed or RAW; back up before deleting`;
    return `${mb} MB large photo`;
  }
  if (type === 'audio') {
    if (ageDays > 180) return `${mb} MB recording, 6+ months old — review if still needed`;
    return `${mb} MB audio file`;
  }
  return `${mb} MB — review if still needed`;
}

// ── Types ────────────────────────────────────────────────────────────────────

type LargeFileType = 'image' | 'video' | 'audio';
type FilterType = 'all' | 'image' | 'video' | 'audio';

interface LargeFile {
  id: string;
  assetId: string;
  name: string;
  size: number;
  sizeIsReal: boolean;
  type: LargeFileType;
  uri: string;
  creationTime: number;   // seconds
  ageText: string;
  ageDays: number;
  recommendation: string;
  selected: boolean;
}

const TYPE_ICONS: Record<LargeFileType, keyof typeof Feather.glyphMap> = {
  image: 'image', video: 'film', audio: 'music',
};

const TYPE_COLORS: Record<LargeFileType, string> = {
  image: '#00E5CC', video: '#FF5500', audio: '#FFB800',
};

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'video', label: 'VIDEO' },
  { key: 'image', label: 'IMG' },
  { key: 'audio', label: 'AUDIO' },
];

// ── Screen ───────────────────────────────────────────────────────────────────

export default function LargeFilesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem, addJournalEntry, storageStats, richScanData } = useCleaner();

  const [phase, setPhase] = useState<'idle' | 'scanning' | 'verifying' | 'results' | 'cleaning' | 'done' | 'error'>('idle');
  const scanStartRef = useRef<number>(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [files, setFiles] = useState<LargeFile[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [bytesFreed, setBytesFreed] = useState(0);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;
  const accentAmber = colors.warning;
  const bevel = useBevel();

  const startScan = useCallback(async () => {
    scanStartRef.current = Date.now();
    setScanError(null);
    setPhase('scanning');
    setScanProgress(0);
    setScanStatus('INIT...');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {

    if (Platform.OS === 'web') {
      setScanStatus('media library unavailable in browser');
      setScanProgress(100);
      setFiles([]);
      setPhase('results');
      return;
    }

    setScanStatus('REQUESTING MEDIA ACCESS...');
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      setScanStatus('[!] permission denied');
      setScanProgress(100);
      setFiles([]);
      setPhase('results');
      return;
    }

    // ── Fast path: use cached Storage Intelligence data (< 30 min old) ────────
    const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
    if (richScanData && richScanData.timestamp) {
      const cacheAge = Date.now() - new Date(richScanData.timestamp).getTime();
      if (cacheAge < CACHE_MAX_AGE_MS) {
        setScanStatus('USING CACHED SCAN — INSTANT RESULTS');
        setScanProgress(100);
        const nowMs = Date.now();
        const cachedFiles: LargeFile[] = richScanData.assets
          .filter(a => {
            if (a.mediaType === 'photo') return a.estimatedSize >= 1_000_000;
            if (a.mediaType === 'video') return a.estimatedSize >= 10_000_000;
            return false;
          })
          .slice(0, 200)
          .map(a => {
            const ageDays = Math.floor((nowMs - a.creationTime * 1000) / 86_400_000);
            const type: LargeFileType = a.mediaType === 'video' ? 'video' : 'image';
            return {
              id: a.id, assetId: a.id, name: a.filename,
              size: a.estimatedSize, sizeIsReal: false,
              type, uri: a.uri, creationTime: a.creationTime,
              ageText: getAgeText(a.creationTime), ageDays,
              recommendation: getRecommendation(type, ageDays, a.estimatedSize),
              selected: false,
            };
          });
        await sleep(200);
        setFiles(cachedFiles);
        setPhase('verifying');
        await sleep(800);
        setPhase('results');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
    }

    // ── Phase 1: paginate all photos and videos ──────────────────────────────
    setScanStatus('LOADING PHOTO LIBRARY...');
    let allFiles: LargeFile[] = [];
    const now = Date.now();

    // Photos
    let photoCursor: string | undefined;
    do {
      const page = await MediaLibrary.getAssetsAsync({
        first: 500,
        after: photoCursor,
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      for (const a of page.assets) {
        const size = estimateImageSize(a.width, a.height);
        if (size < 1_000_000) continue; // skip < 1 MB
        const ageDays = Math.floor((now - a.creationTime * 1000) / 86_400_000);
        allFiles.push({
          id: a.id, assetId: a.id, name: a.filename, size, sizeIsReal: false,
          type: 'image', uri: a.uri, creationTime: a.creationTime,
          ageText: getAgeText(a.creationTime), ageDays,
          recommendation: getRecommendation('image', ageDays, size),
          selected: false,
        });
      }
      photoCursor = page.hasNextPage ? page.endCursor : undefined;
      setScanProgress(Math.min(35, 10 + Math.floor(allFiles.length / 20)));
    } while (photoCursor && allFiles.length < SCAN_CAP_TOOL);

    setScanStatus('LOADING VIDEO LIBRARY...');
    setScanProgress(40);

    // Videos
    let videoCursor: string | undefined;
    let videoCount = 0;
    do {
      const page = await MediaLibrary.getAssetsAsync({
        first: 500,
        after: videoCursor,
        mediaType: [MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      for (const a of page.assets) {
        const size = estimateVideoSize(a.duration);
        if (size < 10_000_000) continue; // skip < 10 MB
        const ageDays = Math.floor((now - a.creationTime * 1000) / 86_400_000);
        allFiles.push({
          id: `v_${a.id}`, assetId: a.id, name: a.filename, size, sizeIsReal: false,
          type: 'video', uri: a.uri, creationTime: a.creationTime,
          ageText: getAgeText(a.creationTime), ageDays,
          recommendation: getRecommendation('video', ageDays, size),
          selected: false,
        });
        videoCount++;
      }
      videoCursor = page.hasNextPage ? page.endCursor : undefined;
      setScanProgress(Math.min(65, 40 + Math.floor(videoCount / 10)));
    } while (videoCursor && allFiles.length < SCAN_CAP_TOOL);

    // Sort by size descending
    allFiles.sort((a, b) => b.size - a.size);
    const top200 = allFiles.slice(0, 200);
    setScanProgress(70);

    // ── Phase 2: real sizes for top 30 ──────────────────────────────────────
    setScanStatus('MEASURING FILE SIZES...');
    const top30 = top200.slice(0, 30);
    const realSizes = await runWithPool(top30, f => getRealFileSize(f.uri), POOL_CONCURRENCY);
    top30.forEach((f, i) => {
      const sz = realSizes[i];
      if (sz !== null && sz !== undefined && sz > 0) {
        f.size = sz;
        f.sizeIsReal = true;
        // Recompute recommendation with real size
        f.recommendation = getRecommendation(f.type, f.ageDays, f.size);
      }
    });

    // Re-sort top 200 after real sizes (top 30 may have shifted)
    top200.sort((a, b) => b.size - a.size);
    setScanProgress(100);
    setScanStatus(`found ${top200.length} large file${top200.length !== 1 ? 's' : ''}`);

    await sleep(200);
    setFiles(top200);
    setPhase('verifying');
    await sleep(1200);
    setPhase('results');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'UNEXPECTED ERROR DURING SCAN');
      setPhase('error');
    }
  }, []);

  const toggleFile = (id: string) =>
    setFiles(prev => prev.map(f => f.id === id ? { ...f, selected: !f.selected } : f));

  const filtered = useMemo(() => files.filter(f => filter === 'all' || f.type === filter), [files, filter]);
  const selected = useMemo(() => files.filter(f => f.selected), [files]);
  const selectedSize = useMemo(() => selected.reduce((acc, f) => acc + f.size, 0), [selected]);
  const realCount = useMemo(() => files.filter(f => f.sizeIsReal).length, [files]);
  const filteredTotalSize = useMemo(() => filtered.reduce((a, f) => a + f.size, 0), [filtered]);

  const renderFileItem = useCallback(({ item: file, index }: { item: LargeFile; index: number }) => (
    <Pressable
      key={file.id}
      style={[
        styles.fileRow,
        index < filtered.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
        file.selected && { backgroundColor: colors.accent + '08' },
        index === 0 && { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
      ]}
      onPress={() => toggleFile(file.id)}
    >
      <View style={[styles.fileIconBox, { borderColor: TYPE_COLORS[file.type] + '50' }]}>
        <Feather name={TYPE_ICONS[file.type]} size={14} color={TYPE_COLORS[file.type]} />
      </View>
      <View style={styles.fileInfo}>
        <View style={styles.fileTopRow}>
          <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>
            {file.name}
          </Text>
          <Text style={[styles.fileSize, {
            color: file.selected ? colors.accent : TYPE_COLORS[file.type],
          }]}>
            {file.sizeIsReal ? '' : '~'}{formatBytes(file.size)}
          </Text>
        </View>
        <View style={styles.fileBottomRow}>
          <Text style={[styles.fileAge, { color: colors.mutedForeground }]}>{file.ageText}</Text>
          <Text style={[styles.fileDot, { color: colors.border }]}>{' · '}</Text>
          <Text style={[styles.fileReco, { color: colors.mutedForeground }]} numberOfLines={1}>
            {file.recommendation}
          </Text>
        </View>
      </View>
      <View style={[styles.checkbox, {
        backgroundColor: file.selected ? colors.accent : 'transparent',
        borderColor: file.selected ? colors.accent : colors.border,
      }]}>
        {file.selected && <Text style={styles.checkMark}>✓</Text>}
      </View>
    </Pressable>
  ), [filtered, toggleFile, colors, accentAmber]);

  const handleDelete = async () => {
    if (selected.length === 0) return;
    setPhase('cleaning');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    let bytesActuallyFreed = 0;
    let itemsRemoved = 0;
    const ids = selected.filter(f => f.assetId).map(f => f.assetId);
    if (ids.length > 0 && Platform.OS !== 'web') {
      try {
        await MediaLibrary.deleteAssetsAsync(ids);
        bytesActuallyFreed = selectedSize;
        itemsRemoved = selected.length;
      } catch (err) {
        logError('large-files/delete', err);
      }
    }

    await sleep(800);
    setBytesFreed(bytesActuallyFreed);
    if (bytesActuallyFreed > 0 || itemsRemoved > 0) {
      await addHistoryItem({
        date: new Date().toISOString(),
        bytesFreed: bytesActuallyFreed,
        type: 'large_files',
        label: `Large Files — ${itemsRemoved} file${itemsRemoved !== 1 ? 's' : ''} removed`,
      });
    }
    await addJournalEntry({
      timestamp: Date.now(),
      tool: 'large_files',
      durationMs: Date.now() - scanStartRef.current,
      itemsFound: files.length,
      itemsCleaned: itemsRemoved,
      bytesFound: files.reduce((acc, f) => acc + f.size, 0),
      bytesRecovered: bytesActuallyFreed,
      totalStorageBytes: storageStats?.totalSpace ?? 0,
    });
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, {
        paddingTop: insets.top + 12 + webTopPad,
        backgroundColor: colors.background,
        borderBottomColor: colors.primary + '40',
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, bevel, { backgroundColor: colors.card }]} accessibilityLabel="Go back" accessibilityRole="button">
          <Feather name="arrow-left" size={16} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{'> MODULE'}</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>LARGE FILE SCANNER</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      {/* ── Filter bar ── */}
      {(phase === 'results' || phase === 'cleaning') && (
        <View style={[styles.filterBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTERS.map(f => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={[
                    styles.filterChip,
                    active
                      ? {
                          backgroundColor: accentAmber,
                          borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                          borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                          borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                        }
                      : { backgroundColor: colors.card, ...bevel },
                  ]}
                  onPress={() => { setFilter(f.key); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.filterLabel, { color: active ? '#000' : colors.mutedForeground }]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Results phase: FlatList for virtualized rendering ── */}
      {(phase === 'results' || phase === 'cleaning') ? (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderFileItem}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.flatContent, { paddingBottom: insets.bottom + 100 + webBottomPad }]}
          ListHeaderComponent={
            <View style={[styles.countPanel, bevel, { backgroundColor: colors.card, marginBottom: 8 }]}>
              <View style={styles.countRow}>
                <Text style={[styles.countKey, { color: colors.mutedForeground }]}>FILES</Text>
                <Text style={styles.countSep}>{' = '}</Text>
                <Text style={[styles.countVal, { color: colors.foreground }]}>{filtered.length}</Text>
                <Text style={[styles.countKey, { color: colors.mutedForeground, marginLeft: 16 }]}>TOTAL</Text>
                <Text style={styles.countSep}>{' = '}</Text>
                <Text style={[styles.countVal, { color: accentAmber }]}>
                  {formatBytes(filteredTotalSize)}
                </Text>
              </View>
              <Text style={[styles.countNote, { color: colors.mutedForeground }]}>
                {realCount} real sizes · {Math.max(0, Math.min(filtered.length, 200) - realCount)} estimated
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.emptyPanel, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.emptyText, { color: colors.success }]}>
                {filter === 'all' ? '[OK] NO LARGE FILES FOUND' : `[OK] NO ${filter.toUpperCase()} FILES`}
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                {filter === 'all'
                  ? 'No media files above the size threshold detected'
                  : `No ${filter} files above threshold — try a different filter`
                }
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 0, borderBottomWidth: 1, borderBottomColor: colors.border }} />}
          style={[styles.flatList, bevel, { backgroundColor: colors.card }]}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 + webBottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── IDLE ── */}
          {phase === 'idle' && (
            <Animated.View entering={FadeIn} style={styles.center}>
              <View style={[styles.idleIconBox, bevel, { backgroundColor: colors.card }]}>
                <Feather name="hard-drive" size={44} color={accentAmber} />
              </View>
              <Text style={[styles.idleTitle, { color: colors.foreground }]}>LARGE FILE SCANNER</Text>
              <View style={[styles.infoBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <Text style={[styles.infoTitle, { color: accentAmber }]}>{'[SCAN METHOD]'}</Text>
                <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>
                  {'[+] '} Scans all photos and videos via MediaLibrary
                </Text>
                <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>
                  {'[+] '} Real sizes measured for top 30 files
                </Text>
                <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>
                  {'[+] '} Age and safety recommendation per file
                </Text>
                <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>
                  {'[i] '} Remaining sizes estimated from dimensions
                </Text>
              </View>
              <Pressable onPress={startScan} style={styles.fullWidth} accessibilityLabel="Start large file scan" accessibilityRole="button">
                <View style={[styles.primaryBtn, {
                  backgroundColor: accentAmber,
                  borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                  borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                  borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                }]}>
                  <Feather name="search" size={16} color="#000" />
                  <Text style={[styles.primaryBtnText, { color: '#000' }]}>{'>> SCAN FILES'}</Text>
                </View>
              </Pressable>
            </Animated.View>
          )}

          {/* ── SCANNING ── */}
          {phase === 'scanning' && (
            <Animated.View entering={FadeIn} style={styles.center}>
              <View style={[styles.scanBox, bevel, { backgroundColor: colors.card }]}>
                <Text style={[styles.scanTitle, { color: accentAmber }]}>{'[SCANNING...]'}</Text>
                <Text style={[styles.scanPct, { color: accentAmber }]}>
                  {String(scanProgress).padStart(3, '0')}%
                </Text>
                <SegBar value={scanProgress / 100} color={accentAmber} />
                <Text style={[styles.scanStatus, { color: colors.mutedForeground }]}>{'> '}{scanStatus}</Text>
              </View>
            </Animated.View>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <Animated.View entering={FadeIn} style={styles.center}>
              <View style={[styles.errorBox, bevel, { backgroundColor: colors.card }]}>
                <Text style={[styles.errorTitle, { color: accentAmber }]}>{'[SCAN FAILED]'}</Text>
                <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>
                  {'> '}{scanError ?? 'UNEXPECTED ERROR — CHECK PERMISSIONS'}
                </Text>
                <Pressable onPress={() => { setScanError(null); setPhase('idle'); }} style={styles.fullWidth}>
                  <View style={[styles.retryBtn, {
                    backgroundColor: accentAmber,
                    borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                    borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                  }]}>
                    <Feather name="refresh-cw" size={14} color="#000" />
                    <Text style={[styles.retryBtnText, { color: '#000' }]}>{'>> TRY AGAIN'}</Text>
                  </View>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* ── VERIFYING ── */}
          {phase === 'verifying' && (
            <Animated.View entering={FadeIn} style={styles.center}>
              <VerifyingPanel color={accentAmber} />
            </Animated.View>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && (
            <Animated.View entering={FadeIn} style={styles.center}>
              <View style={[styles.doneBox, bevel, { backgroundColor: colors.card }]}>
                <Text style={[styles.doneHead, { color: colors.success }]}>{'[OK] FILES PURGED'}</Text>
                <Text style={[styles.doneBytes, { color: colors.primary }]}>{formatBytes(bytesFreed)}</Text>
                <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>RECLAIMED</Text>
              </View>
              <Pressable onPress={() => { setPhase('idle'); setFiles([]); }} style={styles.fullWidth}>
                <View style={[styles.outlineBtn, {
                  borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
                  borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
                  borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                  backgroundColor: colors.card,
                }]}>
                  <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>{'>> SCAN AGAIN'}</Text>
                </View>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* ── Footer ── */}
      {(phase === 'results' || phase === 'cleaning') && selected.length > 0 && (
        <View style={[styles.footer, {
          paddingBottom: insets.bottom + 16 + webBottomPad,
          backgroundColor: colors.background,
          borderTopColor: colors.primary + '40',
        }]}>
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            {selected.length} SELECTED  ·  {formatBytes(selectedSize)}
          </Text>
          <Pressable onPress={handleDelete} disabled={phase === 'cleaning'} style={styles.fullWidth}>
            <View style={[styles.primaryBtn, {
              backgroundColor: accentAmber,
              borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
              borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
              borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
            }]}>
              {phase === 'cleaning'
                ? <ActivityIndicator color="#000" size="small" />
                : <>
                    <Feather name="trash-2" size={16} color="#000" />
                    <Text style={[styles.primaryBtnText, { color: '#000' }]}>{'>> DELETE SELECTED'}</Text>
                  </>
              }
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 2 },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  filterBar: { borderBottomWidth: 1 },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6 },
  filterLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  content: { padding: 16 },
  center: { alignItems: 'center', paddingTop: 40, gap: 16 },
  fullWidth: { width: '100%' },
  errorBox: { padding: 20, gap: 12, width: '100%' },
  errorTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 2 },
  errorMsg: { fontFamily: 'Inter_400Regular', fontSize: 11, letterSpacing: 0.5, lineHeight: 16 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14 },
  retryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 2 },

  idleIconBox: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  idleTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  infoBox: { width: '100%', borderWidth: 1, padding: 12, gap: 5 },
  infoTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 4 },
  infoLine: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 10,
  },
  primaryBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  scanBox: { width: '100%', padding: 20, gap: 14 },
  scanTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  scanPct: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 2, textAlign: 'center' },
  scanStatus: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  countPanel: { padding: 12, gap: 4 },
  countRow: { flexDirection: 'row', alignItems: 'center' },
  countKey: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 1 },
  countSep: { fontSize: 10, fontFamily: 'Inter_400Regular', color: '#444' },
  countVal: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  countNote: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  emptyPanel: { padding: 28, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  emptyDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },

  flatList: { overflow: 'hidden', marginHorizontal: 0 },
  flatContent: { paddingHorizontal: 16, paddingTop: 16, gap: 0 },
  listPanel: { overflow: 'hidden' },
  fileRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  fileIconBox: { width: 34, height: 34, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1, gap: 4 },
  fileTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fileName: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium' },
  fileSize: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  fileBottomRow: { flexDirection: 'row', alignItems: 'center' },
  fileAge: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  fileDot: { fontSize: 9 },
  fileReco: { flex: 1, fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },
  checkbox: { width: 18, height: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#FFF', fontSize: 10, fontFamily: 'Inter_700Bold', lineHeight: 14 },

  doneBox: { width: '100%', padding: 24, gap: 10, alignItems: 'center' },
  doneHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  doneBytes: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  doneSub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },

  outlineBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  outlineBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  footer: { padding: 16, borderTopWidth: 1, gap: 10 },
  footerSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textAlign: 'center' },
});
