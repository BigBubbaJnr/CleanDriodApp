import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useCleaner } from '@/context/CleanerContext';
import { formatBytes } from '@/utils/format';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getErrorLog, clearErrorLog, type LogLevel } from '@/utils/logger';

const FEEDBACK_EMAIL = 'mailto:hello@cleandroid.app?subject=CleanDroid%20Feedback';

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: '#888',
  INFO: '#4CAF50',
  WARN: '#FF9800',
  ERROR: '#F44336',
};

function SysRow({
  label, value, icon, right, onPress, danger,
}: {
  label: string; value?: string; icon: keyof typeof Feather.glyphMap;
  right?: React.ReactNode; onPress?: () => void; danger?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.sysRow, { borderBottomColor: colors.border },
        pressed && onPress ? { backgroundColor: colors.primary + '08' } : {},
      ]}
      onPress={onPress}
      disabled={!onPress && !right}
    >
      <Text style={[styles.sysPrompt, { color: danger ? colors.destructive : colors.primary }]}>{'>'}</Text>
      <Feather name={icon} size={13} color={danger ? colors.destructive : colors.mutedForeground} />
      <View style={styles.sysContent}>
        <Text style={[styles.sysRowLabel, { color: danger ? colors.destructive : colors.foreground }]}>{label.toUpperCase()}</Text>
        {value ? <Text style={[styles.sysValue, { color: colors.mutedForeground }]}>{value}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={[styles.arrow, { color: colors.mutedForeground }]}>{'→'}</Text> : null)}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rootEnabled, totalBytesFreed, history, safeMode, setSafeMode } = useCleaner();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const [errorLogOpen, setErrorLogOpen] = useState(false);

  const handleSafeModeToggle = (val: boolean) => {
    if (!val) {
      Alert.alert(
        'DISABLE SAFE MODE?',
        'Safe Mode prevents real file deletion during testing. Disabling it means the next clean will permanently delete files from your device.\n\nOnly disable this when you are ready for real cleaning.',
        [
          { text: 'KEEP SAFE MODE', style: 'cancel' },
          {
            text: 'DISABLE',
            style: 'destructive',
            onPress: () => {
              setSafeMode(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            },
          },
        ]
      );
    } else {
      setSafeMode(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const errorLog = getErrorLog();

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
      <Text style={[styles.sysLabel, { color: colors.mutedForeground }]}>{'> SYS CONFIG'}</Text>
      <Text style={[styles.heading, { color: colors.foreground }]}>SETTINGS</Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Stats readout — terminal-style */}
      <View style={[styles.panel, {
        backgroundColor: colors.card,
        borderTopColor: colors.bevelLight,
        borderLeftColor: colors.bevelLight,
        borderBottomColor: colors.bevelDark,
        borderRightColor: colors.bevelDark,
      }]}>
        <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.primary }]}>{'[SYSTEM REPORT]'}</Text>
        </View>
        <View style={styles.readout}>
          {[
            { k: 'TOTAL_SCANS', v: String(history.length).padStart(4, '0'), color: colors.primary },
            { k: 'BYTES_FREED ', v: formatBytes(totalBytesFreed), color: colors.accent },
            { k: 'SAFE_MODE   ', v: safeMode ? 'ON — SIMULATION' : 'OFF — LIVE MODE', color: safeMode ? colors.warning : colors.success },
            { k: 'LICENSE     ', v: 'FREE / OPEN', color: colors.success },
          ].map(row => (
            <View key={row.k} style={styles.readoutRow}>
              <Text style={[styles.readoutKey, { color: colors.mutedForeground }]}>{row.k}</Text>
              <Text style={[styles.readoutSep, { color: colors.border }]}>{' = '}</Text>
              <Text style={[styles.readoutVal, { color: row.color }]}>{row.v}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Developer Settings */}
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>
        {'── DEVELOPER ────────────────────────'}
      </Text>
      <View style={[styles.panel, {
        backgroundColor: colors.card,
        borderTopColor: colors.bevelLight,
        borderLeftColor: colors.bevelLight,
        borderBottomColor: colors.bevelDark,
        borderRightColor: colors.bevelDark,
      }]}>
        <SysRow
          icon="shield"
          label="Safe Mode"
          value={safeMode
            ? 'ON — SIMULATING DELETIONS, NO FILES TOUCHED'
            : 'OFF — NEXT CLEAN WILL DELETE REAL FILES'}
          danger={!safeMode}
          right={
            <Switch
              value={safeMode}
              onValueChange={handleSafeModeToggle}
              trackColor={{ false: colors.destructive + '60', true: colors.warning + '60' }}
              thumbColor={safeMode ? colors.warning : colors.destructive}
            />
          }
        />
      </View>

      {/* Safe Mode explanation box */}
      <View style={[styles.safeBox, {
        borderColor: safeMode ? colors.warning + '50' : colors.destructive + '50',
        backgroundColor: safeMode ? colors.warning + '07' : colors.destructive + '05',
      }]}>
        <Feather
          name={safeMode ? 'shield' : 'alert-triangle'}
          size={12}
          color={safeMode ? colors.warning : colors.destructive}
        />
        <Text style={[styles.safeBoxText, { color: colors.mutedForeground }]}>
          {safeMode
            ? '> Safe Mode is ON. All cleaners will simulate deletion — no files will be touched. Reports generate as normal. Default in development builds.'
            : '> Safe Mode is OFF. The next clean will permanently delete selected files. Only disable once you have tested with Safe Mode.'}
        </Text>
      </View>

      {/* Advanced */}
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>
        {'── ADVANCED ─────────────────────────'}
      </Text>
      <View style={[styles.panel, {
        backgroundColor: colors.card,
        borderTopColor: colors.bevelLight,
        borderLeftColor: colors.bevelLight,
        borderBottomColor: colors.bevelDark,
        borderRightColor: colors.bevelDark,
      }]}>
        <SysRow
          icon="shield"
          label="Root Mode"
          value="COMING SOON — REQUIRES ROOTED DEVICE"
          right={
            <Switch
              value={false}
              disabled
              trackColor={{ false: colors.border, true: colors.border }}
              thumbColor={colors.mutedForeground}
            />
          }
        />
      </View>

      {/* About */}
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>
        {'── ABOUT ────────────────────────────'}
      </Text>
      <View style={[styles.panel, {
        backgroundColor: colors.card,
        borderTopColor: colors.bevelLight,
        borderLeftColor: colors.bevelLight,
        borderBottomColor: colors.bevelDark,
        borderRightColor: colors.bevelDark,
      }]}>
        <SysRow
          icon="info"
          label="CleanDroid"
          value={`v${Constants.expoConfig?.version ?? '1.0.0'} — Build ${Constants.expoConfig?.android?.versionCode ?? 1}`}
        />
        <SysRow icon="heart" label="Free Forever" value="NO PAYWALLS. NO TIERS. NO EXCEPTIONS." />
        <SysRow
          icon="file-text"
          label="Privacy Policy"
          value="ALL OPS LOCAL — ZERO NETWORK CALLS"
          onPress={() => router.push('/privacy-policy')}
        />
        <SysRow
          icon="mail"
          label="Send Feedback"
          value="REPORT A BUG OR SUGGEST A FEATURE"
          onPress={() => Linking.openURL(FEEDBACK_EMAIL)}
        />
      </View>

      {/* Free pledge — retro box */}
      <View style={[styles.pledgeBox, {
        borderColor: colors.primary + '50',
        backgroundColor: colors.primary + '07',
        borderTopColor: colors.primary + '30',
        borderLeftColor: colors.primary + '30',
        borderBottomColor: colors.primary + '80',
        borderRightColor: colors.primary + '80',
      }]}>
        <Text style={[styles.pledgeTitle, { color: colors.primary }]}>{'[!] FREE PROMISE'}</Text>
        <Text style={[styles.pledgeText, { color: colors.mutedForeground }]}>
          {'> '} CleanDroid will always be free. Every feature. No "Pro" tier, no membership, no locked tools. Ever.
        </Text>
      </View>

      {/* Diagnostic log — shown only when there are entries */}
      {errorLog.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>
            {'── DIAGNOSTICS ──────────────────────'}
          </Text>
          <View style={[styles.panel, {
            backgroundColor: colors.card,
            borderTopColor: colors.bevelLight,
            borderLeftColor: colors.bevelLight,
            borderBottomColor: colors.bevelDark,
            borderRightColor: colors.bevelDark,
          }]}>
            {/* Collapsible header row */}
            <Pressable
              style={[styles.errorLogHeader, { borderBottomColor: errorLogOpen ? colors.border : 'transparent' }]}
              onPress={() => {
                setErrorLogOpen(v => !v);
                Haptics.selectionAsync();
              }}
              accessibilityLabel={errorLogOpen ? 'Collapse diagnostic log' : 'Expand diagnostic log'}
              accessibilityRole="button"
            >
              <Feather name="terminal" size={13} color={colors.primary} />
              <Text style={[styles.errorLogTitle, { color: colors.primary }]}>
                {'[DIAGNOSTIC LOG]'}
              </Text>
              <Text style={[styles.errorLogCount, { color: colors.mutedForeground }]}>
                {errorLog.length} ENTR{errorLog.length === 1 ? 'Y' : 'IES'}
              </Text>
              <Text style={[styles.arrow, { color: colors.mutedForeground }]}>
                {errorLogOpen ? '↑' : '↓'}
              </Text>
            </Pressable>

            {errorLogOpen && (
              <View style={styles.errorLogBody}>
                {errorLog.map((entry, i) => (
                  <View
                    key={i}
                    style={[
                      styles.errorEntry,
                      { borderBottomColor: colors.border },
                      i === errorLog.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View style={styles.errorEntryHeader}>
                      <Text style={[styles.errorTimestamp, { color: colors.mutedForeground }]}>
                        {entry.ts.slice(11, 19)}
                      </Text>
                      <View style={[styles.levelBadge, { backgroundColor: LEVEL_COLORS[entry.level] + '20' }]}>
                        <Text style={[styles.levelText, { color: LEVEL_COLORS[entry.level] }]}>
                          {entry.level}
                        </Text>
                      </View>
                      <Text style={[styles.errorTag, { color: colors.primary }]}>
                        [{entry.tag}]
                      </Text>
                    </View>
                    <Text style={[styles.errorMsg, { color: colors.foreground }]} numberOfLines={3}>
                      {entry.message}
                    </Text>
                  </View>
                ))}

                {/* Clear button */}
                <Pressable
                  style={[styles.clearLogBtn, { borderTopColor: colors.border }]}
                  onPress={() => {
                    clearErrorLog();
                    setErrorLogOpen(false);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                  accessibilityLabel="Clear diagnostic log"
                  accessibilityRole="button"
                >
                  <Feather name="trash-2" size={12} color={colors.destructive} />
                  <Text style={[styles.clearLogText, { color: colors.destructive }]}>
                    {'>> CLEAR LOG'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  sysLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 2, marginBottom: 4 },
  heading: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: 3, marginBottom: 10 },
  divider: { height: 1, marginBottom: 20 },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginBottom: 10 },
  panel: {
    marginBottom: 12,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
    overflow: 'hidden',
  },
  panelHeader: { padding: 10, borderBottomWidth: 1 },
  panelTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  readout: { padding: 12, gap: 6 },
  readoutRow: { flexDirection: 'row' },
  readoutKey: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, width: 130 },
  readoutSep: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  readoutVal: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  sysRow: {
    flexDirection: 'row', alignItems: 'center', padding: 13, gap: 10, borderBottomWidth: 1,
  },
  sysPrompt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  sysContent: { flex: 1 },
  sysRowLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  sysValue: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, marginTop: 2 },
  arrow: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  safeBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderWidth: 1, marginBottom: 20,
  },
  safeBoxText: { flex: 1, fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 16, letterSpacing: 0.3 },

  pledgeBox: {
    padding: 16, gap: 8, marginBottom: 20,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  pledgeTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  pledgeText: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  // Diagnostic log styles
  errorLogHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 13, borderBottomWidth: 1,
  },
  errorLogTitle: { flex: 1, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  errorLogCount: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },
  errorLogBody: { paddingVertical: 4 },
  errorEntry: {
    paddingHorizontal: 13, paddingVertical: 8,
    borderBottomWidth: 1, gap: 4,
  },
  errorEntryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorTimestamp: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  levelBadge: { paddingHorizontal: 4, paddingVertical: 1 },
  levelText: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  errorTag: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, flex: 1 },
  errorMsg: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 14 },
  clearLogBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: 12, borderTopWidth: 1,
  },
  clearLogText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
});
