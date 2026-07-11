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
import { useCleaner } from '@/context/CleanerContext';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes, formatRelativeDate } from '@/utils/format';
import SegBar from '@/components/SegBar';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StorageRingChart from '@/components/StorageRingChart';

/** Blinking cursor for the app name */
function BlinkCursor({ color }: { color: string }) {
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setVis(v => !v), 530);
    return () => clearInterval(id);
  }, []);
  return <Text style={{ color, opacity: vis ? 1 : 0, fontSize: 26, fontFamily: 'Inter_700Bold' }}>_</Text>;
}

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

export default function HomeScreen() {
  const colors = useColors();
  const bevel = useBevel();
  const insets = useSafeAreaInsets();
  const { storageStats, isLoadingStats, history, totalBytesFreed, refreshStats } = useCleaner();
  const [refreshing, setRefreshing] = useState(false);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshStats();
    setRefreshing(false);
  }, [refreshStats]);

  // Memoised derivations — avoid recalculating on every render
  const recentHistory = useMemo(() => history.slice(0, 5), [history]);
  const usedPct = useMemo(
    () => storageStats
      ? (storageStats.usedSpace - storageStats.appCacheSize) / storageStats.totalSpace
      : 0,
    [storageStats],
  );
  const junkPct = useMemo(
    () => storageStats ? storageStats.appCacheSize / storageStats.totalSpace : 0,
    [storageStats],
  );

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
            <BlinkCursor color={colors.primary} />
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
            { label: 'CACHE', value: formatBytes(storageStats.appCacheSize), color: colors.accent, pct: junkPct },
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
                style={[styles.logRow, idx < recentHistory.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
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
                  +{formatBytes(item.bytesFreed)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Empty state ── */}
      {history.length === 0 && (
        <View style={[styles.emptyBox, bevel, { backgroundColor: colors.card }]}>
          <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>{'[ _ ]'}</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>NO SCANS YET</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Tap Quick Scan to analyse your storage and find space to reclaim
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  sysLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 2, marginBottom: 2 },
  appName: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  settingsBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  divider: { height: 1, marginBottom: 16 },
  storageCard: {
    padding: 16, marginBottom: 16,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  loading: { gap: 12, paddingVertical: 20 },
  loadingText: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1 },
  scanWrapper: { alignItems: 'center', marginBottom: 20, position: 'relative' },
  scanGlow: { position: 'absolute', width: '100%', height: 52, top: 0 },
  scanAnimWrap: { width: '100%' },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, gap: 10,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  scanBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  statRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  statBox: {
    flex: 1, padding: 10, gap: 5,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  statLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  statValue: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginBottom: 6 },
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
  emptyBox: {
    padding: 32, alignItems: 'center', gap: 8,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  emptyIcon: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: 4 },
  emptyTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginTop: 4 },
  emptyText: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, textAlign: 'center', lineHeight: 18 },
});
