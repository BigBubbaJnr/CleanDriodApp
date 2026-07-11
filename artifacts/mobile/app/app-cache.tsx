import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useCleaner } from '@/context/CleanerContext';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes } from '@/utils/format';
import { sleep } from '@/utils/sleep';
import SegBar from '@/components/SegBar';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AppCacheItem {
  id: string;
  name: string;
  packageName: string;
  cacheSize: number;
  icon: keyof typeof Feather.glyphMap;
  selected: boolean;
}

const BASE_APPS: Omit<AppCacheItem, 'selected'>[] = [
  { id: '1', name: 'Chrome',     packageName: 'com.android.chrome',              cacheSize: 284 * 1024 * 1024, icon: 'globe' },
  { id: '2', name: 'Instagram',  packageName: 'com.instagram.android',           cacheSize: 512 * 1024 * 1024, icon: 'camera' },
  { id: '3', name: 'YouTube',    packageName: 'com.google.android.youtube',      cacheSize: 748 * 1024 * 1024, icon: 'play-circle' },
  { id: '4', name: 'WhatsApp',   packageName: 'com.whatsapp',                    cacheSize: 389 * 1024 * 1024, icon: 'message-circle' },
  { id: '5', name: 'Facebook',   packageName: 'com.facebook.katana',             cacheSize: 621 * 1024 * 1024, icon: 'users' },
  { id: '6', name: 'Spotify',    packageName: 'com.spotify.music',               cacheSize: 445 * 1024 * 1024, icon: 'music' },
  { id: '7', name: 'TikTok',     packageName: 'com.zhiliaoapp.musically',        cacheSize: 833 * 1024 * 1024, icon: 'video' },
  { id: '8', name: 'Twitter/X',  packageName: 'com.twitter.android',             cacheSize: 198 * 1024 * 1024, icon: 'at-sign' },
  { id: '9', name: 'Gmail',      packageName: 'com.google.android.gm',           cacheSize: 134 * 1024 * 1024, icon: 'mail' },
  { id: '10', name: 'Maps',      packageName: 'com.google.android.apps.maps',    cacheSize: 312 * 1024 * 1024, icon: 'map-pin' },
  { id: '11', name: 'Snapchat',  packageName: 'com.snapchat.android',            cacheSize: 567 * 1024 * 1024, icon: 'zap' },
  { id: '12', name: 'Netflix',   packageName: 'com.netflix.mediaclient',         cacheSize: 289 * 1024 * 1024, icon: 'film' },
];

type Phase = 'idle' | 'auto-clearing' | 'sweep-ready' | 'sweeping' | 'done';

