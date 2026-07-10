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
        {
          paddingTop: insets.top + 16 + webTopPad,
          paddingBottom: insets.bottom + 100 + webBottomPad,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>Cleaning Tools</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        All features are free — no subscriptions required
      </Text>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>REMOVE JUNK</Text>

        <ToolCard
          title="Junk Cleaner"
          description="Old APKs, empty folders, temp files & leftover downloads"
          icon="trash-2"
          gradientColors={[colors.primary, '#9B8FFF']}
          badge={storageStats ? formatBytes(storageStats.junkEstimate) : undefined}
          onPress={() => router.push('/junk-cleaner')}
        />

        <ToolCard
          title="App Cache Guide"
          description="See which apps are hoarding cache and clear them with one tap"
          icon="cpu"
          gradientColors={['#FFA94D', '#FF6348']}
          onPress={() => router.push('/app-cache')}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FIND & REMOVE</Text>

        <ToolCard
          title="Duplicate Finder"
          description="Scan photos & files for exact duplicates wasting space"
          icon="copy"
          gradientColors={['#51CF66', '#00C9A7']}
          onPress={() => router.push('/duplicate-finder')}
        />

        <ToolCard
          title="Large File Scanner"
          description="Find the biggest files hogging your storage"
          icon="hard-drive"
          gradientColors={['#339AF0', '#7B6EFA']}
          onPress={() => router.push('/large-files')}
        />
      </View>

      <View style={[styles.tipCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.tipIcon, { color: colors.accent }]}>💡</Text>
        <View style={styles.tipContent}>
          <Text style={[styles.tipTitle, { color: colors.foreground }]}>Pro tip</Text>
          <Text style={[styles.tipText, { color: colors.mutedForeground }]}>
            Run Junk Cleaner first, then check Duplicate Finder — most people find 500 MB+ to free on their first scan.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  heading: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginBottom: 28,
    lineHeight: 18,
  },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  tipCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    alignItems: 'flex-start',
  },
  tipIcon: { fontSize: 20 },
  tipContent: { flex: 1 },
  tipTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
});
