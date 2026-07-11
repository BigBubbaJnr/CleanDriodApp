/**
 * Schedule tab — auto-clean daemon config + rich history with trends.
 *
 * History section shows:
 *   - Running total freed (all time)
 *   - Breakdown by type (junk, duplicates, large_files, cache, screenshots)
 *   - Week-over-week trend comparing last 7 days vs prior 7 days
 *   - Full chronological log
 */
import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useCleaner, CleanHistoryItem } from '@/context/CleanerContext';
import type { ScanJournalEntry } from '@/context/CleanerContext';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes, formatAbsoluteDate } from '@/utils/format';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Frequency = 'daily' | 'weekly' | 'monthly';

const FREQUENCIES: { value: Frequency; label: string; desc: string }[] = [
  { value: 'daily', label: 'DAILY', desc: 'Every day at 02:00' },
  { value: 'weekly', label: 'WEEKLY', desc: 'Every Sunday at 02:00' },
  { value: 'monthly', label: 'MONTHLY', desc: 'First of month at 02:00' },
];

function getNextRun(frequency: Frequency): string {
  const now = new Date();
  const next = new Date(now);
  if (frequency === 'daily') { next.setDate(next.getDate() + 1); next.setHours(2, 0, 0, 0); }
  else if (frequency === 'weekly') { next.setDate(next.getDate() + ((7 - now.getDay()) % 7 || 7)); next.setHours(2, 0, 0, 0); }
  else { next.setMonth(next.getMonth() + 1, 1); next.setHours(2, 0, 0, 0); }
  return next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

const TYPE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  junk: 'trash-2', duplicates: 'copy', large_files: 'hard-drive',
  cache: 'cpu', full: 'zap', screenshots: 'monitor',
};

const TYPE_COLORS: Record<string, string> = {
  junk: '#00E5CC', duplicates: '#39FF14', large_files: '#FFB800',
  cache: '#FF5500', full: '#00E5CC', screenshots: '#39FF14',
};

const TYPE_LABELS: Record<string, string> = {
  junk: 'JUNK CLEANER', duplicates: 'DUPLICATES', large_files: 'LARGE FILES',
  cache: 'APP CACHE', full: 'FULL SCAN', screenshots: 'SCREENSHOTS',
};

// ── Analytics helpers ────────────────────────────────────────────────────────

