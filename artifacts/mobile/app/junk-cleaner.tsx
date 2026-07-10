import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface JunkItem {
  id: string;
  name: string;
  size: number;
  category: 'apk' | 'empty_folder' | 'temp' | 'download';
  selected: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

const CAT_LABELS: Record<string, string> = {
  apk: 'OLD APK',
  empty_folder: 'EMPTY DIR',
  temp: 'TEMP FILE',
  download: 'LEFTOVER DL',
};

const CAT_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  apk: 'package',
  empty_folder: 'folder',
  temp: 'file',
  download: 'download',
};

function generateMockJunk(): JunkItem[] {
  return [
    { id: '1', name: 'WhatsApp_2024.apk', size: 48 * 1024 * 1024, category: 'apk', selected: true },
    { id: '2', name: 'update_backup.apk', size: 32 * 1024 * 1024, category: 'apk', selected: true },
    { id: '3', name: 'com.android.gallery/.cache', size: 0, category: 'empty_folder', selected: true },
    { id: '4', name: '.tmp_download_3847', size: 2.1 * 1024 * 1024, category: 'temp', selected: true },
    { id: '5', name: '.tmp_extract_1293', size: 1.4 * 1024 * 1024, category: 'temp', selected: true },
    { id: '6', name: 'video_download_old.mp4.part', size: 89 * 1024 * 1024, category: 'download', selected: true },
    { id: '7', name: 'document_temp.pdf', size: 4.7 * 1024 * 1024, category: 'download', selected: true },
    { id: '8', name: 'log_backup_2024.txt', size: 12 * 1024 * 1024, category: 'temp', selected: true },
    { id: '9', name: '.empty_screenshots', size: 0, category: 'empty_folder', selected: true },
    { id: '10', name: 'instagram_cache_old.apk', size: 56 * 1024 * 1024, category: 'apk', selected: true },
  ];
}

/** Retro segmented progress bar */
function SegBar({ value, color, total = 24 }: { value: number; color: string; total?: number }) {
  const colors = useColors();
  const filled = Math.max(0, Math.min(total, Math.round(value * total)));
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 8, backgroundColor: i < filled ? color : colors.border }} />
      ))}
    </View>
  );
}

/** Retro scan ticker — cycles through fake filenames while scanning */
function ScanTicker({ active }: { active: boolean }) {
  const colors = useColors();
  const lines = [
    'checking /data/local/tmp...',
    'reading /sdcard/Downloads...',
    'scanning residual APKs...',
    'checking /cache/dalvik...',
    'reading temp directories...',
    'scanning .nomedia folders...',
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIdx(i => (i + 1) % lines.length), 500);
    return () => clearInterval(id);
  }, [active]);
  return (
    <Text style={[styles.tickerLine, { color: colors.mutedForeground }]} numberOfLines={1}>
      {'> '}{lines[idx]}
    </Text>
  );
}

