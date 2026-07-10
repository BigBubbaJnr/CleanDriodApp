import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useCleaner } from '@/context/CleanerContext';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function SettingRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && onPress ? { backgroundColor: colors.muted } : {},
      ]}
      onPress={onPress}
      disabled={!onPress && !right}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.destructive + '20' : colors.primary + '20' }]}>
        <Feather name={icon} size={16} color={danger ? colors.destructive : colors.primary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, { color: danger ? colors.destructive : colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Feather name="chevron-right" size={16} color={colors.mutedForeground} /> : null)}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rootEnabled, setRootEnabled, totalBytesFreed, history } = useCleaner();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const handleRootToggle = (val: boolean) => {
    if (val) {
      Alert.alert(
        'Enable Root Mode?',
        'Root mode gives CleanDroid access to system-level files for deeper cleaning. Your device must be rooted. If unsure, leave this off.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: () => {
              setRootEnabled(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            },
          },
        ]
      );
    } else {
      setRootEnabled(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  }

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
      <Text style={[styles.heading, { color: colors.foreground }]}>Settings</Text>

      {/* Stats */}
      <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>{history.length}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Scans</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{formatBytes(totalBytesFreed)}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Freed</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>Free</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Plan</Text>
        </View>
      </View>

      {/* Advanced */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ADVANCED</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingRow
          icon="shield"
          title="Root Mode"
          subtitle={rootEnabled ? 'Enabled — deeper system access' : 'Disabled — standard mode'}
          right={
            <Switch
              value={rootEnabled}
              onValueChange={handleRootToggle}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={rootEnabled ? colors.primary : colors.mutedForeground}
            />
          }
        />
      </View>

      {/* About */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ABOUT</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingRow
          icon="info"
          title="CleanDroid"
          subtitle="Version 1.0.0"
        />
        <SettingRow
          icon="heart"
          title="Free & Open"
          subtitle="No subscriptions, no paywalls — ever"
        />
        <SettingRow
          icon="lock"
          title="Privacy"
          subtitle="All cleaning happens on-device. No data leaves your phone."
        />
      </View>

      {/* Free pledge */}
      <View style={[styles.pledgeCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
        <Feather name="award" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.pledgeTitle, { color: colors.foreground }]}>Our Free Promise</Text>
          <Text style={[styles.pledgeText, { color: colors.mutedForeground }]}>
            CleanDroid will always be free. Every feature. No "Pro" tier, no membership, no locked tools.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  heading: { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 20 },
  statsCard: {
    flexDirection: 'row', borderRadius: 16, borderWidth: 1,
    padding: 20, marginBottom: 24, alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  statDivider: { width: 1, height: 36, marginHorizontal: 8 },
  sectionLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginBottom: 10,
  },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    gap: 12, borderBottomWidth: 1,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  rowSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  pledgeCard: {
    flexDirection: 'row', borderRadius: 16, borderWidth: 1,
    padding: 16, gap: 12, alignItems: 'flex-start',
  },
  pledgeTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  pledgeText: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
});
