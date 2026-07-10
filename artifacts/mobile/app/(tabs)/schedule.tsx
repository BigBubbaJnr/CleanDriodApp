import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useCleaner } from '@/context/CleanerContext';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Frequency = 'daily' | 'weekly' | 'monthly';

const FREQUENCIES: { value: Frequency; label: string; desc: string }[] = [
  { value: 'daily', label: 'DAILY', desc: 'Every day at 02:00' },
  { value: 'weekly', label: 'WEEKLY', desc: 'Every Sunday at 02:00' },
  { value: 'monthly', label: 'MONTHLY', desc: 'First of month at 02:00' },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase();
}

function getNextRun(frequency: Frequency): string {
  const now = new Date();
  const next = new Date(now);
  if (frequency === 'daily') { next.setDate(next.getDate() + 1); next.setHours(2, 0, 0, 0); }
  else if (frequency === 'weekly') { next.setDate(next.getDate() + ((7 - now.getDay()) % 7 || 7)); next.setHours(2, 0, 0, 0); }
  else { next.setMonth(next.getMonth() + 1, 1); next.setHours(2, 0, 0, 0); }
  return next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
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
      <Text style={[styles.sysLabel, { color: colors.mutedForeground }]}>{'> DAEMON CONFIG'}</Text>
      <Text style={[styles.heading, { color: colors.foreground }]}>AUTO-CLEAN</Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>SET IT AND FORGET IT</Text>

      {/* Toggle */}
      <View style={[styles.panel, {
        backgroundColor: colors.card,
        borderTopColor: colors.bevelLight,
        borderLeftColor: colors.bevelLight,
        borderBottomColor: colors.bevelDark,
        borderRightColor: colors.bevelDark,
      }]}>
        <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.primary }]}>{'[DAEMON STATUS]'}</Text>
        </View>
        <View style={styles.toggleRow}>
          <View style={[styles.statusDot, { backgroundColor: scheduleSettings.enabled ? colors.success : colors.mutedForeground }]} />
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: colors.foreground }]}>
              {scheduleSettings.enabled ? 'ACTIVE' : 'INACTIVE'}
            </Text>
            <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
              {scheduleSettings.enabled ? `RUNS ${scheduleSettings.frequency.toUpperCase()}` : 'DAEMON OFFLINE'}
            </Text>
          </View>
          <Switch
            value={scheduleSettings.enabled}
            onValueChange={v => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateSchedule({ enabled: v }); }}
            trackColor={{ false: colors.border, true: colors.primary + '60' }}
            thumbColor={scheduleSettings.enabled ? colors.primary : colors.mutedForeground}
          />
        </View>
      </View>

      {/* Frequency */}
      {scheduleSettings.enabled && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>
            {'── INTERVAL ─────────────────────────'}
          </Text>
          <View style={[styles.panel, {
            backgroundColor: colors.card,
            borderTopColor: colors.bevelLight,
            borderLeftColor: colors.bevelLight,
            borderBottomColor: colors.bevelDark,
            borderRightColor: colors.bevelDark,
          }]}>
            {FREQUENCIES.map((f, idx) => {
              const active = scheduleSettings.frequency === f.value;
              return (
                <Pressable
                  key={f.value}
                  style={[
                    styles.freqRow,
                    idx < FREQUENCIES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    active && { backgroundColor: colors.primary + '10' },
                  ]}
                  onPress={() => { Haptics.selectionAsync(); updateSchedule({ frequency: f.value }); }}
                >
                  <View style={[styles.radioOuter, { borderColor: active ? colors.primary : colors.mutedForeground }]}>
                    {active && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                  </View>
                  <View style={styles.freqText}>
                    <Text style={[styles.freqLabel, { color: active ? colors.primary : colors.foreground }]}>{f.label}</Text>
                    <Text style={[styles.freqDesc, { color: colors.mutedForeground }]}>{f.desc}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.nextRunBox, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '08' }]}>
            <Text style={[styles.nextRunLabel, { color: colors.mutedForeground }]}>NEXT EXECUTION</Text>
            <Text style={[styles.nextRunValue, { color: colors.primary }]}>
              {'> '}{getNextRun(scheduleSettings.frequency)}
            </Text>
          </View>
        </>
      )}

      {/* History */}
      {history.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 20 }]}>
            {'── EXECUTION LOG ────────────────────'}
          </Text>
          <View style={[styles.panel, {
            backgroundColor: colors.card,
            borderTopColor: colors.bevelLight,
            borderLeftColor: colors.bevelLight,
            borderBottomColor: colors.bevelDark,
            borderRightColor: colors.bevelDark,
          }]}>
            {history.map((item, idx) => (
              <View
                key={item.id}
                style={[styles.histRow, idx < history.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              >
                <Feather name={typeIcon(item.type)} size={13} color={colors.primary} />
                <View style={styles.histContent}>
                  <Text style={[styles.histLabel, { color: colors.foreground }]} numberOfLines={1}>
                    {item.label.toUpperCase()}
                  </Text>
                  <Text style={[styles.histDate, { color: colors.mutedForeground }]}>{formatDate(item.date)}</Text>
                </View>
                <Text style={[styles.histSize, { color: colors.accent }]}>+{formatBytes(item.bytesFreed)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={[styles.emptyBox, {
          backgroundColor: colors.card,
          borderTopColor: colors.bevelLight,
          borderLeftColor: colors.bevelLight,
          borderBottomColor: colors.bevelDark,
          borderRightColor: colors.bevelDark,
          marginTop: 20,
        }]}>
          <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>{'[ LOG EMPTY ]'}</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Execution history appears after first scan
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  sysLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 2, marginBottom: 4 },
  heading: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: 3, marginBottom: 10 },
  divider: { height: 1, marginBottom: 10 },
  sub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, marginBottom: 20 },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginBottom: 10 },
  panel: {
    marginBottom: 14,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  panelHeader: { padding: 10, borderBottomWidth: 1 },
  panelTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  statusDot: { width: 10, height: 10 },
  toggleText: { flex: 1 },
  toggleTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  toggleSub: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginTop: 2 },
  freqRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  radioOuter: { width: 16, height: 16, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 7, height: 7, borderRadius: 4 },
  freqText: { flex: 1 },
  freqLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  freqDesc: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, marginTop: 2 },
  nextRunBox: { borderWidth: 1, padding: 12, gap: 4, marginBottom: 4 },
  nextRunLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },
  nextRunValue: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  histContent: { flex: 1 },
  histLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  histDate: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginTop: 2 },
  histSize: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  emptyBox: {
    padding: 32, alignItems: 'center', gap: 10,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  emptyIcon: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  emptyText: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, textAlign: 'center' },
});