export default function JunkCleanerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem } = useCleaner();

  const [phase, setPhase] = useState<'idle' | 'scanning' | 'results' | 'cleaning' | 'done'>('idle');
  const [items, setItems] = useState<JunkItem[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [bytesFreed, setBytesFreed] = useState(0);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const startScan = useCallback(async () => {
    setPhase('scanning');
    setScanProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await FileSystem.getInfoAsync(FileSystem.cacheDirectory!);
    } catch {}

    for (let i = 0; i <= 100; i += 8) {
      await new Promise(r => setTimeout(r, 110));
      setScanProgress(Math.min(i, 100));
    }

    setItems(generateMockJunk());
    setPhase('results');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const toggleItem = (id: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i));

  const selectAll = () => {
    const allSelected = items.every(i => i.selected);
    setItems(prev => prev.map(i => ({ ...i, selected: !allSelected })));
  };

  const selectedItems = items.filter(i => i.selected);
  const selectedSize = selectedItems.reduce((acc, i) => acc + i.size, 0);
  const totalSize = items.reduce((acc, i) => acc + i.size, 0);

  const handleClean = async () => {
    if (selectedItems.length === 0) return;
    setPhase('cleaning');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try { await FileSystem.deleteAsync(FileSystem.cacheDirectory!, { idempotent: true }); } catch {}
    await new Promise(r => setTimeout(r, 1500));
    setBytesFreed(selectedSize);
    await addHistoryItem({
      date: new Date().toISOString(),
      bytesFreed: selectedSize,
      type: 'junk',
      label: `Junk Cleaner — ${selectedItems.length} items`,
    });
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Bevel helpers
  const bevelRaised = {
    borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
    borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, {
        paddingTop: insets.top + 12 + webTopPad,
        backgroundColor: colors.background,
        borderBottomColor: colors.primary + '40',
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, bevelRaised, { backgroundColor: colors.card }]}>
          <Feather name="arrow-left" size={16} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{'> MODULE'}</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>JUNK CLEANER</Text>
        </View>
        {phase === 'results'
          ? <Pressable onPress={selectAll} style={[styles.selectAllBtn, { borderColor: colors.border }]}>
              <Text style={[styles.selectAllText, { color: colors.primary }]}>
                {items.every(i => i.selected) ? 'NONE' : 'ALL'}
              </Text>
            </Pressable>
          : <View style={{ width: 48 }} />
        }
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 + webBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.idleIconBox, bevelRaised, { backgroundColor: colors.card }]}>
              <Feather name="trash-2" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.idleTitle, { color: colors.foreground }]}>JUNK CLEANER</Text>
            <View style={[styles.idleInfoBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              {['Old APK installers', 'Empty folders', 'Temp files', 'Partial downloads'].map(line => (
                <Text key={line} style={[styles.idleInfoLine, { color: colors.mutedForeground }]}>
                  {'[+] '}{line}
                </Text>
              ))}
            </View>
            <Pressable onPress={startScan} style={styles.fullWidth}>
              <View style={[styles.primaryBtn, {
                backgroundColor: colors.primary,
                borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              }]}>
                <Feather name="search" size={16} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                  {'>> START SCAN'}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* ── SCANNING ── */}
        {phase === 'scanning' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.scanningBox, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.scanningTitle, { color: colors.primary }]}>
                {'[SCANNING...]'}
              </Text>
              <Text style={[styles.scanningPct, { color: colors.primary }]}>
                {String(scanProgress).padStart(3, '0')}%
              </Text>
              <SegBar value={scanProgress / 100} color={colors.primary} />
              <ScanTicker active />
            </View>
          </Animated.View>
        )}

        {/* ── RESULTS / CLEANING ── */}
        {(phase === 'results' || phase === 'cleaning') && items.length > 0 && (
          <Animated.View entering={FadeIn}>
            {/* Summary readout */}
            <View style={[styles.summaryPanel, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.summaryHead, { color: colors.primary }]}>{'[SCAN COMPLETE]'}</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>TOTAL_JUNK</Text>
                <Text style={[styles.summarySep, { color: colors.border }]}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: colors.accent }]}>{formatBytes(totalSize)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>FILES_FOUND</Text>
                <Text style={[styles.summarySep, { color: colors.border }]}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>{items.length}</Text>
              </View>
            </View>

            {/* File list */}
            <View style={[styles.listPanel, bevelRaised, { backgroundColor: colors.card }]}>
              {items.map((item, idx) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.itemRow,
                    idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    item.selected && { backgroundColor: colors.primary + '08' },
                  ]}
                  onPress={() => toggleItem(item.id)}
                >
                  {/* Square checkbox */}
                  <View style={[styles.checkbox, {
                    backgroundColor: item.selected ? colors.primary : 'transparent',
                    borderColor: item.selected ? colors.primary : colors.border,
                  }]}>
                    {item.selected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  {/* Icon */}
                  <View style={[styles.itemIconBox, { borderColor: colors.border }]}>
                    <Feather name={CAT_ICONS[item.category]} size={14} color={colors.mutedForeground} />
                  </View>
                  {/* Info */}
                  <View style={styles.itemContent}>
                    <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.itemCat, { color: colors.mutedForeground }]}>{CAT_LABELS[item.category]}</Text>
                  </View>
                  <Text style={[styles.itemSize, { color: item.selected ? colors.primary : colors.mutedForeground }]}>
                    {item.size > 0 ? formatBytes(item.size) : '0 B'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.doneBox, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.doneHead, { color: colors.success }]}>{'[OK] CLEAN COMPLETE'}</Text>
              <Text style={[styles.doneBytes, { color: colors.primary }]}>{formatBytes(bytesFreed)}</Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>FREED FROM DEVICE</Text>
            </View>
            <Pressable onPress={() => { setPhase('idle'); setItems([]); }} style={styles.fullWidth}>
              <View style={[styles.outlineBtn, {
                borderColor: colors.border, backgroundColor: colors.card,
                borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
                borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              }]}>
                <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>{'>> SCAN AGAIN'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      {/* ── Footer ── */}
      {(phase === 'results' || phase === 'cleaning') && (
        <View style={[styles.footer, {
          paddingBottom: insets.bottom + 16 + webBottomPad,
          backgroundColor: colors.background,
          borderTopColor: colors.primary + '40',
        }]}>
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            {selectedItems.length} SELECTED  ·  {formatBytes(selectedSize)}
          </Text>
          <Pressable
            onPress={handleClean}
            disabled={selectedItems.length === 0 || phase === 'cleaning'}
            style={styles.fullWidth}
          >
            <View style={[styles.primaryBtn, {
              backgroundColor: selectedItems.length > 0 ? colors.primary : colors.muted,
              borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
              borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
              borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              opacity: selectedItems.length === 0 ? 0.5 : 1,
            }]}>
              {phase === 'cleaning'
                ? <ActivityIndicator color={colors.primaryForeground} size="small" />
                : <>
                    <Feather name="trash-2" size={16} color={colors.primaryForeground} />
                    <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                      {'>> CLEAN SELECTED'}
                    </Text>
                  </>
              }
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
  headerSub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 2 },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  selectAllBtn: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  selectAllText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  content: { padding: 16, gap: 12 },
  center: { alignItems: 'center', paddingTop: 40, gap: 16 },
  fullWidth: { width: '100%' },

  idleIconBox: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  idleTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  idleInfoBox: { width: '100%', borderWidth: 1, padding: 14, gap: 6 },
  idleInfoLine: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 10,
  },
  primaryBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  scanningBox: { width: '100%', padding: 20, gap: 14 },
  scanningTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  scanningPct: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 2, textAlign: 'center' },
  tickerLine: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  summaryPanel: { padding: 14, gap: 6, marginBottom: 10 },
  summaryHead: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 6 },
  summaryRow: { flexDirection: 'row' },
  summaryKey: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, width: 120 },
  summarySep: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  summaryVal: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  listPanel: { overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  checkbox: { width: 18, height: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#FFF', fontSize: 10, fontFamily: 'Inter_700Bold', lineHeight: 14 },
  itemIconBox: { width: 32, height: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemContent: { flex: 1 },
  itemName: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  itemCat: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginTop: 2 },
  itemSize: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  doneBox: { width: '100%', padding: 24, gap: 10, alignItems: 'center' },
  doneHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  doneBytes: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  doneSub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },

  outlineBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  outlineBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  footer: { padding: 16, borderTopWidth: 1, gap: 10 },
  footerSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textAlign: 'center' },
});
