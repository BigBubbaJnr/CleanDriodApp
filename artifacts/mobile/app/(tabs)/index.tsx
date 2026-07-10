import React, { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
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
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StorageRingChart from '@/components/StorageRingChart';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function ScanButton({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(withTiming(0.7, { duration: 1200 }), withTiming(0.3, { duration: 1200 })),
      -1,
      false
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: 1.3 + glowOpacity.value * 0.2 }],
  }));

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.95, { damping: 15 }, () => {
      scale.value = withSpring(1);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onPress();
  };

  return (
    <View style={styles.scanWrapper}>
      <Animated.View
        style={[
          styles.scanGlow,
          { backgroundColor: colors.primary + '40' },
          glowStyle,
        ]}
      />
      <Animated.View style={btnStyle}>
        <Pressable onPress={handlePress}>
          <LinearGradient
            colors={[colors.primary, '#4ECDC4']}
            style={styles.scanButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Feather name="zap" size={26} color="#FFFFFF" />
            <Text style={styles.scanButtonText}>Quick Scan</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { storageStats, isLoadingStats, history, totalBytesFreed, refreshStats } = useCleaner();

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshStats();
    setRefreshing(false);
  }, [refreshStats]);

  const recentHistory = history.slice(0, 3);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 16 + webTopPad,
          paddingBottom: insets.bottom + 100 + webBottomPad,
        },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Welcome back</Text>
          <Text style={[styles.appName, { color: colors.foreground }]}>CleanDroid</Text>
        </View>
        <Pressable
          style={[styles.settingsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Feather name="settings" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Storage Ring */}
      <View style={[styles.storageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {storageStats && !isLoadingStats ? (
          <StorageRingChart
            totalSpace={storageStats.totalSpace}
            usedSpace={storageStats.usedSpace}
            junkSize={storageStats.junkEstimate}
            size={200}
          />
        ) : (
          <View style={styles.loadingRing}>
            <View style={[styles.loadingCircle, { borderColor: colors.border }]} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Scanning storage...</Text>
          </View>
        )}
      </View>

      {/* Scan Button */}
      <ScanButton onPress={() => router.push('/(tabs)/clean')} />

      {/* Stats row */}
      {storageStats && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LinearGradient colors={[colors.primary, '#9B8FFF']} style={styles.statIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather name="trash-2" size={14} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {storageStats ? formatBytes(storageStats.junkEstimate) : '--'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Junk Files</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LinearGradient colors={[colors.accent, '#00A896']} style={styles.statIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather name="check-circle" size={14} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {formatBytes(totalBytesFreed)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Cleaned Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LinearGradient colors={['#FFA94D', '#FF6348']} style={styles.statIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather name="activity" size={14} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {history.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Scans Run</Text>
          </View>
        </View>
      )}

      {/* Recent Activity */}
      {recentHistory.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Activity</Text>
          <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {recentHistory.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.activityItem,
                  idx < recentHistory.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.activityIcon, { backgroundColor: colors.primary + '20' }]}>
                  <Feather name="check" size={14} color={colors.primary} />
                </View>
                <View style={styles.activityContent}>
                  <Text style={[styles.activityLabel, { color: colors.foreground }]}>{item.label}</Text>
                  <Text style={[styles.activityDate, { color: colors.mutedForeground }]}>
                    {formatDate(item.date)}
                  </Text>
                </View>
                <Text style={[styles.activitySize, { color: colors.accent }]}>
                  {formatBytes(item.bytesFreed)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Empty state for history */}
      {history.length === 0 && (
        <View style={[styles.emptyHistory, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="zap" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No scans yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Tap Quick Scan to find junk and free up space
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  appName: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    marginTop: 2,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  storageCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingRing: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 20,
  },
  loadingText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  scanWrapper: {
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  scanGlow: {
    position: 'absolute',
    width: 180,
    height: 60,
    borderRadius: 30,
    top: 0,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 20,
    gap: 10,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 10,
  },
  activityCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: { flex: 1 },
  activityLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  activityDate: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  activitySize: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyHistory: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
});
