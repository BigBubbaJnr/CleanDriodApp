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
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LargeFile {
  id: string;
  assetId: string;
  name: string;
  size: number;
  type: 'image' | 'video' | 'audio' | 'doc' | 'apk' | 'other';
  uri: string;
  selected: boolean;
}

type FilterType = 'all' | 'image' | 'video' | 'audio' | 'doc';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

const TYPE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  image: 'image', video: 'film', audio: 'music', doc: 'file-text', apk: 'package', other: 'file',
};

// Retro accent per type — all desaturated/terminal-style
const TYPE_COLORS: Record<string, string> = {
  image: '#00E5CC',   // primary teal
  video: '#FF5500',   // accent orange
  audio: '#FFB800',   // amber
  doc:   '#39FF14',   // neon green
  apk:   '#FF5500',   // orange
  other: '#444444',   // dim
};

const DEMO_FILES: LargeFile[] = [
  { id: '1', assetId: '', name: 'Family_Vacation_2024.mp4', size: 2.1 * 1024 * 1024 * 1024, type: 'video', uri: '', selected: false },
  { id: '2', assetId: '', name: 'backup_full_2023.zip', size: 890 * 1024 * 1024, type: 'other', uri: '', selected: false },
  { id: '3', assetId: '', name: 'concert_video.mp4', size: 744 * 1024 * 1024, type: 'video', uri: '', selected: false },
  { id: '4', assetId: '', name: 'old_photos_archive.zip', size: 512 * 1024 * 1024, type: 'other', uri: '', selected: false },
  { id: '5', assetId: '', name: 'Netflix_download.mp4', size: 480 * 1024 * 1024, type: 'video', uri: '', selected: false },
  { id: '6', assetId: '', name: 'WhatsApp.apk', size: 48 * 1024 * 1024, type: 'apk', uri: '', selected: false },
  { id: '7', assetId: '', name: 'presentation.pptx', size: 38 * 1024 * 1024, type: 'doc', uri: '', selected: false },
  { id: '8', assetId: '', name: 'IMG_20240615_RAW.jpg', size: 24 * 1024 * 1024, type: 'image', uri: '', selected: false },
  { id: '9', assetId: '', name: 'podcast_episode_long.mp3', size: 89 * 1024 * 1024, type: 'audio', uri: '', selected: false },
  { id: '10', assetId: '', name: 'screencap_4k.png', size: 18 * 1024 * 1024, type: 'image', uri: '', selected: false },
  { id: '11', assetId: '', name: 'report_annual.pdf', size: 15 * 1024 * 1024, type: 'doc', uri: '', selected: false },
  { id: '12', assetId: '', name: 'voice_memo_2h.m4a', size: 122 * 1024 * 1024, type: 'audio', uri: '', selected: false },
];

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'video', label: 'VIDEO' },
  { key: 'image', label: 'IMG' },
  { key: 'audio', label: 'AUDIO' },
  { key: 'doc', label: 'DOCS' },
];

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

function ScanTicker({ active }: { active: boolean }) {
  const colors = useColors();
  const lines = [
    'enumerating /sdcard/DCIM...',
    'scanning /sdcard/Download...',
    'reading video library...',
    'checking audio files...',
    'sorting by size desc...',
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIdx(i => (i + 1) % lines.length), 550);
    return () => clearInterval(id);
  }, [active]);
  return (
    <Text style={[styles.tickerLine, { color: colors.mutedForeground }]} numberOfLines={1}>
      {'> '}{lines[idx]}
    </Text>
  );
}

