import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useCleaner } from '@/context/CleanerContext';
import ToolCard from '@/components/ToolCard';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

export default function CleanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { storageStats, mediaBreakdown } = useCleaner();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  // Real app cache size from storageStats (not estimated)
  const cacheBadge = storageStats?.appCacheSize
    ? formatBytes(storageStats.appCacheSize)
    : undefined;

  // Screenshot count from last media scan
  const ssBadge = mediaBreakdown
    ? `${mediaBreakdown.screenshots.count} files`
    : undefined;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20 + webTopPad, paddingBottom: insets.bottom + 100 + webBottomPad },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Text style={[styles.sysLabel, { color: colors.mutedForeground }]}>{'> MODULE SELECT'}</Text>
      <Text style={[styles.heading, { color: colors.foreground }]}>{'// CLEANING TOOLS'}</Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        ALL FEATURES FREE — NO SUBSCRIPTIONS
      </Text>

      {/* Section: Storage Analysis */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>
          {'── STORAGE ANALYSIS ─────────────────'}
        </Text>
        <ToolCard
          title="Storage Intelligence"
          description="Real breakdown of storage by images, videos, audio, screenshots & downloads"
          icon="bar-chart-2"
          gradientColors={[colors.primary, colors.primary]}
          badge={mediaBreakdown ? `${mediaBreakdown.totalScanned} items` : undefined}
          onPress={() => router.push('/storage-intel')}
        />
        <ToolCard
          title="Screenshot Manager"
          description="Browse, select and delete screenshots from your Screenshots album"
          icon="monitor"
          gradientColors={[colors.success, colors.success]}
          badge={ssBadge}
          onPress={() => router.push('/screenshot-manager')}
        />
      </View>

      {/* Section: Junk Removal */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>
          {'── JUNK REMOVAL ─────────────────────'}
        </Text>
        <ToolCard
          title="Junk Cleaner"
          description="Scans app cache, large downloads & old videos — real files only"
          icon="trash-2"
          gradientColors={[colors.primary, colors.primary]}
          badge={cacheBadge}
          onPress={() => router.push('/junk-cleaner')}
        />
        <ToolCard
          title="Cache Cleaner"
          description="Auto-clears own cache, Smart Sweep for system app caches"
          icon="cpu"
          gradientColors={[colors.accent, colors.accent]}
          badge={cacheBadge}
          onPress={() => router.push('/app-cache')}
        />
      </View>

      {/* Section: File Analysis */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>
          {'── FILE ANALYSIS ────────────────────'}
        </Text>
        <ToolCard
          title="Duplicate Finder"
          description="Groups photos & media with matching filenames or dimensions"
          icon="copy"
          gradientColors={['#39FF14', '#39FF14']}
          onPress={() => router.push('/duplicate-finder')}
        />
        <ToolCard
          title="Large File Scanner"
          description="Find the biggest media files by estimated size — sort, filter, delete"
          icon="hard-drive"
          gradientColors={['#FFB800', '#FFB800']}
          onPress={() => router.push('/large-files')}
        />
      </View>

      {/* Transparency note */}
      <View style={[styles.tipCard, {
        backgroundColor: colors.card,
        borderTopColor: colors.bevelLight,
        borderLeftColor: colors.bevelLight,
        borderBottomColor: colors.bevelDark,
        borderRightColor: colors.bevelDark,
      }]}>
        <Text style={[styles.tipHead, { color: colors.primary }]}>{'[!] ANDROID LIMITS'}</Text>
        <Text style={[styles.tipText, { color: colors.mutedForeground }]}>
          {'> '} Modern Android restricts filesystem access. All scans use real MediaLibrary and FileSystem APIs — no fake results. Video and image sizes are estimated from dimensions.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  sysLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 2, marginBottom: 4 },
  heading: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 10 },
  divider: { height: 1, marginBottom: 10 },
  sub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, marginBottom: 24 },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginBottom: 10 },
  tipCard: {
    padding: 14, gap: 8, marginBottom: 8,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  tipHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  tipText: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 18 },
});
