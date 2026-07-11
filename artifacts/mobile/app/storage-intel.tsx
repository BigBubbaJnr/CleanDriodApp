/**
 * Storage Intelligence — real MediaLibrary breakdown + trend comparison.
 *
 * After each scan, saves a ScanSnapshot to context (persisted).
 * On re-scan, compares with the most recent previous snapshot and shows
 * delta values: used space Δ, category Δ.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useCleaner, MediaBreakdown, ScanSnapshot } from '@/context/CleanerContext';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '-';
  return `${sign}${formatBytes(Math.abs(delta))}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase();
}

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'TODAY';
  if (d === 1) return 'YESTERDAY';
  if (d < 7) return `${d} DAYS AGO`;
  if (d < 30) return `${Math.floor(d / 7)} WEEKS AGO`;
  return `${Math.floor(d / 30)} MONTHS AGO`;
}

function getRecommendation(bd: MediaBreakdown): string[] {
  const recos: string[] = [];
  const totalMediaSize = bd.images.size + bd.videos.size + bd.audio.size + bd.screenshots.size;
  if (totalMediaSize > 0) {
    const videoPct = bd.videos.size / totalMediaSize;
    if (videoPct > 0.5) recos.push(`Videos are ${Math.round(videoPct * 100)}% of media — review old recordings`);
    const ssPct = bd.screenshots.size / totalMediaSize;
    if (ssPct > 0.1) recos.push(`${bd.screenshots.count} screenshots taking ~${formatBytes(bd.screenshots.size)} — use Screenshot Manager`);
    if (bd.downloads.count > 50) recos.push(`${bd.downloads.count} items in Downloads — Junk Cleaner can clear large ones`);
  }
  if (bd.appCache.size > 50 * 1024 * 1024) recos.push(`App cache is ${formatBytes(bd.appCache.size)} — Cache Cleaner can clear it`);
  if (recos.length === 0) recos.push('Storage looks healthy — no immediate action needed');
  return recos;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SegBar({ value, color, total = 20 }: { value: number; color: string; total?: number }) {
  const colors = useColors();
  const filled = Math.max(0, Math.min(total, Math.round(value * total)));
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 6, backgroundColor: i < filled ? color : colors.border }} />
      ))}
    </View>
  );
}

function TerminalLog({ lines }: { lines: string[] }) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [lines.length]);
  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.termBox, { backgroundColor: colors.muted, borderColor: colors.border }]}
      contentContainerStyle={{ padding: 10, gap: 3 }}
      showsVerticalScrollIndicator={false}
    >
      {lines.map((line, i) => (
        <Text key={i} style={[styles.termLine, { color: colors.mutedForeground }]}>{line}</Text>
      ))}
    </ScrollView>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

interface CategoryRow {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  count: number;
  size: number;
  color: string;
  prevSize?: number;
  action?: () => void;
  actionLabel?: string;
  isSubset?: boolean; // e.g. Downloads is a subset of images+videos
}

export default function StorageIntelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { storageStats, mediaBreakdown, snapshots, scanMediaLibrary, addScanSnapshot } = useCleaner();

  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, `> ${msg}`]);
  }, []);

  const runScan = useCallback(async () => {
    setScanning(true);
    setProgress(0);
    setLogs([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const bd = await scanMediaLibrary(
      pct => setProgress(pct),
      msg => addLog(msg),
    );

    // Save snapshot for trend tracking
    if (bd && storageStats) {
      await addScanSnapshot({
        timestamp: new Date().toISOString(),
        totalSpace: storageStats.totalSpace,
        usedSpace: storageStats.usedSpace,
        freeSpace: storageStats.freeSpace,
        appCacheSize: storageStats.appCacheSize,
        mediaItemCount: bd.totalScanned,
        imageSize: bd.images.size,
        videoSize: bd.videos.size,
        audioSize: bd.audio.size,
        screenshotSize: bd.screenshots.size,
      });
    }

    setScanning(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [scanMediaLibrary, addLog, addScanSnapshot, storageStats]);

  const bevelRaised = {
    borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
    borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  };

  // Previous snapshot (second in array, since new one was just added)
  const prevSnap: ScanSnapshot | null = snapshots.length >= 2 ? snapshots[1] : null;
  const currentSnap: ScanSnapshot | null = snapshots.length >= 1 ? snapshots[0] : null;

  const total = storageStats?.totalSpace ?? 1;
  const used = storageStats?.usedSpace ?? 0;
  const free = storageStats?.freeSpace ?? 0;

  const categories: CategoryRow[] = mediaBreakdown ? [
    {
      key: 'images', label: 'IMAGES', icon: 'image', color: colors.primary,
      count: mediaBreakdown.images.count, size: mediaBreakdown.images.size,
      prevSize: prevSnap?.imageSize,
    },
    {
      key: 'videos', label: 'VIDEOS', icon: 'film', color: colors.accent,
      count: mediaBreakdown.videos.count, size: mediaBreakdown.videos.size,
      prevSize: prevSnap?.videoSize,
      action: () => router.push('/large-files'), actionLabel: 'VIEW →',
    },
    {
      key: 'audio', label: 'AUDIO', icon: 'music', color: colors.warning,
      count: mediaBreakdown.audio.count, size: mediaBreakdown.audio.size,
      prevSize: prevSnap?.audioSize,
    },
    {
      key: 'screenshots', label: 'SCREENSHOTS', icon: 'monitor', color: colors.success,
      count: mediaBreakdown.screenshots.count, size: mediaBreakdown.screenshots.size,
      prevSize: prevSnap?.screenshotSize,
      action: () => router.push('/screenshot-manager'), actionLabel: 'MANAGE →',
    },
    {
      key: 'downloads', label: 'DOWNLOADS*', icon: 'download', color: '#7B7BFF',
      count: mediaBreakdown.downloads.count, size: mediaBreakdown.downloads.size,
      action: () => router.push('/junk-cleaner'), actionLabel: 'CLEAN →',
      isSubset: true,
    },
    {
      key: 'appCache', label: 'APP CACHE', icon: 'cpu', color: colors.destructive,
      count: 1, size: mediaBreakdown.appCache.size,
      action: () => router.push('/app-cache'), actionLabel: 'CLEAN →',
    },
  ] : [];

  const nonSubsetCats = categories.filter(c => !c.isSubset && c.key !== 'appCache');
  const totalMediaSize = nonSubsetCats.reduce((acc, c) => acc + c.size, 0);

  const recommendations = mediaBreakdown ? getRecommendation(mediaBreakdown) : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, {
        paddingTop: insets.top + 12 + webTopPad,
        backgroundColor: colors.background,
        borderBottomColor: colors.primary + '40',
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, bevelRaised, { backgroundColor: colors.card }]}>
          <Feather name="arrow-left" size={16} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{'> ANALYSIS'}</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>STORAGE INTEL</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 + webBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Disk stats ── */}
        {storageStats && (
          <Animated.View entering={FadeIn} style={[styles.diskPanel, bevelRaised, { backgroundColor: colors.card }]}>
            <Text style={[styles.panelHead, { color: colors.primary }]}>{'[DISK STATUS]'}</Text>
            {[
              { key: 'TOTAL', val: formatBytes(total), color: colors.foreground, delta: null },
              {
                key: 'USED', val: formatBytes(used), color: colors.accent,
                delta: prevSnap ? used - prevSnap.usedSpace : null,
              },
              {
                key: 'FREE', val: formatBytes(free), color: colors.success,
                delta: prevSnap ? free - prevSnap.freeSpace : null,
              },
            ].map(row => (
              <View key={row.key} style={styles.diskRow}>
                <Text style={[styles.diskKey, { color: colors.mutedForeground }]}>{row.key}</Text>
                <Text style={styles.diskSep}>{' = '}</Text>
                <Text style={[styles.diskVal, { color: row.color }]}>{row.val}</Text>
                {row.delta !== null && Math.abs(row.delta) > 100_000 && (
                  <Text style={[styles.diskDelta, {
                    color: row.key === 'USED'
                      ? (row.delta > 0 ? colors.destructive : colors.success)
                      : (row.delta > 0 ? colors.success : colors.destructive),
                  }]}>
                    {' '}{formatDelta(row.delta)}
                  </Text>
                )}
              </View>
            ))}
            <View style={{ marginTop: 10, gap: 4 }}>
              <SegBar value={used / total} color={colors.accent} total={30} />
              <View style={styles.barLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                    USED {Math.round((used / total) * 100)}%
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
                  <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                    FREE {Math.round((free / total) * 100)}%
                  </Text>
                </View>
                {prevSnap && (
                  <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                    vs {daysAgo(prevSnap.timestamp)}
                  </Text>
                )}
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Scan button ── */}
        {!scanning && (
          <Pressable onPress={runScan} style={styles.fullWidth}>
            <View style={[styles.primaryBtn, {
              backgroundColor: colors.primary,
              borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
              borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
              borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
            }]}>
              <Feather name="bar-chart-2" size={16} color={colors.primaryForeground} />
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                {mediaBreakdown ? '>> RE-SCAN STORAGE' : '>> ANALYSE STORAGE'}
              </Text>
            </View>
          </Pressable>
        )}

        {/* ── Scanning ── */}
        {scanning && (
          <Animated.View entering={FadeIn} style={[styles.scanPanel, bevelRaised, { backgroundColor: colors.card }]}>
            <Text style={[styles.scanTitle, { color: colors.primary }]}>{'[ANALYSING...]'}</Text>
            <Text style={[styles.scanPct, { color: colors.primary }]}>
              {String(progress).padStart(3, '0')}%
            </Text>
            <SegBar value={progress / 100} color={colors.primary} total={30} />
            <TerminalLog lines={logs} />
          </Animated.View>
        )}

        {/* ── Breakdown ── */}
        {mediaBreakdown && !scanning && (
          <Animated.View entering={FadeIn} style={{ gap: 10 }}>
            {/* Last scanned */}
            {mediaBreakdown.lastScanned && (
              <Text style={[styles.lastScanned, { color: colors.mutedForeground }]}>
                {'> LAST SCANNED: '}{formatDate(mediaBreakdown.lastScanned)}
                {'  ·  '}{mediaBreakdown.totalScanned} ITEMS
                {prevSnap && `  ·  PREV: ${daysAgo(prevSnap.timestamp)}`}
              </Text>
            )}

            {/* Recommendations */}
            <View style={[styles.recoPanel, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.panelHead, { color: colors.primary }]}>{'[RECOMMENDATIONS]'}</Text>
              {recommendations.map((r, i) => (
                <Text key={i} style={[styles.recoLine, { color: colors.mutedForeground }]}>
                  {'> '}{r}
                </Text>
              ))}
            </View>

            {/* Category list */}
            <View style={[styles.catPanel, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.panelHead, { color: colors.primary }]}>
                {'[MEDIA BREAKDOWN]'}
                <Text style={[styles.estNote, { color: colors.mutedForeground }]}>{' · sizes estimated'}</Text>
              </Text>

              {categories.map((cat, idx) => {
                const delta = (cat.prevSize !== undefined && cat.prevSize !== null)
                  ? cat.size - cat.prevSize : null;
                const share = totalMediaSize > 0 && !cat.isSubset ? cat.size / totalMediaSize : 0;
                return (
                  <View
                    key={cat.key}
                    style={[
                      styles.catRow,
                      idx < categories.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      cat.isSubset && { opacity: 0.75 },
                    ]}
                  >
                    <View style={[styles.catIconBox, { borderColor: cat.color + '40' }]}>
                      <Feather name={cat.icon} size={13} color={cat.color} />
                    </View>
                    <View style={styles.catInfo}>
                      <View style={styles.catTopRow}>
                        <Text style={[styles.catLabel, { color: cat.isSubset ? colors.mutedForeground : colors.foreground }]}>
                          {cat.label}
                        </Text>
                        <View style={styles.catTopRight}>
                          {delta !== null && Math.abs(delta) > 500_000 && (
                            <Text style={[styles.catDelta, {
                              color: delta > 0 ? colors.destructive : colors.success,
                            }]}>
                              {formatDelta(delta)}{'  '}
                            </Text>
                          )}
                          {cat.action && (
                            <Pressable onPress={cat.action}>
                              <Text style={[styles.catAction, { color: cat.color }]}>{cat.actionLabel}</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                      <View style={styles.catBottomRow}>
                        {cat.key !== 'appCache' && (
                          <Text style={[styles.catCount, { color: colors.mutedForeground }]}>
                            {cat.count.toLocaleString()} items{cat.isSubset ? '*' : ''}{' · '}
                          </Text>
                        )}
                        <Text style={[styles.catSize, { color: cat.color }]}>~{formatBytes(cat.size)}</Text>
                      </View>
                      {share > 0 && (
                        <View style={{ marginTop: 5 }}>
                          <SegBar value={share} color={cat.color} total={20} />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Transparency note */}
            <View style={[styles.noteBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.noteTitle, { color: colors.primary }]}>{'[!] ABOUT THESE NUMBERS'}</Text>
              <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
                {'> '} Sizes estimated from image dimensions and video duration. Android does not expose exact file sizes to third-party apps without root.{'\n'}
                {'> '} DOWNLOADS* is a subset of Images+Videos — not additive. Bar proportions show share of total media only.
              </Text>
            </View>

            {/* Snapshot history */}
            {snapshots.length > 1 && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.lastScanned, { color: colors.mutedForeground }]}>
                  {'── SCAN HISTORY ──────────────────────'}
                </Text>
                <View style={[styles.snapPanel, bevelRaised, { backgroundColor: colors.card }]}>
                  {snapshots.slice(0, 5).map((snap, idx) => (
                    <View
                      key={snap.id}
                      style={[
                        styles.snapRow,
                        idx < Math.min(snapshots.length, 5) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.snapDate, { color: colors.mutedForeground }]}>
                        {formatDate(snap.timestamp)}
                      </Text>
                      <Text style={[styles.snapUsed, { color: colors.accent }]}>
                        {formatBytes(snap.usedSpace)} used
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Empty state ── */}
        {!mediaBreakdown && !scanning && (
          <View style={[styles.emptyPanel, bevelRaised, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>{'[ _ ]'}</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>NO ANALYSIS YET</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Tap Analyse Storage to scan your media library and get a real breakdown by category
            </Text>
          </View>
        )}
      </ScrollView>
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
  content: { padding: 16, gap: 12 },
  fullWidth: { width: '100%' },

  diskPanel: { padding: 14, gap: 6 },
  panelHead: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 6 },
  estNote: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  diskRow: { flexDirection: 'row', alignItems: 'center' },
  diskKey: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, width: 60 },
  diskSep: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#444' },
  diskVal: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  diskDelta: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  barLegend: { flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8 },
  legendText: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 10,
  },
  primaryBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  scanPanel: { padding: 16, gap: 14 },
  scanTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  scanPct: { fontSize: 40, fontFamily: 'Inter_700Bold', letterSpacing: 2, textAlign: 'center' },
  termBox: { maxHeight: 140, borderWidth: 1 },
  termLine: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },

  lastScanned: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  recoPanel: { padding: 14, gap: 6 },
  recoLine: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  catPanel: { overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  catIconBox: { width: 30, height: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  catInfo: { flex: 1, gap: 2 },
  catTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  catTopRight: { flexDirection: 'row', alignItems: 'center' },
  catDelta: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  catAction: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  catBottomRow: { flexDirection: 'row', alignItems: 'center' },
  catCount: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },
  catSize: { fontSize: 10, fontFamily: 'Inter_700Bold' },

  noteBox: { borderWidth: 1, padding: 12, gap: 6 },
  noteTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 4 },
  noteText: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 16 },

  snapPanel: { overflow: 'hidden' },
  snapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10 },
  snapDate: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  snapUsed: { fontSize: 10, fontFamily: 'Inter_700Bold' },

  emptyPanel: { padding: 32, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: 4 },
  emptyTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginTop: 4 },
  emptyDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, textAlign: 'center', lineHeight: 18 },
});
