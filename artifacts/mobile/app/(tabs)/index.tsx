import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useCleaner, MediaBreakdown } from '@/context/CleanerContext';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes, formatDelta, formatRelativeDate } from '@/utils/format';
import SegBar from '@/components/SegBar';
import BlinkingCursor from '@/components/BlinkingCursor';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StorageRingChart from '@/components/StorageRingChart';

// ── Health engine ─────────────────────────────────────────────────────────────
// Scores are derived entirely from real device data — no invented numbers.

type HealthTier = 'OPTIMAL' | 'HEALTHY' | 'MODERATE' | 'CRITICAL' | 'UNKNOWN';
const TIER_ORDER: HealthTier[] = ['OPTIMAL', 'HEALTHY', 'MODERATE', 'CRITICAL'];

function worstTier(tiers: HealthTier[]): HealthTier {
  const known = tiers.filter(t => t !== 'UNKNOWN');
  if (!known.length) return 'UNKNOWN';
  return known.reduce(
    (w, t) => TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(w) ? t : w,
    known[0],
  );
}

function storageHealth(usedFrac: number): HealthTier {
  if (usedFrac > 0.85) return 'CRITICAL';
  if (usedFrac > 0.70) return 'MODERATE';
  if (usedFrac > 0.50) return 'HEALTHY';
  return 'OPTIMAL';
}

function cacheHealth(cacheFrac: number): HealthTier {
  if (cacheFrac > 0.12) return 'MODERATE';
  if (cacheFrac > 0.06) return 'HEALTHY';
  return 'OPTIMAL';
}

function screenshotHealth(count: number): HealthTier {
  if (count > 300) return 'MODERATE';
  if (count > 150) return 'HEALTHY';
  return 'OPTIMAL';
}

function downloadHealth(count: number): HealthTier {
  if (count > 200) return 'MODERATE';
  if (count > 100) return 'HEALTHY';
  return 'OPTIMAL';
}

function tierPct(t: HealthTier): number {
  const map: Record<HealthTier, number> = {
    OPTIMAL: 0.12, HEALTHY: 0.44, MODERATE: 0.72, CRITICAL: 1.0, UNKNOWN: 0,
  };
  return map[t];
}

function countRecos(bd: MediaBreakdown | null): number {
  if (!bd) return 0;
  let n = 0;
  const total = bd.images.size + bd.videos.size + bd.audio.size + bd.screenshots.size;
  if (total > 0) {
    if (bd.videos.size / total > 0.5) n++;
    if (bd.screenshots.size / total > 0.1) n++;
    if (bd.downloads.count > 50) n++;
  }
  if (bd.appCache.size > 50 * 1024 * 1024) n++;
  return n;
}

// ── Sub-components ────────────────────────────────────────────────────────────