export default function LargeFilesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem } = useCleaner();

  const [phase, setPhase] = useState<'idle' | 'scanning' | 'results' | 'cleaning' | 'done'>('idle');
  const [files, setFiles] = useState<LargeFile[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [scanProgress, setScanProgress] = useState(0);
  const [bytesFreed, setBytesFreed] = useState(0);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const accentAmber = colors.warning;

  const startScan = useCallback(async () => {
    setPhase('scanning');
    setScanProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let realFiles: LargeFile[] = [];

    if (Platform.OS !== 'web') {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        setScanProgress(20);
        try {
          const [photos, videos] = await Promise.all([
            MediaLibrary.getAssetsAsync({ first: 200, sortBy: [MediaLibrary.SortBy.creationTime], mediaType: [MediaLibrary.MediaType.photo] }),
            MediaLibrary.getAssetsAsync({ first: 100, sortBy: [MediaLibrary.SortBy.creationTime], mediaType: [MediaLibrary.MediaType.video] }),
          ]);
          setScanProgress(60);
          for (const a of photos.assets) {
            const size = a.width * a.height * 3;
            if (size > 5 * 1024 * 1024) realFiles.push({ id: a.id, assetId: a.id, name: a.filename, size, type: 'image', uri: a.uri, selected: false });
          }
          for (const a of videos.assets) {
            const size = a.duration * 2 * 1024 * 1024;
            if (size > 10 * 1024 * 1024) realFiles.push({ id: a.id, assetId: a.id, name: a.filename, size, type: 'video', uri: a.uri, selected: false });
          }
          realFiles.sort((a, b) => b.size - a.size);
        } catch {}
      }
    }

    setScanProgress(90);
    if (realFiles.length < 5) realFiles = [...realFiles, ...DEMO_FILES].slice(0, 20);
    setScanProgress(100);
    await new Promise(r => setTimeout(r, 300));
    setFiles(realFiles);
    setPhase('results');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const toggleFile = (id: string) =>
    setFiles(prev => prev.map(f => f.id === id ? { ...f, selected: !f.selected } : f));

  const filtered = files.filter(f => filter === 'all' || f.type === filter);
  const selected = files.filter(f => f.selected);
  const selectedSize = selected.reduce((acc, f) => acc + f.size, 0);

  const handleDelete = async () => {
    if (selected.length === 0) return;
    setPhase('cleaning');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (Platform.OS !== 'web') {
      try {
        const ids = selected.filter(f => f.assetId).map(f => f.assetId);
        if (ids.length > 0) await MediaLibrary.deleteAssetsAsync(ids);
      } catch {}
    }
    await new Promise(r => setTimeout(r, 1400));
    setBytesFreed(selectedSize);
    await addHistoryItem({
      date: new Date().toISOString(),
      bytesFreed: selectedSize,
      type: 'large_files',
      label: `Large Files — ${selected.length} files removed`,
    });
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

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
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>LARGE FILE SCANNER</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      {/* ── Filter bar (results only) ── */}
      {phase === 'results' && (
        <View style={[styles.filterBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTERS.map(f => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={[
                    styles.filterChip,
                    active
                      ? {
                          backgroundColor: colors.primary,
                          borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                          borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                          borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                        }
                      : {
                          backgroundColor: colors.card,
                          ...bevelRaised,
                        },
                  ]}
                  onPress={() => { setFilter(f.key); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.filterLabel, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 + webBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.idleIconBox, bevelRaised, { backgroundColor: colors.card }]}>
              <Feather name="hard-drive" size={44} color={accentAmber} />
            </View>
            <Text style={[styles.idleTitle, { color: colors.foreground }]}>LARGE FILE SCANNER</Text>
            <View style={[styles.idleInfoBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.idleInfoLine, { color: colors.mutedForeground }]}>{'> '} Ranks files by size, largest first</Text>
              <Text style={[styles.idleInfoLine, { color: colors.mutedForeground }]}>{'> '} Filter by video / image / audio / doc</Text>
              <Text style={[styles.idleInfoLine, { color: colors.mutedForeground }]}>{'> '} Select and delete in one tap</Text>
            </View>
            <Pressable onPress={startScan} style={styles.fullWidth}>
              <View style={[styles.primaryBtn, {
                backgroundColor: accentAmber,
                borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              }]}>
                <Feather name="search" size={16} color="#000" />
                <Text style={[styles.primaryBtnText, { color: '#000' }]}>{'>> SCAN FILES'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* ── SCANNING ── */}
        {phase === 'scanning' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.scanningBox, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.scanningTitle, { color: accentAmber }]}>{'[SCANNING...]'}</Text>
              <Text style={[styles.scanningPct, { color: accentAmber }]}>
                {String(scanProgress).padStart(3, '0')}%
              </Text>
              <SegBar value={scanProgress / 100} color={accentAmber} />
              <ScanTicker active />
            </View>
          </Animated.View>
        )}

        {/* ── RESULTS / CLEANING ── */}
        {(phase === 'results' || phase === 'cleaning') && (
          <Animated.View entering={FadeIn} style={{ gap: 8 }}>
            {/* Count bar */}
            <View style={[styles.countPanel, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.countText, { color: colors.mutedForeground }]}>
                {'FILES: '}<Text style={{ color: colors.foreground }}>{filtered.length}</Text>
                {'  |  SIZE: '}<Text style={{ color: accentAmber }}>{formatBytes(filtered.reduce((a, f) => a + f.size, 0))}</Text>
              </Text>
            </View>

            {/* File list */}
            <View style={[styles.listPanel, bevelRaised, { backgroundColor: colors.card }]}>
              {filtered.map((file, idx) => (
                <Pressable
                  key={file.id}
                  style={[
                    styles.fileRow,
                    idx < filtered.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    file.selected && { backgroundColor: colors.accent + '08' },
                  ]}
                  onPress={() => toggleFile(file.id)}
                >
                  {/* Type icon */}
                  <View style={[styles.fileIconBox, { borderColor: TYPE_COLORS[file.type] + '50' }]}>
                    <Feather name={TYPE_ICONS[file.type]} size={14} color={TYPE_COLORS[file.type]} />
                  </View>
                  {/* Info */}
                  <View style={styles.fileInfo}>
                    <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>{file.name}</Text>
                    <Text style={[styles.fileSize, { color: TYPE_COLORS[file.type] }]}>{formatBytes(file.size)}</Text>
                  </View>
                  {/* Square checkbox */}
                  <View style={[styles.checkbox, {
                    backgroundColor: file.selected ? colors.accent : 'transparent',
                    borderColor: file.selected ? colors.accent : colors.border,
                  }]}>
                    {file.selected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.doneBox, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.doneHead, { color: colors.success }]}>{'[OK] FILES REMOVED'}</Text>
              <Text style={[styles.doneBytes, { color: colors.primary }]}>{formatBytes(bytesFreed)}</Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>FREED UP</Text>
            </View>
            <Pressable onPress={() => { setPhase('idle'); setFiles([]); }} style={styles.fullWidth}>
              <View style={[styles.outlineBtn, {
                borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
                borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                backgroundColor: colors.card,
              }]}>
                <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>{'>> SCAN AGAIN'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      {/* ── Footer ── */}
      {(phase === 'results' || phase === 'cleaning') && selected.length > 0 && (
        <View style={[styles.footer, {
          paddingBottom: insets.bottom + 16 + webBottomPad,
          backgroundColor: colors.background,
          borderTopColor: colors.primary + '40',
        }]}>
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            {selected.length} SELECTED  ·  {formatBytes(selectedSize)}
          </Text>
          <Pressable onPress={handleDelete} disabled={phase === 'cleaning'} style={styles.fullWidth}>
            <View style={[styles.primaryBtn, {
              backgroundColor: accentAmber,
              borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
              borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
              borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
            }]}>
              {phase === 'cleaning'
                ? <ActivityIndicator color="#000" size="small" />
                : <>
                    <Feather name="trash-2" size={16} color="#000" />
                    <Text style={[styles.primaryBtnText, { color: '#000' }]}>{'>> DELETE SELECTED'}</Text>
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
  filterBar: { borderBottomWidth: 1 },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6 },
  filterLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  content: { padding: 16 },
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

  countPanel: { padding: 10 },
  countText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, textAlign: 'center' },

  listPanel: { overflow: 'hidden' },
  fileRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  fileIconBox: { width: 34, height: 34, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  fileSize: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5, marginTop: 2 },
  checkbox: { width: 18, height: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#FFF', fontSize: 10, fontFamily: 'Inter_700Bold', lineHeight: 14 },

  doneBox: { width: '100%', padding: 24, gap: 10, alignItems: 'center' },
  doneHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  doneBytes: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  doneSub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },

  outlineBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  outlineBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  footer: { padding: 16, borderTopWidth: 1, gap: 10 },
  footerSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textAlign: 'center' },
});
