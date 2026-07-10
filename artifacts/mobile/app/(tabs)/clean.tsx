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
  const { storageStats } = useCleaner();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

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

      {/* Section: Remove Junk */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>
          {'── JUNK REMOVAL ─────────────────────'}
        </Text>
        <ToolCard
          title="Junk Cleaner"
          description="Old APKs, empty folders, temp files & leftover downloads"
          icon="trash-2"
          gradientColors={[colors.primary, colors.primary]}
          badge={storageStats ? formatBytes(storageStats.junkEstimate) : undefined}
          onPress={() => router.push('/junk-cleaner')}
        />
        <ToolCard
          title="Cache Cleaner"
          description="Auto-clears accessible caches, Smart Sweep for system apps"
          icon="cpu"
          gradientColors={[colors.accent, colors.accent]}
          onPress={() => router.push('/app-cache')}
        />
      </View>

      {/* Section: Find & Remove */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>
          {'── FILE ANALYSIS ────────────────────'}
        </Text>
        <ToolCard
          title="Duplicate Finder"
          description="Scans photos & files for exact duplicates wasting space"
          icon="copy"
          gradientColors={['#39FF14', '#39FF14']}
          onPress={() => router.push('/duplicate-finder')}
        />
        <ToolCard
          title="Large File Scanner"
          description="Find the biggest files hogging your storage"
          icon="hard-drive"
          gradientColors={['#FFB800', '#FFB800']}
          onPress={() => router.push('/large-files')}
        />
      </View>

      {/* Pro tip — retro terminal style */}
      <View style={[styles.tipCard, {
        backgroundColor: colors.card,
        borderTopColor: colors.bevelLight,
        borderLeftColor: colors.bevelLight,
        borderBottomColor: colors.bevelDark,
        borderRightColor: colors.bevelDark,
      }]}>
        <Text style={[styles.tipHead, { color: colors.primary }]}>{'[!] SYS TIP'}</Text>
        <Text style={[styles.tipText, { color: colors.mutedForeground }]}>
          {'> '} Run Junk Cleaner first, then Duplicate Finder. Most users recover 500 MB+ on first scan.
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
    padding: 14, gap: 8,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  tipHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  tipText: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 18 },
});