function ScanButton({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const glowVal = useSharedValue(0.4);

  useEffect(() => {
    glowVal.value = withRepeat(
      withSequence(withTiming(1, { duration: 1000 }), withTiming(0.4, { duration: 1000 })),
      -1, false,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowVal.value * 0.35 }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSpring(0.97, { damping: 12 }, () => { scale.value = withSpring(1); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onPress();
  };

  return (
    <View style={styles.scanWrapper}>
      <Animated.View style={[styles.scanGlow, { backgroundColor: colors.primary }, glowStyle]} />
      <Animated.View style={[styles.scanAnimWrap, btnStyle]}>
        <Pressable onPress={handlePress}>
          <View style={[styles.scanBtn, {
            backgroundColor: colors.primary,
            borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
            borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
          }]}>
            <Feather name="zap" size={20} color={colors.primaryForeground} />
            <Text style={[styles.scanBtnText, { color: colors.primaryForeground }]}>
              {'>> QUICK SCAN'}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const bevel = useBevel();
  const insets = useSafeAreaInsets();
  const {
    storageStats, isLoadingStats, history, totalBytesFreed, refreshStats,
    mediaBreakdown, snapshots,
  } = useCleaner();
  const [refreshing, setRefreshing] = useState(false);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshStats();
    setRefreshing(false);
  }, [refreshStats]);

  // ── Colour mapper ──────────────────────────────────────────────────────────
  const tierColor = useCallback((t: HealthTier): string => {
    switch (t) {
      case 'OPTIMAL':  return colors.success;
      case 'HEALTHY':  return colors.primary;
      case 'MODERATE': return colors.warning;
      case 'CRITICAL': return colors.destructive;
      default:         return colors.mutedForeground;
    }
  }, [colors]);

  // ── Memoised derivations ───────────────────────────────────────────────────
  const recentHistory = useMemo(() => history.slice(0, 5), [history]);

  const usedFrac = useMemo(
    () => storageStats
      ? (storageStats.usedSpace - storageStats.appCacheSize) / storageStats.totalSpace
      : 0,
    [storageStats],
  );
  const cacheFrac = useMemo(
    () => storageStats ? storageStats.appCacheSize / storageStats.totalSpace : 0,
    [storageStats],
  );

  // ── Health tiers ───────────────────────────────────────────────────────────
  const tiers = useMemo(() => ({
    storage:     storageStats    ? storageHealth(usedFrac)                            : 'UNKNOWN' as HealthTier,
    cache:       storageStats    ? cacheHealth(cacheFrac)                             : 'UNKNOWN' as HealthTier,
    screenshots: mediaBreakdown  ? screenshotHealth(mediaBreakdown.screenshots.count) : 'UNKNOWN' as HealthTier,
    downloads:   mediaBreakdown  ? downloadHealth(mediaBreakdown.downloads.count)     : 'UNKNOWN' as HealthTier,
  }), [storageStats, mediaBreakdown, usedFrac, cacheFrac]);

  const overall = useMemo(
    () => worstTier(Object.values(tiers) as HealthTier[]),
    [tiers],
  );

  const dimensions = useMemo(() => [
    {
      key: 'storage', label: 'STORAGE',
      tier: tiers.storage,
      value: storageStats ? formatBytes(storageStats.freeSpace) + ' FREE' : '—',
    },
    {
      key: 'cache', label: 'CACHE',
      tier: tiers.cache,
      value: storageStats ? formatBytes(storageStats.appCacheSize) : '—',
    },
    {
      key: 'shots', label: 'SCREENSHOTS',
      tier: tiers.screenshots,
      value: mediaBreakdown ? `${mediaBreakdown.screenshots.count} FILES` : "UNSCAN'D",
    },
    {
      key: 'dl', label: 'DOWNLOADS',
      tier: tiers.downloads,
      value: mediaBreakdown ? `${mediaBreakdown.downloads.count} FILES` : "UNSCAN'D",
    },
  ], [tiers, storageStats, mediaBreakdown]);

  const storageDelta = useMemo(
    () => snapshots.length >= 2 ? snapshots[0].usedSpace - snapshots[1].usedSpace : null,
    [snapshots],
  );
  const lastScanAge = useMemo(
    () => snapshots.length ? formatRelativeDate(snapshots[0].timestamp) : null,
    [snapshots],
  );
  const recoCount = useMemo(() => countRecos(mediaBreakdown), [mediaBreakdown]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20 + webTopPad, paddingBottom: insets.bottom + 100 + webBottomPad },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.sysLabel, { color: colors.mutedForeground }]}>
            {'> SYS v1.0 / ANDROID'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.appName, { color: colors.primary }]}>CLEANDROID</Text>
            <BlinkingCursor color={colors.primary} />
          </View>
        </View>
        <Pressable
          style={[styles.settingsBtn, bevel, { backgroundColor: colors.card }]}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Feather name="settings" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* ── Divider ── */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* ── Storage Map ── */}
      <View style={[styles.storageCard, bevel, { backgroundColor: colors.card }]}>
        {storageStats && !isLoadingStats ? (
          <StorageRingChart
            totalSpace={storageStats.totalSpace}
            usedSpace={storageStats.usedSpace}
            junkSize={storageStats.appCacheSize}
          />
        ) : (
          <View style={styles.loading}>
            <SegBar value={0.6} color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              {'> READING DISK...'}
            </Text>
          </View>
        )}
      </View>

      {/* ── Scan Button ── */}
      <ScanButton onPress={() => router.push('/(tabs)/clean')} />

      {/* ── Stat row ── */}
      {storageStats && (
        <View style={styles.statRow}>
          {[
            { label: 'CACHE', value: formatBytes(storageStats.appCacheSize), color: colors.accent, pct: cacheFrac },
            {
              label: 'FREED', value: formatBytes(totalBytesFreed), color: colors.primary,
              pct: Math.min(1, totalBytesFreed / (storageStats.totalSpace || 1)),
            },
            { label: 'SCANS', value: String(history.length), color: colors.success, pct: Math.min(1, history.length / 20) },
          ].map(s => (
            <View key={s.label} style={[styles.statBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <SegBar value={s.pct} color={s.color} total={10} />
            </View>
          ))}
        </View>
      )}

      {/* ── Device Status ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {'── DEVICE STATUS ─────────────────'}
        </Text>
        <View style={[styles.statusCard, bevel, { backgroundColor: colors.card }]}>

          {/* Overall health header */}
          <View style={[styles.statusHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.overallBadge, { color: tierColor(overall) }]}>
                {'[' + overall + ']'}
              </Text>
              <Text style={[styles.overallLabel, { color: colors.mutedForeground }]}>
                DEVICE HEALTH
              </Text>
            </View>
            {lastScanAge && (
              <View style={styles.statusRight}>
                {storageDelta !== null && (
                  <Text style={[styles.deltaText, { color: storageDelta > 0 ? colors.accent : colors.success }]}>
                    {formatDelta(storageDelta)} STORAGE
                  </Text>
                )}
                <Text style={[styles.lastScanText, { color: colors.mutedForeground }]}>
                  {'LAST SCAN: ' + lastScanAge.toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Per-dimension rows */}
          {dimensions.map((d, idx) => {
            const tc = tierColor(d.tier);
            const pct = tierPct(d.tier);
            const isLast = idx === dimensions.length - 1;
            return (
              <View
                key={d.key}
                style={[
                  styles.dimRow,
                  !isLast && { borderBottomColor: colors.border, borderBottomWidth: 1 },
                ]}
              >
                <Text style={[styles.dimPrompt, { color: colors.primary }]}>{'>'}</Text>
                <View style={styles.dimMain}>
                  <View style={styles.dimTop}>
                    <Text style={[styles.dimKey, { color: colors.mutedForeground }]}>{d.label}</Text>
                    <Text style={[styles.dimTier, { color: tc }]}>
                      {d.tier === 'UNKNOWN' ? '[?]' : '[' + d.tier + ']'}
                    </Text>
                  </View>
                  <View style={styles.dimBottom}>
                    <View style={{ flex: 1 }}>
                      <SegBar
                        value={pct}
                        color={d.tier === 'UNKNOWN' ? colors.border : tc}
                        total={14}
                        height={4}
                      />
                    </View>
                    <Text style={[styles.dimValue, { color: colors.mutedForeground }]}>
                      {d.value}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Recommendations footer */}
          {recoCount > 0 ? (
            <Pressable
              onPress={() => router.push('/storage-intel')}
              style={[styles.recoRow, { borderTopColor: colors.border }]}
            >
              <Feather name="alert-triangle" size={11} color={colors.accent} />
              <Text style={[styles.recoText, { color: colors.accent }]}>
                {'[!] ' + recoCount + ' RECOMMENDATION' + (recoCount !== 1 ? 'S' : '') + ' — VIEW ANALYSIS'}
              </Text>
              <Text style={[styles.recoArrow, { color: colors.mutedForeground }]}>{'→'}</Text>
            </Pressable>
          ) : !mediaBreakdown ? (
            <Pressable
              onPress={() => router.push('/storage-intel')}
              style={[styles.recoRow, { borderTopColor: colors.border }]}
            >
              <Text style={[styles.dimPrompt, { color: colors.mutedForeground }]}>{'>'}</Text>
              <Text style={[styles.recoText, { color: colors.mutedForeground }]}>
                RUN STORAGE INTELLIGENCE FOR FULL ANALYSIS
              </Text>
              <Text style={[styles.recoArrow, { color: colors.mutedForeground }]}>{'→'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Activity Log ── */}
      {recentHistory.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {'── ACTIVITY LOG ──────────────────'}
          </Text>
          <View style={[styles.logCard, bevel, { backgroundColor: colors.card }]}>
            {recentHistory.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.logRow,
                  idx < recentHistory.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.logPrefix, { color: colors.primary }]}>{'>'}</Text>
                <View style={styles.logContent}>
                  <Text style={[styles.logLabel, { color: colors.foreground }]} numberOfLines={1}>
                    {item.label.toUpperCase()}
                  </Text>
                  <Text style={[styles.logDate, { color: colors.mutedForeground }]}>
                    {formatRelativeDate(item.date)}
                  </Text>
                </View>
                <Text style={[styles.logSize, { color: colors.accent }]}>
                  {item.bytesFreed > 0 ? '+' + formatBytes(item.bytesFreed) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  sysLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 2, marginBottom: 2 },
  appName: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  settingsBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  divider: { height: 1, marginBottom: 16 },

  // Storage map
  storageCard: {
    padding: 16, marginBottom: 16,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  loading: { gap: 12, paddingVertical: 20 },
  loadingText: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  // Scan button
  scanWrapper: { alignItems: 'center', marginBottom: 20, position: 'relative' },
  scanGlow: { position: 'absolute', width: '100%', height: 52, top: 0 },
  scanAnimWrap: { width: '100%' },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, gap: 10,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  scanBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  // Stat row
  statRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  statBox: {
    flex: 1, padding: 10, gap: 5,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  statLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  statValue: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  // Shared section wrapper
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginBottom: 6 },

  // Device Status card
  statusCard: {
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
    overflow: 'hidden',
  },
  statusHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, borderBottomWidth: 1,
  },
  overallBadge: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  overallLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginTop: 3 },
  statusRight: { alignItems: 'flex-end', gap: 3 },
  deltaText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  lastScanText: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  dimPrompt: { fontSize: 12, fontFamily: 'Inter_700Bold', width: 12 },
  dimMain: { flex: 1, gap: 4 },
  dimTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dimKey: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  dimTier: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  dimBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dimValue: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, minWidth: 72, textAlign: 'right' },
  recoRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderTopWidth: 1 },
  recoText: { flex: 1, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  recoArrow: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  // Activity log
  logCard: {
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
    overflow: 'hidden',
  },
  logRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  logPrefix: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  logContent: { flex: 1 },
  logLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  logDate: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginTop: 2 },
  logSize: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
});
