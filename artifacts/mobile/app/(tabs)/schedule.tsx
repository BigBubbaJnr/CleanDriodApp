import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useCleaner } from '@/context/CleanerContext';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Frequency = 'daily' | 'weekly' | 'monthly';

const FREQUENCIES: { value: Frequency; label: string; desc: string }[] = [
  { value: 'daily', label: 'Daily', desc: 'Every day at 2 AM' },
  { value: 'weekly', label: 'Weekly', desc: 'Every Sunday at 2 AM' },
  { value: 'monthly', label: 'Monthly', desc: 'First of the month' },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getNextRun(frequency: Frequency): string {
  const now = new Date();
  const next = new Date(now);
  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
    next.setHours(2, 0, 0, 0);
  } else if (frequency === 'weekly') {
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    next.setDate(next.getDate() + daysUntilSunday);
    next.setHours(2, 0, 0, 0);
  } else {
    next.setMonth(next.getMonth() + 1, 1);
    next.setHours(2, 0, 0, 0);
  }
  return next.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function typeIcon(type: string): keyof typeof Feather.glyphMap {
  switch (type) {
    case 'junk': return 'trash-2';
    case 'duplicates': return 'copy';
    case 'large_files': return 'hard-drive';
    case 'cache': return 'cpu';
    default: return 'zap';
  }
}

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { scheduleSettings, updateSchedule, history } = useCleaner();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const handleToggle = (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSchedule({ enabled: value });
  };

  const handleFrequency = (freq: Frequency) => {
    Haptics.selectionAsync();
    updateSchedule({ frequency: freq });
  };

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
      <Text style={[styles.heading, { color: colors.foreground }]}>Auto-Clean</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Set it and forget it — CleanDroid cleans in the background
      </Text>

      {/* Toggle card */}
      <View style={[styles.toggleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <LinearGradient
          colors={scheduleSettings.enabled ? [colors.primary, '#4ECDC4'] : [colors.border, colors.border]}
          style={styles.toggleIcon}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Feather name="clock" size={22} color="#FFFFFF" />
        </LinearGradient>
        <View style={styles.toggleContent}>
          <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Auto-Clean</Text>
          <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
            {scheduleSettings.enabled ? `Runs ${scheduleSettings.frequency}` : 'Off'}
          </Text>
        </View>
        <Switch
          value={scheduleSettings.enabled}
          onValueChange={handleToggle}
          trackColor={{ false: colors.border, true: colors.primary + '80' }}
          thumbColor={scheduleSettings.enabled ? colors.primary : colors.mutedForeground}
        />
      </View>

      {/* Frequency picker */}
      {scheduleSettings.enabled && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FREQUENCY</Text>
          <View style={[styles.frequencyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {FREQUENCIES.map((f, idx) => (
              <Pressable
                key={f.value}
                style={[
                  styles.freqItem,
                  idx < FREQUENCIES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  scheduleSettings.frequency === f.value && { backgroundColor: colors.primary + '12' },
                ]}
                onPress={() => handleFrequency(f.value)}
              >
                <View style={styles.freqText}>
                  <Text style={[styles.freqLabel, { color: colors.foreground }]}>{f.label}</Text>
                  <Text style={[styles.freqDesc, { color: colors.mutedForeground }]}>{f.desc}</Text>
                </View>
                {scheduleSettings.frequency === f.value && (
                  <View style={[styles.freqCheck, { backgroundColor: colors.primary }]}>
                    <Feather name="check" size={12} color="#FFF" />
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          <View style={[styles.nextRunCard, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]}>
            <Feather name="calendar" size={16} color={colors.accent} />
            <Text style={[styles.nextRunText, { color: colors.accent }]}>
              Next run: {getNextRun(scheduleSettings.frequency)}
            </Text>
          </View>
        </>
      )}

      {/* History */}
      {history.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 24 }]}>CLEAN HISTORY</Text>
          <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {history.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.historyItem,
                  idx < history.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.historyIcon, { backgroundColor: colors.primary + '20' }]}>
                  <Feather name={typeIcon(item.type)} size={14} color={colors.primary} />
                </View>
                <View style={styles.historyContent}>
                  <Text style={[styles.historyLabel, { color: colors.foreground }]}>{item.label}</Text>
                  <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>
                    {formatDate(item.date)}
                  </Text>
                </View>
                <Text style={[styles.historySize, { color: colors.accent }]}>
                  +{formatBytes(item.bytesFreed)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {history.length === 0 && (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="clock" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No history yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Your cleaning history will appear here after your first scan
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  heading: { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  sub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 24, lineHeight: 18 },
  sectionLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginBottom: 10,
  },
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderRadius: 16, borderWidth: 1, gap: 14, marginBottom: 24,
  },
  toggleIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toggleContent: { flex: 1 },
  toggleTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  toggleSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  frequencyCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 14 },
  freqItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  freqText: { flex: 1 },
  freqLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  freqDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  freqCheck: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nextRunCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  nextRunText: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  historyCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  historyItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  historyIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyContent: { flex: 1 },
  historyLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  historyDate: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  historySize: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emptyCard: {
    borderRadius: 20, borderWidth: 1, padding: 32,
    alignItems: 'center', gap: 10, marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
});
