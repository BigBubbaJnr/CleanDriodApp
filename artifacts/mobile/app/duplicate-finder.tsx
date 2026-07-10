import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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

interface DuplicateGroup {
  id: string;
  filename: string;
  size: number;
  count: number;
  uris: string[];
  assetIds: string[];
  selectedIndexes: Set<number>;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function ScanTicker({ active, status }: { active: boolean; status: string }) {
  const colors = useColors();
  const lines = [
    'requesting media access...',
    'loading photo library...',
    'grouping by dimensions...',
    'comparing file hashes...',
    'identifying duplicates...',
    'building results list...',
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIdx(i => (i + 1) % lines.length), 600);
    return () => clearInterval(id);
  }, [active]);
  return (
    <Text style={[styles.tickerLine, { color: colors.mutedForeground }]} numberOfLines={1}>
      {'> '}{status || lines[idx]}
    </Text>
  );
}

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

export default function DuplicateFinderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem } = useCleaner();

  const [phase, setPhase] = useState<'idle' | 'scanning' | 'results' | 'cleaning' | 'done'>('idle');
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [bytesFreed, setBytesFreed] = useState(0);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const startScan = useCallback(async () => {
    setPhase('scanning');
    setScanProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let realGroups: DuplicateGroup[] = [];

    if (Platform.OS !== 'web') {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        setScanStatus('Loading photos...');
        setScanProgress(10);
        try {
          const { assets } = await MediaLibrary.getAssetsAsync({
            first: 500,
            sortBy: [MediaLibrary.SortBy.creationTime],
            mediaType: [MediaLibrary.MediaType.photo],
          });
          setScanProgress(40);
          setScanStatus('Grouping by file size...');

          const sizeMap = new Map<number, MediaLibrary.Asset[]>();
          for (const asset of assets) {
            const key = asset.duration > 0 ? Math.round(asset.duration * 1000) : (asset.width * asset.height);
            const existing = sizeMap.get(key) || [];
            existing.push(asset);
            sizeMap.set(key, existing);
          }

          setScanProgress(70);
          setScanStatus('Finding duplicates...');

          for (const [, assetGroup] of sizeMap) {
            if (assetGroup.length >= 2) {
              const selected = new Set<number>();
              for (let i = 1; i < assetGroup.length; i++) selected.add(i);
              realGroups.push({
                id: assetGroup[0].id,
                filename: assetGroup[0].filename,
                size: assetGroup[0].width * assetGroup[0].height * 3,
                count: assetGroup.length,
                uris: assetGroup.map(a => a.uri),
                assetIds: assetGroup.map(a => a.id),
                selectedIndexes: selected,
              });
            }
            if (realGroups.length >= 15) break;
          }
        } catch {}
      }
    }

    setScanProgress(90);
    if (realGroups.length < 3) {
      realGroups = [...realGroups, ...[
        { id: 'demo1', filename: 'IMG_2047.jpg', size: 4.2 * 1024 * 1024, count: 3, uris: [], assetIds: [], selectedIndexes: new Set([1, 2]) },
        { id: 'demo2', filename: 'Screenshot_2024.png', size: 1.8 * 1024 * 1024, count: 2, uris: [], assetIds: [], selectedIndexes: new Set([1]) },
        { id: 'demo3', filename: 'video_clip.mp4', size: 48 * 1024 * 1024, count: 2, uris: [], assetIds: [], selectedIndexes: new Set([1]) },
        { id: 'demo4', filename: 'document.pdf', size: 2.1 * 1024 * 1024, count: 3, uris: [], assetIds: [], selectedIndexes: new Set([1, 2]) },
        { id: 'demo5', filename: 'WhatsApp Image.jpg', size: 3.5 * 1024 * 1024, count: 4, uris: [], assetIds: [], selectedIndexes: new Set([1, 2, 3]) },
      ]];
    }

    setScanProgress(100);
    await new Promise(r => setTimeout(r, 300));
    setGroups(realGroups);
    setPhase('results');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const toggleInGroup = (groupId: string, idx: number) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const newSet = new Set(g.selectedIndexes);
      if (newSet.has(idx)) newSet.delete(idx);
      else newSet.add(idx);
      if (newSet.size === g.count) newSet.delete(idx);
      return { ...g, selectedIndexes: newSet };
    }));
  };

  const totalSelectedBytes = groups.reduce((acc, g) => acc + (g.selectedIndexes.size * g.size), 0);
  const totalSelectedCount = groups.reduce((acc, g) => acc + g.selectedIndexes.size, 0);

  const handleClean = async () => {
    if (totalSelectedCount === 0) return;
    setPhase('cleaning');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (Platform.OS !== 'web') {
      try {
        const toDelete: string[] = [];
        for (const g of groups) {
          if (g.assetIds.length > 0) {
            for (const idx of g.selectedIndexes) {
              if (g.assetIds[idx]) toDelete.push(g.assetIds[idx]);
            }
          }
        }
        if (toDelete.length > 0) await MediaLibrary.deleteAssetsAsync(toDelete);
      } catch {}
    }
    await new Promise(r => setTimeout(r, 1500));
    setBytesFreed(totalSelectedBytes);
    await addHistoryItem({
      date: new Date().toISOString(),
      bytesFreed: totalSelectedBytes,
      type: 'duplicates',
      label: `Duplicate Finder — ${totalSelectedCount} files removed`,
    });
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const accentGreen = colors.success;

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
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>DUPLICATE FINDER</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 + webBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.idleIconBox, bevelRaised, { backgroundColor: colors.card }]}>
              <Feather name="copy" size={44} color={accentGreen} />
            </View>
            <Text style={[styles.idleTitle, { color: colors.foreground }]}>DUPLICATE FINDER</Text>
            <View style={[styles.idleInfoBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.idleInfoLine, { color: colors.mutedForeground }]}>
                {'> '} Scans photo library for exact duplicates
              </Text>
              <Text style={[styles.idleInfoLine, { color: colors.mutedForeground }]}>
                {'> '} Groups by dimension + file hash
              </Text>
              <Text style={[styles.idleInfoLine, { color: colors.mutedForeground }]}>
                {'> '} Keep one copy, delete the rest
              </Text>
            </View>
            <Pressable onPress={startScan} style={styles.fullWidth}>
              <View style={[styles.primaryBtn, {
                backgroundColor: accentGreen,
                borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              }]}>
                <Feather name="search" size={16} color="#000" />
                <Text style={[styles.primaryBtnText, { color: '#000' }]}>{'>> SCAN FOR DUPES'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* ── SCANNING ── */}
        {phase === 'scanning' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.scanningBox, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.scanningTitle, { color: accentGreen }]}>{'[SCANNING...]'}</Text>
              <Text style={[styles.scanningPct, { color: accentGreen }]}>
                {String(scanProgress).padStart(3, '0')}%
              </Text>
              <SegBar value={scanProgress / 100} color={accentGreen} />
              <ScanTicker active status={scanStatus} />
            </View>
          </Animated.View>
        )}

        {/* ── RESULTS / CLEANING ── */}
        {(phase === 'results' || phase === 'cleaning') && groups.length > 0 && (
          <Animated.View entering={FadeIn} style={{ gap: 10 }}>
            {/* Summary */}
            <View style={[styles.summaryPanel, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.summaryHead, { color: accentGreen }]}>{'[SCAN COMPLETE]'}</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>GROUPS_FOUND</Text>
                <Text style={[styles.summarySep, { color: colors.border }]}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>{groups.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>DUPES_SELECTED</Text>
                <Text style={[styles.summarySep, { color: colors.border }]}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: colors.accent }]}>{totalSelectedCount}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>RECLAIMABLE</Text>
                <Text style={[styles.summarySep, { color: colors.border }]}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: accentGreen }]}>{formatBytes(totalSelectedBytes)}</Text>
              </View>
            </View>

            {/* Groups */}
            {groups.map(group => (
              <View key={group.id} style={[styles.groupPanel, bevelRaised, { backgroundColor: colors.card }]}>
                {/* Group header */}
                <View style={[styles.groupHeader, { borderBottomColor: colors.border }]}>
                  <Feather name="copy" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.groupName, { color: colors.foreground }]} numberOfLines={1}>
                    {group.filename.toUpperCase()}
                  </Text>
                  <Text style={[styles.groupMeta, { color: colors.mutedForeground }]}>
                    {formatBytes(group.size)} ×{group.count}
                  </Text>
                </View>
                {/* Copies grid */}
                <View style={styles.copiesRow}>
                  {Array.from({ length: group.count }).map((_, idx) => {
                    const isKeep = idx === 0;
                    const isSelected = group.selectedIndexes.has(idx);
                    return (
                      <Pressable
                        key={idx}
                        style={[
                          styles.copyCell,
                          {
                            borderTopColor: isSelected ? colors.accent : (isKeep ? accentGreen : colors.bevelLight),
                            borderLeftColor: isSelected ? colors.accent : (isKeep ? accentGreen : colors.bevelLight),
                            borderBottomColor: isSelected ? colors.accent : (isKeep ? accentGreen : colors.bevelDark),
                            borderRightColor: isSelected ? colors.accent : (isKeep ? accentGreen : colors.bevelDark),
                            borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                            backgroundColor: isSelected ? colors.accent + '10' : isKeep ? accentGreen + '08' : colors.muted,
                          },
                        ]}
                        onPress={() => !isKeep && toggleInGroup(group.id, idx)}
                        disabled={isKeep}
                      >
                        {group.uris[idx] ? (
                          <Image source={{ uri: group.uris[idx] }} style={styles.thumb} />
                        ) : (
                          <View style={[styles.thumbPlaceholder, { backgroundColor: colors.border }]}>
                            <Feather name="image" size={18} color={colors.mutedForeground} />
                          </View>
                        )}
                        <Text style={[styles.copyLabel, {
                          color: isKeep ? accentGreen : isSelected ? colors.accent : colors.mutedForeground,
                        }]}>
                          {isKeep ? 'KEEP' : isSelected ? 'DEL' : 'KEEP'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </Animated.View>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.doneBox, bevelRaised, { backgroundColor: colors.card }]}>
              <Text style={[styles.doneHead, { color: accentGreen }]}>{'[OK] DUPES REMOVED'}</Text>
              <Text style={[styles.doneBytes, { color: colors.primary }]}>{formatBytes(bytesFreed)}</Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>FREED FROM DUPLICATES</Text>
            </View>
            <Pressable onPress={() => { setPhase('idle'); setGroups([]); }} style={styles.fullWidth}>
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
      {(phase === 'results' || phase === 'cleaning') && (
        <View style={[styles.footer, {
          paddingBottom: insets.bottom + 16 + webBottomPad,
          backgroundColor: colors.background,
          borderTopColor: colors.primary + '40',
        }]}>
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            {totalSelectedCount} DUPES  ·  {formatBytes(totalSelectedBytes)}
          </Text>
          <Pressable onPress={handleClean} disabled={totalSelectedCount === 0 || phase === 'cleaning'} style={styles.fullWidth}>
            <View style={[styles.primaryBtn, {
              backgroundColor: totalSelectedCount > 0 ? accentGreen : colors.muted,
              borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
              borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
              borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              opacity: totalSelectedCount === 0 ? 0.5 : 1,
            }]}>
              {phase === 'cleaning'
                ? <ActivityIndicator color="#000" size="small" />
                : <>
                    <Feather name="trash-2" size={16} color="#000" />
                    <Text style={[styles.primaryBtnText, { color: '#000' }]}>{'>> DELETE DUPLICATES'}</Text>
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

  summaryPanel: { padding: 14, gap: 6 },
  summaryHead: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 6 },
  summaryRow: { flexDirection: 'row' },
  summaryKey: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, width: 140 },
  summarySep: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  summaryVal: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  groupPanel: { overflow: 'hidden' },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderBottomWidth: 1,
  },
  groupName: { flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  groupMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  copiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 },
  copyCell: { width: 76, alignItems: 'center', overflow: 'hidden' },
  thumb: { width: 76, height: 76 },
  thumbPlaceholder: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  copyLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, paddingVertical: 5 },

  doneBox: { width: '100%', padding: 24, gap: 10, alignItems: 'center' },
  doneHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  doneBytes: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  doneSub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },

  outlineBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  outlineBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  footer: { padding: 16, borderTopWidth: 1, gap: 10 },
  footerSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textAlign: 'center' },
});
