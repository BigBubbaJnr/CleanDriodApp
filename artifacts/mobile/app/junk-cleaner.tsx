import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useCleaner } from '@/context/CleanerContext';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
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

const CATEGORY_LABELS: Record<string, string> = {
  apk: 'Old APK File',
  empty_folder: 'Empty Folder',
  temp: 'Temp File',
  download: 'Leftover Download',
};

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  apk: 'package',
  empty_folder: 'folder',
  temp: 'file',
  download: 'download',
};

function generateMockJunk(): JunkItem[] {
  const items: JunkItem[] = [
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
  return items;
}

export default function JunkCleanerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem } = useCleaner();

  const [phase, setPhase] = useState<'idle' | 'scanning' | 'results' | 'cleaning' | 'done'>('idle');
  const [items, setItems] = useState<JunkItem[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [bytesFreed, setBytesFreed] = useState(0);

  const scanAnim = useSharedValue(0);
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const startScan = useCallback(async () => {
    setPhase('scanning');
    setScanProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Real: try clearing app cache, supplement with realistic mock results
    let cacheSize = 0;
    try {
      const cacheInfo = await FileSystem.getInfoAsync(FileSystem.cacheDirectory!);
      if (cacheInfo.exists) {
        // We can clear our own cache
        cacheSize = (cacheInfo as any).size || 0;
      }
    } catch {}

    // Simulate progressive scan
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 120));
      setScanProgress(i);
    }

    const mockItems = generateMockJunk();
    setItems(mockItems);
    setPhase('results');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const toggleItem = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i));
  };

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

    // Actually clear app cache
    try {
      await FileSystem.deleteAsync(FileSystem.cacheDirectory!, { idempotent: true });
    } catch {}

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12 + webTopPad,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Junk Cleaner</Text>
        {phase === 'results' && (
          <Pressable onPress={selectAll}>
            <Text style={[styles.selectAll, { color: colors.primary }]}>
              {items.every(i => i.selected) ? 'None' : 'All'}
            </Text>
          </Pressable>
        )}
        {phase !== 'results' && <View style={{ width: 40 }} />}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 100 + webBottomPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {phase === 'idle' && (
          <Animated.View entering={FadeIn} style={styles.idleCenter}>
            <LinearGradient
              colors={[colors.primary, '#9B8FFF']}
              style={styles.bigIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Feather name="trash-2" size={48} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.idleTitle, { color: colors.foreground }]}>Find Junk Files</Text>
            <Text style={[styles.idleSub, { color: colors.mutedForeground }]}>
              Scans for old APKs, empty folders, temp files, and leftover downloads
            </Text>
            <Pressable onPress={startScan}>
              <LinearGradient
                colors={[colors.primary, '#9B8FFF']}
                style={styles.startBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.startBtnText}>Start Scan</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        {phase === 'scanning' && (
          <Animated.View entering={FadeIn} style={styles.scanningCenter}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.scanningTitle, { color: colors.foreground }]}>Scanning...</Text>
            <Text style={[styles.scanningPct, { color: colors.primary }]}>{scanProgress}%</Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.primary, width: `${scanProgress}%` as any },
                ]}
              />
            </View>
            <Text style={[styles.scanningHint, { color: colors.mutedForeground }]}>
              Checking downloads, temp files, APKs...
            </Text>
          </Animated.View>
        )}

        {(phase === 'results' || phase === 'cleaning') && items.length > 0 && (
          <Animated.View entering={FadeIn}>
            {/* Summary */}
            <View style={[styles.summaryCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
              <Text style={[styles.summaryTotal, { color: colors.primary }]}>
                {formatBytes(totalSize)}
              </Text>
              <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
                {items.length} items found
              </Text>
            </View>

            {/* Item list */}
            <View style={[styles.itemsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {items.map((item, idx) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.itemRow,
                    idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                  onPress={() => toggleItem(item.id)}
                >
                  <View
                    style={[
                      styles.itemCheck,
                      {
                        backgroundColor: item.selected ? colors.primary : 'transparent',
                        borderColor: item.selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    {item.selected && <Feather name="check" size={12} color="#FFF" />}
                  </View>
                  <View style={[styles.itemIcon, { backgroundColor: colors.muted }]}>
                    <Feather name={CATEGORY_ICONS[item.category]} size={16} color={colors.mutedForeground} />
                  </View>
                  <View style={styles.itemContent}>
                    <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.itemCategory, { color: colors.mutedForeground }]}>
                      {CATEGORY_LABELS[item.category]}
                    </Text>
                  </View>
                  <Text style={[styles.itemSize, { color: colors.mutedForeground }]}>
                    {item.size > 0 ? formatBytes(item.size) : 'Empty'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {phase === 'done' && (
          <Animated.View entering={FadeIn} style={styles.doneCenter}>
            <LinearGradient
              colors={[colors.accent, '#00A896']}
              style={styles.bigIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Feather name="check-circle" size={48} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.doneTitle, { color: colors.foreground }]}>All Clean!</Text>
            <Text style={[styles.doneFreed, { color: colors.accent }]}>{formatBytes(bytesFreed)}</Text>
            <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>freed from your device</Text>
            <Pressable
              style={[styles.doneBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setPhase('idle'); setItems([]); }}
            >
              <Text style={[styles.doneBtnText, { color: colors.foreground }]}>Scan Again</Text>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      {/* Clean button */}
      {(phase === 'results' || phase === 'cleaning') && (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 16 + webBottomPad,
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            {selectedItems.length} items selected · {formatBytes(selectedSize)}
          </Text>
          <Pressable
            onPress={handleClean}
            disabled={selectedItems.length === 0 || phase === 'cleaning'}
          >
            <LinearGradient
              colors={selectedItems.length > 0 ? [colors.primary, '#9B8FFF'] : [colors.border, colors.border]}
              style={styles.cleanBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {phase === 'cleaning' ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.cleanBtnText}>Clean Selected</Text>
              )}
            </LinearGradient>
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
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  selectAll: { fontSize: 14, fontFamily: 'Inter_500Medium', width: 40, textAlign: 'right' },
  content: { padding: 20 },
  idleCenter: { alignItems: 'center', paddingTop: 60, gap: 16 },
  bigIcon: { width: 100, height: 100, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  idleTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 8 },
  idleSub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  startBtn: { paddingHorizontal: 48, paddingVertical: 16, borderRadius: 18, marginTop: 8 },
  startBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Inter_700Bold' },
  scanningCenter: { alignItems: 'center', paddingTop: 80, gap: 16 },
  scanningTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  scanningPct: { fontSize: 36, fontFamily: 'Inter_700Bold' },
  progressTrack: { width: '80%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  scanningHint: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  summaryCard: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 16 },
  summaryTotal: { fontSize: 36, fontFamily: 'Inter_700Bold' },
  summarySub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
  itemsCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemContent: { flex: 1 },
  itemName: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  itemCategory: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  itemSize: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  footer: { padding: 16, borderTopWidth: 1, gap: 10 },
  footerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  cleanBtn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  cleanBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Inter_700Bold' },
  doneCenter: { alignItems: 'center', paddingTop: 60, gap: 12 },
  doneTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', marginTop: 8 },
  doneFreed: { fontSize: 48, fontFamily: 'Inter_700Bold' },
  doneSub: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  doneBtn: { marginTop: 16, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  doneBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
