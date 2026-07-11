import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useCleaner, estimateImageSize, estimateVideoSize } from '@/context/CleanerContext';
import VerifyingPanel from '@/components/VerifyingPanel';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes } from '@/utils/format';
import SegBar from '@/components/SegBar';
import TerminalLog from '@/components/TerminalLog';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type JunkCategory = 'app_cache' | 'download' | 'large_video';

interface JunkItem {
  id: string;
  name: string;
  size: number;
  category: JunkCategory;
  selected: boolean;
  assetId?: string;       // MediaLibrary asset ID
  isOwnCache?: boolean;   // FileSystem own-cache item
  sizeIsEstimated?: boolean;
}

const CAT_LABELS: Record<JunkCategory, string> = {
  app_cache: 'APP CACHE',
  download: 'DOWNLOAD',
  large_video: 'OLD VIDEO',
};

const CAT_ICONS: Record<JunkCategory, keyof typeof Feather.glyphMap> = {
  app_cache: 'cpu',
  download: 'download',
  large_video: 'film',
};


export default function JunkCleanerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem, addJournalEntry, storageStats } = useCleaner();

  const [phase, setPhase] = useState<'idle' | 'scanning' | 'verifying' | 'results' | 'cleaning' | 'done'>('idle');
  const scanStartRef = useRef<number>(0);
  const [items, setItems] = useState<JunkItem[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [bytesFreed, setBytesFreed] = useState(0);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const addLog = useCallback((msg: string) => {
    setScanLog(prev => [...prev, `> ${msg}`]);
  }, []);

  const startScan = useCallback(async () => {
    scanStartRef.current = Date.now();
    setPhase('scanning');
    setScanProgress(0);
    setScanLog([]);
    const found: JunkItem[] = [];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ── Step 1: Own app cache ──────────────────────────
    addLog('checking app cache directory...');
    setScanProgress(10);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cacheInfo = await FileSystem.getInfoAsync(FileSystem.cacheDirectory!, { size: true } as any);
      const cacheSize = (cacheInfo as any).size ?? 0;
      if (cacheSize > 0) {
        addLog(`app cache: ${formatBytes(cacheSize)}`);
        found.push({
          id: 'own_cache',
          name: 'App Cache (CleanDroid)',
          size: cacheSize,
          category: 'app_cache',
          selected: true,
          isOwnCache: true,
        });
      } else {
        addLog('app cache is empty');
      }
    } catch {
      addLog('could not read app cache');
    }

    setScanProgress(20);

    // ── Step 2: MediaLibrary ───────────────────────────
    if (Platform.OS === 'web') {
      addLog('[web] media library not available in browser preview');
      setScanProgress(100);
      setItems(found);
      setPhase(found.length > 0 ? 'results' : 'results');
      return;
    }

    addLog('requesting media library access...');
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      addLog('[!] media access denied — only app cache scanned');
      setScanProgress(100);
      setItems(found);
      setPhase('results');
      return;
    }

    setScanProgress(30);

    // ── Step 3: Downloads album ───────────────────────
    addLog('looking for Downloads album...');
    try {
      const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      const dlAlbum = albums.find(a =>
        a.title.toLowerCase() === 'download' || a.title.toLowerCase() === 'downloads'
      );

      if (dlAlbum && dlAlbum.assetCount > 0) {
        addLog(`Downloads album: ${dlAlbum.assetCount} items — scanning...`);
        // Paginate through all download assets (cap at 3000 to protect UI)
        let dlAll: MediaLibrary.Asset[] = [];
        let dlCursor: string | undefined;
        do {
          const page = await MediaLibrary.getAssetsAsync({
            first: 500,
            after: dlCursor,
            album: dlAlbum,
            mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
          });
          dlAll = [...dlAll, ...page.assets];
          dlCursor = page.hasNextPage ? page.endCursor : undefined;
        } while (dlCursor && dlAll.length < 3000);
        if (dlCursor) addLog(`[!] large library — checked first ${dlAll.length} downloads`);
        setScanProgress(55);

        let dlFound = 0;
        for (const asset of dlAll) {
          const size = asset.mediaType === MediaLibrary.MediaType.video
            ? estimateVideoSize(asset.duration)
            : estimateImageSize(asset.width, asset.height);
          // Only flag downloads larger than 30 MB as potential junk
          if (size >= 30 * 1024 * 1024) {
            found.push({
              id: `dl_${asset.id}`,
              name: asset.filename,
              size,
              category: 'download',
              selected: false,
              assetId: asset.id,
              sizeIsEstimated: true,
            });
            dlFound++;
          }
        }
        addLog(`found ${dlFound} large items in Downloads (>30 MB each)`);
      } else {
        addLog('no Downloads album found');
      }
    } catch {
      addLog('could not scan Downloads album');
    }

    setScanProgress(65);

    // ── Step 4: Old large videos ──────────────────────
    addLog('scanning for old large videos...');
    try {
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const videos = await MediaLibrary.getAssetsAsync({
        first: 500,
        mediaType: [MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });

      setScanProgress(85);
      let oldVideoCount = 0;
      for (const v of videos.assets) {
        const size = estimateVideoSize(v.duration);
        const createdMs = v.creationTime * 1000;
        // Flag: estimated > 200 MB and older than 90 days
        if (size >= 200 * 1024 * 1024 && createdMs < ninetyDaysAgo) {
          found.push({
            id: `vid_${v.id}`,
            name: v.filename,
            size,
            category: 'large_video',
            selected: false,
            assetId: v.id,
            sizeIsEstimated: true,
          });
          oldVideoCount++;
        }
      }
      addLog(`found ${oldVideoCount} old large videos (>200 MB, >90 days old)`);
    } catch {
      addLog('could not scan video library');
    }

    setScanProgress(100);

    // Deduplicate by assetId — an asset can appear in both 'download' and 'large_video'
    const seenAssets = new Set<string>();
    const deduped = found.filter(item => {
      if (!item.assetId) return true; // own-cache items have no assetId, always keep
      if (seenAssets.has(item.assetId)) return false;
      seenAssets.add(item.assetId);
      return true;
    });
    addLog(`scan complete — ${deduped.length} unique item${deduped.length !== 1 ? 's' : ''} found`);
    await new Promise(r => setTimeout(r, 300));

    setItems(deduped);
    setPhase('verifying');
    await new Promise(r => setTimeout(r, 1200));
    setPhase('results');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [addLog]);

  const toggleItem = (id: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i));

  const selectAll = () => {
    const allSelected = items.every(i => i.selected);
    setItems(prev => prev.map(i => ({ ...i, selected: !allSelected })));
  };

  const selectedItems = items.filter(i => i.selected);
  const selectedSize = selectedItems.reduce((acc, i) => acc + i.size, 0);
  const totalSize = items.reduce((acc, i) => acc + i.size, 0);

  const handleClean = async () => {
    if (selectedItems.length === 0) return;
    setPhase('cleaning');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    let bytesActuallyFreed = 0;
    let itemsActuallyRemoved = 0;

    // Delete own app cache
    const cacheItems = selectedItems.filter(i => i.isOwnCache);
    if (cacheItems.length > 0) {
      try {
        await FileSystem.deleteAsync(FileSystem.cacheDirectory!, { idempotent: true });
        bytesActuallyFreed += cacheItems.reduce((acc, i) => acc + i.size, 0);
        itemsActuallyRemoved += cacheItems.length;
      } catch {}
    }

    // Delete MediaLibrary items — record bytes only on success
    const mediaItems = selectedItems.filter(i => i.assetId);
    if (mediaItems.length > 0 && Platform.OS !== 'web') {
      try {
        await MediaLibrary.deleteAssetsAsync(mediaItems.map(i => i.assetId!));
        bytesActuallyFreed += mediaItems.reduce((acc, i) => acc + i.size, 0);
        itemsActuallyRemoved += mediaItems.length;
      } catch {}
    }

    await new Promise(r => setTimeout(r, 800));
    setBytesFreed(bytesActuallyFreed);
    if (bytesActuallyFreed > 0 || itemsActuallyRemoved > 0) {
      await addHistoryItem({
        date: new Date().toISOString(),
        bytesFreed: bytesActuallyFreed,
        type: 'junk',
        label: `Junk Cleaner — ${itemsActuallyRemoved} item${itemsActuallyRemoved !== 1 ? 's' : ''} removed`,
      });
    }
    await addJournalEntry({
      timestamp: Date.now(),
      tool: 'junk',
      durationMs: Date.now() - scanStartRef.current,
      itemsFound: items.length,
      itemsCleaned: itemsActuallyRemoved,
      bytesFound: totalSize,
      bytesRecovered: bytesActuallyFreed,
      totalStorageBytes: storageStats?.totalSpace ?? 0,
    });
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const bevel = useBevel();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, {
        paddingTop: insets.top + 12 + webTopPad,
        backgroundColor: colors.background,
        borderBottomColor: colors.primary + '40',
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, bevel, { backgroundColor: colors.card }]}>
          <Feather name="arrow-left" size={16} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{'> MODULE'}</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>JUNK CLEANER</Text>
        </View>
        {phase === 'results'
          ? <Pressable onPress={selectAll} style={[styles.selectAllBtn, { borderColor: colors.border }]}>
              <Text style={[styles.selectAllText, { color: colors.primary }]}>
                {items.every(i => i.selected) ? 'NONE' : 'ALL'}
              </Text>
            </Pressable>
          : <View style={{ width: 48 }} />
        }
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 + webBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.idleIconBox, bevel, { backgroundColor: colors.card }]}>
              <Feather name="trash-2" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.idleTitle, { color: colors.foreground }]}>JUNK CLEANER</Text>
            <View style={[styles.infoBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.infoTitle, { color: colors.primary }]}>{'[SCANS FOR]'}</Text>
              <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>{'[+] '} Own app cache (deletable directly)</Text>
              <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>{'[+] Large items in Downloads album (>30 MB)'}</Text>
              <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>{'[+] Old large videos (>200 MB, >90 days)'}</Text>
              <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>{'[i] '} Video/image sizes are estimated</Text>
            </View>
            <Pressable onPress={startScan} style={styles.fullWidth}>
              <View style={[styles.primaryBtn, {
                backgroundColor: colors.primary,
                borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              }]}>
                <Feather name="search" size={16} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{'>> START SCAN'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* ── SCANNING ── */}
        {phase === 'scanning' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.scanBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.scanTitle, { color: colors.primary }]}>{'[SCANNING...]'}</Text>
              <Text style={[styles.scanPct, { color: colors.primary }]}>
                {String(scanProgress).padStart(3, '0')}%
              </Text>
              <SegBar value={scanProgress / 100} color={colors.primary} />
            </View>
            <TerminalLog lines={scanLog} />
          </Animated.View>
        )}

        {/* ── VERIFYING ── */}
        {phase === 'verifying' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <VerifyingPanel color={colors.primary} />
          </Animated.View>
        )}

        {/* ── RESULTS / CLEANING ── */}
        {(phase === 'results' || phase === 'cleaning') && (
          <Animated.View entering={FadeIn}>
            {/* Summary */}
            <View style={[styles.summaryPanel, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.summaryHead, { color: colors.primary }]}>{'[SCAN COMPLETE]'}</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>ITEMS_FOUND</Text>
                <Text style={[styles.summarySep, { color: colors.border }]}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>{items.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>TOTAL_SIZE</Text>
                <Text style={[styles.summarySep, { color: colors.border }]}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: colors.accent }]}>~{formatBytes(totalSize)}</Text>
              </View>
            </View>

            {items.length === 0 ? (
              <View style={[styles.emptyPanel, bevel, { backgroundColor: colors.card }]}>
                <Text style={[styles.emptyText, { color: colors.success }]}>{'[OK] DEVICE IS CLEAN'}</Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                  {'> NO REMOVABLE JUNK DETECTED IN ACCESSIBLE STORAGE'}
                </Text>
              </View>
            ) : (
              <View style={[styles.listPanel, bevel, { backgroundColor: colors.card }]}>
                {items.map((item, idx) => (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.itemRow,
                      idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      item.selected && { backgroundColor: colors.primary + '08' },
                    ]}
                    onPress={() => toggleItem(item.id)}
                  >
                    <View style={[styles.checkbox, {
                      backgroundColor: item.selected ? colors.primary : 'transparent',
                      borderColor: item.selected ? colors.primary : colors.border,
                    }]}>
                      {item.selected && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                    <View style={[styles.itemIconBox, { borderColor: colors.border }]}>
                      <Feather name={CAT_ICONS[item.category]} size={13} color={colors.mutedForeground} />
                    </View>
                    <View style={styles.itemContent}>
                      <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.itemCat, { color: colors.mutedForeground }]}>
                        {CAT_LABELS[item.category]}
                        {item.sizeIsEstimated ? ' · EST. SIZE' : ''}
                      </Text>
                    </View>
                    <Text style={[styles.itemSize, { color: item.selected ? colors.primary : colors.mutedForeground }]}>
                      {item.sizeIsEstimated ? '~' : ''}{formatBytes(item.size)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Terminal log (collapsed) */}
            {scanLog.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.logLabel, { color: colors.mutedForeground }]}>{'── SCAN LOG ──────────────────────'}</Text>
                <TerminalLog lines={scanLog} />
              </View>
            )}
          </Animated.View>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.doneBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.doneHead, { color: colors.success }]}>{'[OK] PURGE COMPLETE'}</Text>
              <Text style={[styles.doneBytes, { color: colors.primary }]}>~{formatBytes(bytesFreed)}</Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>RECLAIMED</Text>
            </View>
            <Pressable onPress={() => { setPhase('idle'); setItems([]); setScanLog([]); }} style={styles.fullWidth}>
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

      {/* ── Footer ── */}
      {(phase === 'results' || phase === 'cleaning') && items.length > 0 && (
        <View style={[styles.footer, {
          paddingBottom: insets.bottom + 16 + webBottomPad,
          backgroundColor: colors.background,
          borderTopColor: colors.primary + '40',
        }]}>
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            {selectedItems.length} SELECTED  ·  ~{formatBytes(selectedSize)}
          </Text>
          <Pressable
            onPress={handleClean}
            disabled={selectedItems.length === 0 || phase === 'cleaning'}
            style={styles.fullWidth}
          >
            <View style={[styles.primaryBtn, {
              backgroundColor: selectedItems.length > 0 ? colors.primary : colors.muted,
              borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
              borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
              borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              opacity: selectedItems.length === 0 ? 0.5 : 1,
            }]}>
              {phase === 'cleaning'
                ? <ActivityIndicator color={colors.primaryForeground} size="small" />
                : <>
                    <Feather name="trash-2" size={16} color={colors.primaryForeground} />
                    <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                      {'>> CLEAN SELECTED'}
                    </Text>
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
  selectAllBtn: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  selectAllText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  content: { padding: 16, gap: 12 },
  center: { alignItems: 'center', paddingTop: 32, gap: 16 },
  fullWidth: { width: '100%' },

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


  summaryPanel: { padding: 14, gap: 6 },
  summaryHead: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 4 },
  summaryRow: { flexDirection: 'row' },
  summaryKey: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, width: 120 },
  summarySep: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  summaryVal: { fontSize: 11, fontFamily: 'Inter_700Bold' },

  emptyPanel: { padding: 28, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  emptyDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },

  listPanel: { overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  checkbox: { width: 18, height: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#FFF', fontSize: 10, fontFamily: 'Inter_700Bold', lineHeight: 14 },
  itemIconBox: { width: 32, height: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemContent: { flex: 1 },
  itemName: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  itemCat: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginTop: 2 },
  itemSize: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  logLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginBottom: 6 },

  doneBox: { width: '100%', padding: 24, gap: 10, alignItems: 'center' },
  doneHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  doneBytes: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  doneSub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },

  outlineBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  outlineBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  footer: { padding: 16, borderTopWidth: 1, gap: 10 },
  footerSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textAlign: 'center' },
});