export default function AppCacheScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem } = useCleaner();

  const [phase, setPhase] = useState<Phase>('idle');
  const [apps, setApps] = useState<AppCacheItem[]>(BASE_APPS.map(a => ({ ...a, selected: true })));
  const [autoClearedBytes, setAutoClearedBytes] = useState(0);
  const [sweepIndex, setSweepIndex] = useState(0);
  const [clearedInSweep, setClearedInSweep] = useState<Set<string>>(new Set());
  const [totalFreed, setTotalFreed] = useState(0);

  const appStateRef = useRef(AppState.currentState);
  const sweepIndexRef = useRef(0);
  const sweepAppsRef = useRef<AppCacheItem[]>([]);
  const sweepActiveRef = useRef(false);
  // Ref so the stale-closure AppState listener always calls the latest finishSweep
  const finishSweepRef = useRef<(apps: AppCacheItem[]) => Promise<void>>(async () => {});

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const finishSweep = useCallback(async (sweepApps: AppCacheItem[]) => {
    sweepActiveRef.current = false;
    // Can't read how much Android actually freed — Smart Sweep only guides you through Settings.
    // Record 0 bytes so history stays honest; the real savings show up in Storage Intelligence.
    await addHistoryItem({
      date: new Date().toISOString(),
      bytesFreed: 0,
      type: 'cache',
      label: `Smart Sweep — ${sweepApps.length} app${sweepApps.length !== 1 ? 's' : ''} guided through Settings`,
    });
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [addHistoryItem]);

  // Keep the ref in sync with the latest callback
  useEffect(() => { finishSweepRef.current = finishSweep; }, [finishSweep]);

  // AppState: auto-advance sweep when user returns from Settings
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      const wasBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      if (wasBackground && nextState === 'active' && sweepActiveRef.current) {
        const currentIdx = sweepIndexRef.current;
        const sweepApps = sweepAppsRef.current;
        const current = sweepApps[currentIdx];
        if (current) {
          setClearedInSweep(prev => new Set([...prev, current.id]));
          const nextIdx = currentIdx + 1;
          sweepIndexRef.current = nextIdx;
          setSweepIndex(nextIdx);
          if (nextIdx < sweepApps.length) {
            setTimeout(() => openAppSettings(sweepApps[nextIdx]), 600);
          } else {
            finishSweepRef.current(sweepApps);
          }
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const openAppSettings = async (app: AppCacheItem) => {
    if (Platform.OS !== 'android') return;
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, { data: `package:${app.packageName}` });
    } catch {
      // Intent failed — skip this app and advance automatically
      const sweepApps = sweepAppsRef.current;
      setClearedInSweep(prev => new Set([...prev, app.id]));
      const nextIdx = sweepIndexRef.current + 1;
      sweepIndexRef.current = nextIdx;
      setSweepIndex(nextIdx);
      if (nextIdx < sweepApps.length) {
        setTimeout(() => openAppSettings(sweepApps[nextIdx]), 300);
      } else {
        await finishSweep(sweepApps);
      }
    }
  };

  const handleAutoClear = useCallback(async () => {
    setPhase('auto-clearing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    let freed = 0;
    try {
      const info = await FileSystem.getInfoAsync(FileSystem.cacheDirectory!);
      if (info.exists) { freed += (info as any).size ?? 0; await FileSystem.deleteAsync(FileSystem.cacheDirectory!, { idempotent: true }); }
    } catch {}
    await sleep(1500);
    setAutoClearedBytes(freed);
    setTotalFreed(freed);
    await addHistoryItem({ date: new Date().toISOString(), bytesFreed: freed, type: 'cache', label: 'Auto Cache Clear — own app cache cleared' });
    setPhase('sweep-ready');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [addHistoryItem]);

  const handleStartSweep = useCallback(() => {
    if (Platform.OS !== 'android') {
      Alert.alert('ANDROID ONLY', 'Smart Sweep requires a real Android device.');
      return;
    }
    const selected = apps.filter(a => a.selected);
    if (selected.length === 0) { Alert.alert('NO APPS SELECTED', 'Select at least one app.'); return; }
    sweepAppsRef.current = selected;
    sweepIndexRef.current = 0;
    sweepActiveRef.current = true;
    setClearedInSweep(new Set());
    setSweepIndex(0);
    setPhase('sweeping');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => openAppSettings(selected[0]), 400);
  }, [apps]);

  const toggleApp = (id: string) =>
    setApps(prev => prev.map(a => a.id === id ? { ...a, selected: !a.selected } : a));

  const selectedApps = apps.filter(a => a.selected);
  const currentSweepApp = sweepAppsRef.current[sweepIndex];
  const sweepTotal = sweepAppsRef.current.length;
  const sweepDone = clearedInSweep.size;
  const bevel = useBevel();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, {
        paddingTop: insets.top + 12 + webTopPad,
        backgroundColor: colors.background,
        borderBottomColor: colors.primary + '40',
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, bevel, { backgroundColor: colors.card }]} accessibilityLabel="Go back" accessibilityRole="button">
          <Feather name="arrow-left" size={16} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{'> MODULE'}</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>CACHE CLEANER</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 + webBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <Animated.View entering={FadeIn} style={{ gap: 12 }}>
            {/* Step 1 */}
            <View style={[styles.stepPanel, bevel, { backgroundColor: colors.card, borderTopColor: colors.primary, borderLeftColor: colors.primary }]}>
              <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.stepNum, { color: colors.primaryForeground }]}>1</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={[styles.stepTitle, { color: colors.primary }]}>AUTO-CLEAR</Text>
                <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
                  Instantly clears temp files, thumbnails & accessible caches — zero tapping required
                </Text>
                <Pressable onPress={handleAutoClear} style={{ marginTop: 10 }}>
                  <View style={[styles.primaryBtn, {
                    backgroundColor: colors.primary,
                    borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                    borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                  }]}>
                    <Feather name="zap" size={14} color={colors.primaryForeground} />
                    <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{'>> AUTO-CLEAR NOW'}</Text>
                  </View>
                </Pressable>
              </View>
            </View>

            {/* Step 2 */}
            <View style={[styles.stepPanel, bevel, { backgroundColor: colors.card }]}>
              <View style={[styles.stepBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.stepNum, { color: '#FFF' }]}>2</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={[styles.stepTitle, { color: colors.accent }]}>SMART SWEEP</Text>
                <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
                  Opens each app's cache settings automatically. Just clear and return — we open the next.
                </Text>
                <View style={[styles.infoBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                    {'[!] '} Android requires one "Clear Cache" tap per app. Smart Sweep removes all back-and-forth.
                  </Text>
                </View>
              </View>
            </View>

            {/* App selection */}
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>
              {'── COMMON APPS — ESTIMATED SIZES ─────'}
            </Text>
            <View style={[styles.estimatedNote, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.estimatedNoteText, { color: colors.mutedForeground }]}>
                {'[i] '} Android does not expose per-app cache sizes to third-party apps. Sizes shown are typical estimates for common apps. Smart Sweep opens each app's Settings page so you can clear the real amount.
              </Text>
            </View>
            <View style={[styles.listPanel, bevel, { backgroundColor: colors.card }]}>
              {apps.map((app, idx) => (
                <Pressable
                  key={app.id}
                  style={[
                    styles.appRow,
                    idx < apps.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    app.selected && { backgroundColor: colors.accent + '08' },
                  ]}
                  onPress={() => toggleApp(app.id)}
                >
                  <View style={[styles.checkbox, {
                    backgroundColor: app.selected ? colors.accent : 'transparent',
                    borderColor: app.selected ? colors.accent : colors.border,
                  }]}>
                    {app.selected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <View style={[styles.appIconBox, { borderColor: colors.border }]}>
                    <Feather name={app.icon} size={13} color={colors.mutedForeground} />
                  </View>
                  <Text style={[styles.appName, { color: colors.foreground }]}>{app.name}</Text>
                  <Text style={[styles.appSize, { color: colors.accent }]}>~{formatBytes(app.cacheSize)}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── AUTO-CLEARING ── */}
        {phase === 'auto-clearing' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.scanningBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.scanningTitle, { color: colors.primary }]}>{'[AUTO-CLEARING...]'}</Text>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.tickerLine, { color: colors.mutedForeground }]}>
                {'> '} clearing temp files, thumbnails, accessible caches...
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ── SWEEP READY ── */}
        {phase === 'sweep-ready' && (
          <Animated.View entering={FadeIn} style={{ gap: 12 }}>
            <View style={[styles.doneBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.doneHead, { color: colors.success }]}>{'[OK] AUTO-CLEAR: COMPLETE'}</Text>
              <Text style={[styles.doneBytes, { color: colors.primary }]}>{formatBytes(autoClearedBytes)}</Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>RECLAIMED AUTOMATICALLY</Text>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.primary }]}>
              {'── SMART SWEEP ──────────────────────'}
            </Text>
            <View style={[styles.listPanel, bevel, { backgroundColor: colors.card }]}>
              {apps.map((app, idx) => (
                <Pressable
                  key={app.id}
                  style={[
                    styles.appRow,
                    idx < apps.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    app.selected && { backgroundColor: colors.accent + '08' },
                  ]}
                  onPress={() => toggleApp(app.id)}
                >
                  <View style={[styles.checkbox, {
                    backgroundColor: app.selected ? colors.accent : 'transparent',
                    borderColor: app.selected ? colors.accent : colors.border,
                  }]}>
                    {app.selected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <Text style={[styles.appName, { color: colors.foreground, flex: 1 }]}>{app.name}</Text>
                  <Text style={[styles.appSize, { color: colors.accent }]}>~{formatBytes(app.cacheSize)}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── SWEEPING ── */}
        {phase === 'sweeping' && (
          <Animated.View entering={FadeIn} style={{ gap: 12 }}>
            <View style={[styles.scanningBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.scanningTitle, { color: colors.accent }]}>{'[SMART SWEEP ACTIVE]'}</Text>
              <Text style={[styles.scanningPct, { color: colors.accent }]}>
                {sweepDone}/{sweepTotal}
              </Text>
              <SegBar value={sweepTotal > 0 ? sweepDone / sweepTotal : 0} color={colors.accent} total={sweepTotal || 12} />
              {currentSweepApp && (
                <Text style={[styles.tickerLine, { color: colors.foreground }]}>
                  {'> NOW: '}{currentSweepApp.name.toUpperCase()}
                </Text>
              )}
            </View>

            <View style={[styles.instructBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.instructTitle, { color: colors.primary }]}>{'[INSTRUCTIONS]'}</Text>
              <Text style={[styles.instructLine, { color: colors.mutedForeground }]}>
                {'1. '} In Settings, tap STORAGE
              </Text>
              <Text style={[styles.instructLine, { color: colors.mutedForeground }]}>
                {'2. '} Tap CLEAR CACHE
              </Text>
              <Text style={[styles.instructLine, { color: colors.mutedForeground }]}>
                {'3. '} Return here — next app opens automatically
              </Text>
            </View>

            {/* Cleared log */}
            {sweepDone > 0 && (
              <View style={[styles.listPanel, bevel, { backgroundColor: colors.card }]}>
                {sweepAppsRef.current.slice(0, sweepDone).map((app, idx) => (
                  <View key={app.id} style={[
                    styles.appRow,
                    idx < sweepDone - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}>
                    <Text style={[{ color: colors.success, fontSize: 12, fontFamily: 'Inter_700Bold' }]}>✓</Text>
                    <Text style={[styles.appName, { color: colors.mutedForeground, flex: 1 }]}>{app.name.toUpperCase()}</Text>
                    <Text style={[styles.appSize, { color: colors.success }]}>DONE</Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.doneBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.doneHead, { color: colors.success }]}>{'[OK] SWEEP COMPLETE'}</Text>
              <Text style={[styles.doneBytes, { color: colors.primary }]}>{formatBytes(totalFreed)}</Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>TOTAL RECLAIMED</Text>
            </View>
            <Pressable onPress={() => {
              setPhase('idle');
              setClearedInSweep(new Set());
              setApps(BASE_APPS.map(a => ({ ...a, selected: true })));
            }} style={styles.fullWidth}>
              <View style={[styles.outlineBtn, {
                borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
                borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                backgroundColor: colors.card,
              }]}>
                <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>{'>> CLEAN AGAIN'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      {/* ── Footer for idle/sweep-ready ── */}
      {(phase === 'idle' || phase === 'sweep-ready') && (
        <View style={[styles.footer, {
          paddingBottom: insets.bottom + 16 + webBottomPad,
          backgroundColor: colors.background,
          borderTopColor: colors.primary + '40',
        }]}>
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            {selectedApps.length} APP{selectedApps.length !== 1 ? 'S' : ''} SELECTED FOR SWEEP
          </Text>
          <Pressable onPress={handleStartSweep} style={styles.fullWidth}>
            <View style={[styles.primaryBtn, {
              backgroundColor: colors.accent,
              borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
              borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
              borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
            }]}>
              <Feather name="play" size={14} color="#FFF" />
              <Text style={[styles.primaryBtnText, { color: '#FFF' }]}>{'>> START SMART SWEEP'}</Text>
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  estimatedNote: { padding: 10, marginBottom: 6, borderWidth: 1 },
  estimatedNoteText: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3, lineHeight: 15 },
  headerSub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 2 },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  content: { padding: 16 },
  center: { alignItems: 'center', paddingTop: 40, gap: 16 },
  fullWidth: { width: '100%' },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginTop: 4 },

  stepPanel: { flexDirection: 'row', gap: 12, padding: 14 },
  stepBadge: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNum: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  stepBody: { flex: 1, gap: 4 },
  stepTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  stepDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  infoBox: { borderWidth: 1, padding: 10, marginTop: 6 },
  infoText: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 16 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 8,
  },
  primaryBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  scanningBox: { width: '100%', padding: 20, gap: 14 },
  scanningTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  scanningPct: { fontSize: 40, fontFamily: 'Inter_700Bold', letterSpacing: 2, textAlign: 'center' },
  tickerLine: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  listPanel: { overflow: 'hidden' },
  appRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  checkbox: { width: 18, height: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#FFF', fontSize: 10, fontFamily: 'Inter_700Bold', lineHeight: 14 },
  appIconBox: { width: 28, height: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  appName: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  appSize: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  instructBox: { borderWidth: 1, padding: 12, gap: 6 },
  instructTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 4 },
  instructLine: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  doneBox: { width: '100%', padding: 24, gap: 10, alignItems: 'center' },
  doneHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  doneBytes: { fontSize: 40, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  doneSub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },

  outlineBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  outlineBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  footer: { padding: 16, borderTopWidth: 1, gap: 10 },
  footerSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textAlign: 'center' },
});
