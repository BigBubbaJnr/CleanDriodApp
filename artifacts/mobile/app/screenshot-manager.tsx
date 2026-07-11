import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useCleaner } from '@/context/CleanerContext';
import { SCAN_CAP_TOOL } from '@/constants/limits';
import { logError } from '@/utils/logger';
import VerifyingPanel from '@/components/VerifyingPanel';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes, formatDateShort } from '@/utils/format';
import { sleep } from '@/utils/sleep';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenshotItem {
  id: string;
  assetId: string;
  uri: string;
  width: number;
  height: number;
  creationTime: number;
  filename: string;
  estimatedSize: number;
  selected: boolean;
}

/** Estimate screenshot size: PNG typically ~0.4 bytes per pixel after compression */
function estimateScreenshotSize(w: number, h: number): number {
  return Math.round(w * h * 0.4);
}

export default function ScreenshotManagerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem, addJournalEntry, storageStats, richScanData } = useCleaner();

  const [phase, setPhase] = useState<'idle' | 'loading' | 'verifying' | 'results' | 'deleting' | 'done' | 'error'>('idle');
  const scanStartRef = useRef<number>(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [loadStatus, setLoadStatus] = useState('');
  const [freedBytes, setFreedBytes] = useState(0);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const loadScreenshots = useCallback(async () => {
    scanStartRef.current = Date.now();
    setScanError(null);
    setPhase('loading');
    setLoadStatus('REQUESTING MEDIA ACCESS...');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {

    if (Platform.OS === 'web') {
      setLoadStatus('[web] media library unavailable in browser');
      setPhase('results');
      return;
    }

    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      setLoadStatus('[!] permission denied');
      setPhase('results');
      return;
    }

    // ── Fast path: use cached Storage Intelligence data (< 30 min old) ────────
    const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
    if (richScanData && richScanData.timestamp) {
      const cacheAge = Date.now() - new Date(richScanData.timestamp).getTime();
      if (cacheAge < CACHE_MAX_AGE_MS) {
        setLoadStatus('USING CACHED SCAN — INSTANT RESULTS');
        const cachedItems: ScreenshotItem[] = richScanData.assets
          .filter(a => a.isScreenshot)
          .map(a => ({
            id: a.id, assetId: a.id,
            uri: a.uri, width: a.width, height: a.height,
            creationTime: a.creationTime, filename: a.filename,
            // PNG screenshots: ~0.4 bytes/pixel (vs 0.2 for JPEG)
            estimatedSize: Math.round(a.width * a.height * 0.4),
            selected: false,
          }))
          .sort((a, b) => b.creationTime - a.creationTime);
        setScreenshots(cachedItems);
        setPhase('verifying');
        await sleep(600);
        setPhase('results');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
    }

    setLoadStatus('LOCATING SCREENSHOTS ALBUM...');
    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
    const ssAlbum = albums.find(a => a.title.toLowerCase().includes('screenshot'));

    if (!ssAlbum) {
      setLoadStatus('[ERR] NO SCREENSHOTS ALBUM FOUND ON THIS DEVICE');
      setPhase('results');
      return;
    }

    setLoadStatus(`LOADING ${ssAlbum.assetCount} SCREENSHOTS...`);
    // Paginate through all screenshots (cap at 5000 to protect UI performance)
    let allAssets: MediaLibrary.Asset[] = [];
    let cursor: string | undefined;
    do {
      const page = await MediaLibrary.getAssetsAsync({
        first: 500,
        after: cursor,
        album: ssAlbum,
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      allAssets = [...allAssets, ...page.assets];
      cursor = page.hasNextPage ? page.endCursor : undefined;
    } while (cursor && allAssets.length < SCAN_CAP_TOOL);
    const assets = { assets: allAssets };

    const items: ScreenshotItem[] = assets.assets.map(a => ({
      id: a.id,
      assetId: a.id,
      uri: a.uri,
      width: a.width,
      height: a.height,
      creationTime: a.creationTime,
      filename: a.filename,
      estimatedSize: estimateScreenshotSize(a.width, a.height),
      selected: false,
    }));

    // Sort newest first
    items.sort((a, b) => b.creationTime - a.creationTime);

    setScreenshots(items);
    setPhase('verifying');
    await sleep(1200);
    setPhase('results');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'UNEXPECTED ERROR DURING SCAN');
      setPhase('error');
    }
  }, []);

  useEffect(() => { loadScreenshots(); }, [loadScreenshots]);

  const toggleItem = (id: string) =>
    setScreenshots(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));

  const selectAll = () => {
    const allSelected = screenshots.every(s => s.selected);
    setScreenshots(prev => prev.map(s => ({ ...s, selected: !allSelected })));
  };

  const selected = screenshots.filter(s => s.selected);
  const selectedSize = selected.reduce((acc, s) => acc + s.estimatedSize, 0);
  const totalSize = screenshots.reduce((acc, s) => acc + s.estimatedSize, 0);

  const handleDelete = async () => {
    if (selected.length === 0) return;
    setPhase('deleting');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    if (Platform.OS !== 'web') {
      try {
        await MediaLibrary.deleteAssetsAsync(selected.map(s => s.assetId));
      } catch (err) {
        logError('screenshots/delete', err);
      }
    }

    await sleep(600);
    setFreedBytes(selectedSize);
    await addHistoryItem({
      date: new Date().toISOString(),
      bytesFreed: selectedSize,
      type: 'screenshots',
      label: `Screenshot Manager — ${selected.length} screenshot${selected.length !== 1 ? 's' : ''} removed`,
    });
    await addJournalEntry({
      timestamp: Date.now(),
      tool: 'screenshots',
      durationMs: Date.now() - scanStartRef.current,
      itemsFound: screenshots.length,
      itemsCleaned: selected.length,
      bytesFound: totalSize,
      bytesRecovered: selectedSize,
      totalStorageBytes: storageStats?.totalSpace ?? 0,
    });
    setScreenshots(prev => prev.filter(s => !s.selected));
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const bevel = {
    borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
    borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  };

  // Group screenshots by date
  const grouped: { date: string; items: ScreenshotItem[] }[] = [];
  for (const ss of screenshots) {
    const dateKey = formatDateShort(ss.creationTime);
    const existing = grouped.find(g => g.date === dateKey);
    if (existing) existing.items.push(ss);
    else grouped.push({ date: dateKey, items: [ss] });
  }

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
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>SCREENSHOT MGR</Text>
        </View>
        {phase === 'results' && screenshots.length > 0
          ? <Pressable onPress={selectAll} style={[styles.selectAllBtn, { borderColor: colors.border }]}>
              <Text style={[styles.selectAllText, { color: colors.primary }]}>
                {screenshots.every(s => s.selected) ? 'NONE' : 'ALL'}
              </Text>
            </Pressable>
          : <View style={{ width: 48 }} />
        }
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 + webBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── LOADING ── */}
        {phase === 'loading' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.loadBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.loadTitle, { color: colors.success }]}>{'[LOADING...]'}</Text>
              <ActivityIndicator color={colors.success} />
              <Text style={[styles.loadStatus, { color: colors.mutedForeground }]}>{'> '}{loadStatus}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.errorBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.errorTitle, { color: colors.success }]}>{'[SCAN FAILED]'}</Text>
              <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>
                {'> '}{scanError ?? 'UNEXPECTED ERROR — CHECK PERMISSIONS'}
              </Text>
              <Pressable onPress={() => { setScanError(null); setPhase('idle'); }} style={styles.fullWidth}>
                <View style={[styles.retryBtn, {
                  backgroundColor: colors.success,
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
            <VerifyingPanel color={colors.success} />
          </Animated.View>
        )}

        {/* ── RESULTS ── */}
        {(phase === 'results' || phase === 'deleting') && (
          <Animated.View entering={FadeIn} style={{ gap: 12 }}>
            {/* Summary */}
            {screenshots.length > 0 && (
              <View style={[styles.summaryPanel, bevel, { backgroundColor: colors.card }]}>
                <Text style={[styles.summaryHead, { color: colors.success }]}>{'[SCREENSHOTS]'}</Text>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>TOTAL_COUNT</Text>
                  <Text style={styles.summarySep}>{' = '}</Text>
                  <Text style={[styles.summaryVal, { color: colors.foreground }]}>{screenshots.length}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>EST_SIZE</Text>
                  <Text style={styles.summarySep}>{' = '}</Text>
                  <Text style={[styles.summaryVal, { color: colors.accent }]}>~{formatBytes(totalSize)}</Text>
                </View>
              </View>
            )}

            {/* Empty */}
            {screenshots.length === 0 && (
              <View style={[styles.emptyPanel, bevel, { backgroundColor: colors.card }]}>
                <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>{'[ _ ]'}</Text>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>SYSTEM STATUS: CLEAN</Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                  {loadStatus || 'No Screenshots album found on this device'}
                </Text>
              </View>
            )}

            {/* Grid by date group */}
            {grouped.map(group => (
              <View key={group.date}>
                <Text style={[styles.dateHeader, { color: colors.primary }]}>
                  {'── '}{group.date}{' (' + group.items.length + ')'}
                </Text>
                <View style={styles.grid}>
                  {group.items.map(ss => (
                    <Pressable
                      key={ss.id}
                      style={[
                        styles.gridItem,
                        {
                          borderTopColor: ss.selected ? colors.accent : colors.bevelLight,
                          borderLeftColor: ss.selected ? colors.accent : colors.bevelLight,
                          borderBottomColor: ss.selected ? colors.accent : colors.bevelDark,
                          borderRightColor: ss.selected ? colors.accent : colors.bevelDark,
                          borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                        },
                      ]}
                      onPress={() => toggleItem(ss.id)}
                    >
                      <Image
                        source={{ uri: ss.uri }}
                        style={styles.thumb}
                        resizeMode="cover"
                      />
                      {ss.selected && (
                        <View style={[styles.selectedOverlay, { backgroundColor: colors.accent + '55' }]}>
                          <View style={[styles.checkCircle, { backgroundColor: colors.accent }]}>
                            <Text style={styles.checkMark}>✓</Text>
                          </View>
                        </View>
                      )}
                      <Text style={[styles.sizeTag, { backgroundColor: colors.background + 'CC', color: colors.mutedForeground }]}>
                        ~{formatBytes(ss.estimatedSize)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </Animated.View>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.doneBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.doneHead, { color: colors.success }]}>{'[OK] PURGED'}</Text>
              <Text style={[styles.doneBytes, { color: colors.primary }]}>~{formatBytes(freedBytes)}</Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>RECLAIMED</Text>
            </View>
            <Pressable onPress={loadScreenshots} style={styles.fullWidth}>
              <View style={[styles.outlineBtn, {
                borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
                borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                backgroundColor: colors.card,
              }]}>
                <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>{'>> RELOAD'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      {/* ── Footer ── */}
      {(phase === 'results' || phase === 'deleting') && selected.length > 0 && (
        <View style={[styles.footer, {
          paddingBottom: insets.bottom + 16 + webBottomPad,
          backgroundColor: colors.background,
          borderTopColor: colors.primary + '40',
        }]}>
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            {selected.length} SELECTED  ·  ~{formatBytes(selectedSize)}
          </Text>
          <Pressable onPress={handleDelete} disabled={phase === 'deleting'} style={styles.fullWidth}>
            <View style={[styles.primaryBtn, {
              backgroundColor: colors.destructive,
              borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
              borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
              borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
            }]}>
              {phase === 'deleting'
                ? <ActivityIndicator color="#FFF" size="small" />
                : <>
                    <Feather name="trash-2" size={16} color="#FFF" />
                    <Text style={[styles.primaryBtnText, { color: '#FFF' }]}>
                      {'>> DELETE SELECTED'}
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
  content: { padding: 16, gap: 10 },
  center: { alignItems: 'center', paddingTop: 40, gap: 16 },
  fullWidth: { width: '100%' },
  errorBox: { padding: 20, gap: 12, width: '100%' },
  errorTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 2 },
  errorMsg: { fontFamily: 'Inter_400Regular', fontSize: 11, letterSpacing: 0.5, lineHeight: 16 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14 },
  retryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 2 },

  loadBox: { width: '100%', padding: 24, gap: 14, alignItems: 'center' },
  loadTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  loadStatus: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, textAlign: 'center' },

  summaryPanel: { padding: 14, gap: 6 },
  summaryHead: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 4 },
  summaryRow: { flexDirection: 'row' },
  summaryKey: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, width: 120 },
  summarySep: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#444' },
  summaryVal: { fontSize: 11, fontFamily: 'Inter_700Bold' },

  dateHeader: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginBottom: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridItem: { width: '31.5%', aspectRatio: 9 / 16, overflow: 'hidden', position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  selectedOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  checkCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#FFF', fontSize: 14, fontFamily: 'Inter_700Bold' },
  sizeTag: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    fontSize: 8, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 2,
  },

  emptyPanel: { padding: 32, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: 4 },
  emptyTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginTop: 4 },
  emptyDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, textAlign: 'center', lineHeight: 18 },

  doneBox: { width: '100%', padding: 24, gap: 10, alignItems: 'center' },
  doneHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  doneBytes: { fontSize: 40, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  doneSub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },

  outlineBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  outlineBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 10,
  },
  primaryBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  footer: { padding: 16, borderTopWidth: 1, gap: 10 },
  footerSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textAlign: 'center' },
});
