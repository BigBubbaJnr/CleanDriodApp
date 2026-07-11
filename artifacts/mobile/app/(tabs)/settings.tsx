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
import { getErrorLog, clearErrorLog } from '@/utils/logger';

// Update these before Play Store submission
const PRIVACY_POLICY_URL = 'https://cleandroid.app/privacy';
const FEEDBACK_EMAIL = 'mailto:hello@cleandroid.app?subject=CleanDroid%20Feedback';

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
  const { rootEnabled, setRootEnabled, totalBytesFreed, history } = useCleaner();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const [errorLogOpen, setErrorLogOpen] = useState(false);

  const handleRootToggle = (val: boolean) => {
    if (val) {
      Alert.alert(
        'ENABLE ROOT MODE?',
        'Root access opens system-level file paths for deeper scanning. Requires a rooted device. Standard cleaning is always available without root.',
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'ENABLE', onPress: () => { setRootEnabled(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } },
        ]
      );
    } else {
      setRootEnabled(false);
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
            { k: 'LICENSE     ', v: 'FREE / OPEN', color: colors.success },
            { k: 'ROOT_ACCESS ', v: rootEnabled ? 'ENABLED' : 'DISABLED', color: rootEnabled ? colors.success : colors.mutedForeground },
          ].map(row => (
            <View key={row.k} style={styles.readoutRow}>
              <Text style={[styles.readoutKey, { color: colors.mutedForeground }]}>{row.k}</Text>
              <Text style={[styles.readoutSep, { color: colors.border }]}>{' = '}</Text>
              <Text style={[styles.readoutVal, { color: row.color }]}>{row.v}</Text>
            </View>
          ))}
        </View>
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
          value={rootEnabled ? 'ACTIVE — SYSTEM-LEVEL ACCESS' : 'INACTIVE — STANDARD MODE'}
          right={
            <Switch
              value={rootEnabled}
              onValueChange={handleRootToggle}
              trackColor={{ false: colors.border, true: colors.primary + '60' }}
              thumbColor={rootEnabled ? colors.primary : colors.mutedForeground}
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
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
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

      {/* Error log — shown only when there are entries */}
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
              accessibilityLabel={errorLogOpen ? 'Collapse error log' : 'Expand error log'}
              accessibilityRole="button"
            >
              <Feather name="alert-triangle" size={13} color={colors.destructive} />
              <Text style={[styles.errorLogTitle, { color: colors.destructive }]}>
                {'[ERROR LOG]'}
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
                    <Text style={[styles.errorTimestamp, { color: colors.mutedForeground }]}>
                      {entry.timestamp.slice(11, 19)}
                    </Text>
                    <Text style={[styles.errorTag, { color: colors.destructive }]}>
                      [{entry.tag}]
                    </Text>
                    <Text style={[styles.errorMsg, { color: colors.foreground }]} numberOfLines={2}>
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
                  accessibilityLabel="Clear error log"
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
    marginBottom: 20,
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
  pledgeBox: {
    padding: 16, gap: 8, marginBottom: 20,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  pledgeTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  pledgeText: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  // Error log styles
  errorLogHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 13, borderBottomWidth: 1,
  },
  errorLogTitle: { flex: 1, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  errorLogCount: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },
  errorLogBody: { paddingVertical: 4 },
  errorEntry: {
    paddingHorizontal: 13, paddingVertical: 8,
    borderBottomWidth: 1, gap: 2,
  },
  errorTimestamp: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  errorTag: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  errorMsg: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 14 },
  clearLogBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: 12, borderTopWidth: 1,
  },
  clearLogText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
});