function computeTypeBreakdown(history: CleanHistoryItem[]) {
  const types = ['junk', 'duplicates', 'large_files', 'cache', 'screenshots'] as const;
  return types
    .map(type => ({
      type,
      total: history.filter(h => h.type === type).reduce((acc, h) => acc + h.bytesFreed, 0),
      count: history.filter(h => h.type === type).length,
    }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.total - a.total);
}

function computeWeeklyTrend(history: CleanHistoryItem[]): {
  thisWeek: number;
  lastWeek: number;
  trend: 'up' | 'down' | 'same';
} {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const thisWeek = history
    .filter(h => now - new Date(h.date).getTime() < week)
    .reduce((acc, h) => acc + h.bytesFreed, 0);
  const lastWeek = history
    .filter(h => {
      const age = now - new Date(h.date).getTime();
      return age >= week && age < 2 * week;
    })
    .reduce((acc, h) => acc + h.bytesFreed, 0);
  const trend = thisWeek > lastWeek * 1.1 ? 'up' : thisWeek < lastWeek * 0.9 ? 'down' : 'same';
  return { thisWeek, lastWeek, trend };
}

// ── Journal helpers ──────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

const JOURNAL_TOOL_LABELS: Record<string, string> = {
  junk: 'JUNK CLEANER',
  duplicates: 'DUPLICATE FINDER',
  large_files: 'LARGE FILES',
  screenshots: 'SCREENSHOT MGR',
  cache: 'APP CACHE',
  storage_intel: 'STORAGE INTEL',
};

const JOURNAL_TOOL_COLORS: Record<string, string> = {
  junk: '#00E5CC',
  duplicates: '#39FF14',
  large_files: '#FFB800',
  screenshots: '#39FF14',
  cache: '#FF5500',
  storage_intel: '#00E5CC',
};

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { scheduleSettings, updateSchedule, history, totalBytesFreed, journal } = useCleaner();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const bevel = useBevel();

  const breakdown = useMemo(() => computeTypeBreakdown(history), [history]);
  const trend = useMemo(() => computeWeeklyTrend(history), [history]);
  const maxBreakdownTotal = breakdown.length > 0 ? breakdown[0].total : 1;

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
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>CONFIGURE YOUR AUTO-CLEAN SCHEDULE</Text>

      {/* Coming Soon notice */}
      <View style={[styles.comingSoonBox, { borderColor: colors.warning + '80', backgroundColor: colors.warning + '0D' }]}>
        <Text style={[styles.comingSoonTitle, { color: colors.warning }]}>{'[!] BACKGROUND EXECUTION: V1.1'}</Text>
        <Text style={[styles.comingSoonText, { color: colors.mutedForeground }]}>
          {'> '} Auto-clean currently runs in the foreground only. Save your preferences here — they will activate automatically when background execution launches.
        </Text>
      </View>

      {/* Toggle */}
      <View style={[styles.panel, bevel, { backgroundColor: colors.card }]}>
        <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.primary }]}>{'[CLEAN SCHEDULE]'}</Text>
        </View>
        <View style={styles.toggleRow}>
          <View style={[styles.statusDot, {
            backgroundColor: scheduleSettings.enabled ? colors.success : colors.mutedForeground,
          }]} />
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: colors.foreground }]}>
              {scheduleSettings.enabled ? 'PREFERENCES SAVED' : 'INACTIVE'}
            </Text>
            <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
              {scheduleSettings.enabled ? `CONFIGURED: ${scheduleSettings.frequency.toUpperCase()}` : 'SCHEDULE DISABLED'}
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
          <View style={[styles.panel, bevel, { backgroundColor: colors.card }]}>
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

      {/* ── Storage History ── */}
      {history.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 20 }]}>
            {'── STORAGE HISTORY ──────────────────'}
          </Text>

          {/* All-time total */}
          <View style={[styles.totalPanel, bevel, { backgroundColor: colors.card }]}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>TOTAL FREED (ALL TIME)</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>{formatBytes(totalBytesFreed)}</Text>
            <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>
              {history.length} OPERATION{history.length !== 1 ? 'S' : ''}
            </Text>
          </View>

          {/* Weekly trend */}
          {(trend.thisWeek > 0 || trend.lastWeek > 0) && (
            <View style={[styles.trendPanel, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.panelHead, { color: colors.primary }]}>{'[WEEKLY TREND]'}</Text>
              <View style={styles.trendRow}>
                <View style={styles.trendCol}>
                  <Text style={[styles.trendPeriod, { color: colors.mutedForeground }]}>THIS WEEK</Text>
                  <Text style={[styles.trendVal, { color: colors.primary }]}>{formatBytes(trend.thisWeek)}</Text>
                </View>
                <View style={[styles.trendArrow]}>
                  <Feather
                    name={trend.trend === 'up' ? 'trending-up' : trend.trend === 'down' ? 'trending-down' : 'minus'}
                    size={20}
                    color={trend.trend === 'up' ? colors.success : trend.trend === 'down' ? colors.destructive : colors.mutedForeground}
                  />
                </View>
                <View style={[styles.trendCol, { alignItems: 'flex-end' }]}>
                  <Text style={[styles.trendPeriod, { color: colors.mutedForeground }]}>LAST WEEK</Text>
                  <Text style={[styles.trendVal, { color: colors.mutedForeground }]}>{formatBytes(trend.lastWeek)}</Text>
                </View>
              </View>
              <Text style={[styles.trendNote, { color: colors.mutedForeground }]}>
                {trend.trend === 'up'
                  ? '> WEEK-ON-WEEK: UP — STORAGE RECLAIM TRENDING HIGHER'
                  : trend.trend === 'down' && trend.lastWeek > 0
                    ? '> WEEK-ON-WEEK: DOWN — RUN A SCAN TO RECOVER MORE SPACE'
                    : '> WEEK-ON-WEEK: STABLE — RECLAIM RATE NOMINAL'
                }
              </Text>
            </View>
          )}

          {/* Breakdown by type */}
          {breakdown.length > 0 && (
            <View style={[styles.panel, bevel, { backgroundColor: colors.card }]}>
              <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.panelTitle, { color: colors.primary }]}>{'[BY CATEGORY]'}</Text>
              </View>
              {breakdown.map((item, idx) => (
                <View
                  key={item.type}
                  style={[
                    styles.breakdownRow,
                    idx < breakdown.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <Feather name={TYPE_ICONS[item.type]} size={13} color={TYPE_COLORS[item.type]} />
                  <View style={styles.breakdownInfo}>
                    <View style={styles.breakdownTopRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.foreground }]}>
                        {TYPE_LABELS[item.type]}
                      </Text>
                      <Text style={[styles.breakdownBytes, { color: TYPE_COLORS[item.type] }]}>
                        {formatBytes(item.total)}
                      </Text>
                    </View>
                    {/* Mini bar */}
                    <View style={styles.breakdownBarRow}>
                      {Array.from({ length: 16 }, (_, i) => (
                        <View
                          key={i}
                          style={{
                            flex: 1, height: 4,
                            backgroundColor: i < Math.round((item.total / maxBreakdownTotal) * 16)
                              ? TYPE_COLORS[item.type] : colors.border,
                          }}
                        />
                      ))}
                      <Text style={[styles.breakdownCount, { color: colors.mutedForeground }]}>
                        {'  '}{item.count}×
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Scan Journal */}
          <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 8 }]}>
            {'── SCAN JOURNAL ─────────────────────'}
          </Text>
          {journal.length > 0 ? (
            <View style={{ gap: 8, marginBottom: 14 }}>
              {journal.map(entry => (
                <View key={entry.id} style={[styles.journalCard, bevel, { backgroundColor: colors.card }]}>
                  {/* Header row */}
                  <View style={styles.journalHeader}>
                    <Text style={[styles.journalScanNum, { color: colors.primary }]}>
                      {`SCAN #${String(entry.scanNumber).padStart(3, '0')}`}
                    </Text>
                    <Text style={[styles.journalTool, { color: JOURNAL_TOOL_COLORS[entry.tool] ?? colors.foreground }]}>
                      {JOURNAL_TOOL_LABELS[entry.tool] ?? entry.tool.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.journalDate, { color: colors.mutedForeground }]}>
                    {formatAbsoluteDate(new Date(entry.timestamp).toISOString())}
                  </Text>
                  {/* Stats grid */}
                  <View style={styles.journalGrid}>
                    <View style={styles.journalCell}>
                      <Text style={[styles.journalKey, { color: colors.mutedForeground }]}>STORAGE</Text>
                      <Text style={[styles.journalVal, { color: colors.foreground }]}>
                        {entry.totalStorageBytes > 0 ? formatBytes(entry.totalStorageBytes) : '—'}
                      </Text>
                    </View>
                    <View style={styles.journalCell}>
                      <Text style={[styles.journalKey, { color: colors.mutedForeground }]}>RECOVERED</Text>
                      <Text style={[styles.journalVal, { color: colors.primary }]}>
                        {entry.bytesRecovered > 0 ? `~${formatBytes(entry.bytesRecovered)}` : '—'}
                      </Text>
                    </View>
                    <View style={styles.journalCell}>
                      <Text style={[styles.journalKey, { color: colors.mutedForeground }]}>CLEANED</Text>
                      <Text style={[styles.journalVal, { color: colors.foreground }]}>
                        {entry.itemsCleaned > 0 ? `${entry.itemsCleaned} FILES` : '—'}
                      </Text>
                    </View>
                    <View style={styles.journalCell}>
                      <Text style={[styles.journalKey, { color: colors.mutedForeground }]}>DURATION</Text>
                      <Text style={[styles.journalVal, { color: colors.foreground }]}>
                        {formatDuration(entry.durationMs)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : history.length > 0 ? (
            /* Legacy fallback — shows old history items until journal is populated */
            <View style={[styles.panel, bevel, { backgroundColor: colors.card }]}>
              {history.map((item, idx) => (
                <View
                  key={item.id}
                  style={[styles.histRow, idx < history.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                >
                  <Feather name={TYPE_ICONS[item.type] ?? 'zap'} size={13} color={colors.primary} />
                  <View style={styles.histContent}>
                    <Text style={[styles.histLabel, { color: colors.foreground }]} numberOfLines={1}>
                      {item.label.toUpperCase()}
                    </Text>
                    <Text style={[styles.histDate, { color: colors.mutedForeground }]}>{formatAbsoluteDate(item.date)}</Text>
                  </View>
                  <Text style={[styles.histSize, { color: colors.accent }]}>
                    {item.bytesFreed > 0 ? '+' + formatBytes(item.bytesFreed) : '—'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={[styles.emptyBox, bevel, { backgroundColor: colors.card, marginTop: 20 }]}>
          <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>{'[ LOG EMPTY ]'}</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {'> AWAITING FIRST OPERATION — history and\ntrends populate after first clean'}
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

  panel: { marginBottom: 14, borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2 },
  panelHeader: { padding: 10, borderBottomWidth: 1 },
  panelTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  panelHead: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 8 },

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

  totalPanel: {
    padding: 16, alignItems: 'center', gap: 4, marginBottom: 14,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  totalLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },
  totalValue: { fontSize: 38, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  totalSub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  trendPanel: {
    padding: 14, gap: 10, marginBottom: 14,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  trendRow: { flexDirection: 'row', alignItems: 'center' },
  trendCol: { flex: 1, gap: 3 },
  trendArrow: { width: 48, alignItems: 'center' },
  trendPeriod: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  trendVal: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  trendNote: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 16 },

  breakdownRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  breakdownInfo: { flex: 1, gap: 6 },
  breakdownTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  breakdownLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  breakdownBytes: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  breakdownBarRow: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  breakdownCount: { fontSize: 9, fontFamily: 'Inter_400Regular' },

  histRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  histContent: { flex: 1 },
  histLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  histDate: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginTop: 2 },
  histSize: { fontSize: 11, fontFamily: 'Inter_700Bold' },

  journalCard: {
    padding: 14, gap: 8,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  journalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  journalScanNum: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  journalTool: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  journalDate: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginTop: -4 },
  journalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  journalCell: { width: '47%', gap: 2 },
  journalKey: { fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  journalVal: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  emptyBox: {
    padding: 32, alignItems: 'center', gap: 10, marginBottom: 8,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  emptyIcon: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  emptyText: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, textAlign: 'center', lineHeight: 18 },

  comingSoonBox: { padding: 12, gap: 6, borderWidth: 1, marginBottom: 16 },
  comingSoonTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  comingSoonText: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3, lineHeight: 15 },
});
