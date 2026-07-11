/**
 * Duplicate Finder — real MediaLibrary scanning
 *
 * Grouping strategy:
 *   1. FILENAME: strip extension + copy-suffix, group by normalised base name.
 *      e.g. "IMG_1234.jpg" and "IMG_1234 (1).jpg" → "img_1234"
 *   2. SAME-DAY + SAME-DIMENSION: two photos with identical pixel dimensions
 *      taken on the same calendar day are likely burst duplicates.
 *
 * Real file sizes are fetched via FileSystem.getInfoAsync for group
 * representatives (up to 20 groups × 1 URI call each).
 * All other sizes are estimated from dimensions.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useCleaner, estimateImageSize, getRealFileSize } from '@/context/CleanerContext';
import VerifyingPanel from '@/components/VerifyingPanel';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes, getAgeText, formatDateShort } from '@/utils/format';
import SegBar from '@/components/SegBar';
import TerminalLog from '@/components/TerminalLog';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Strip extension and common copy suffixes so duplicates share the same key.
 * Conservative: only removes the most certain copy indicators.
 */
function normalizeFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')          // remove extension
    .replace(/\s*\(\d+\)$/, '')       // " (1)", " (2)" …
    .replace(/\s*[-_]copy\d*$/i, '')  // "-copy", "_copy2"
    .toLowerCase()
    .trim();
}

function getDuplicateRecommendation(
  count: number,
  matchType: 'filename' | 'dimension_date',
  oldestDays: number,
  newestDays: number,
  wasted: number,
): string {
  const parts: string[] = [];
  if (matchType === 'filename') parts.push('Same filename detected');
  else parts.push('Same resolution & date');
  if (oldestDays > 365) parts.push(`oldest copy over ${Math.floor(oldestDays / 365)}y old`);
  else if (oldestDays > 30) parts.push(`oldest copy ${Math.floor(oldestDays / 30)}mo old`);
  parts.push(`~${formatBytes(wasted)} recoverable`);
  return parts.join(' · ');
}

// ── Types ────────────────────────────────────────────────────────────────────

interface DuplicateGroup {
  id: string;
  displayFilename: string;
  normalizedName: string;
  matchType: 'filename' | 'dimension_date';
  size: number;           // bytes per copy
  sizeIsReal: boolean;
  count: number;
  uris: string[];
  assetIds: string[];
  creationTimes: number[];   // seconds, same order as uris
  keepIndex: number;         // index of newest copy
  selectedIndexes: Set<number>;
  recommendation: string;
  wasted: number;
}


// ── Screen ───────────────────────────────────────────────────────────────────

export default function DuplicateFinderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem, addJournalEntry, storageStats } = useCleaner();

  const [phase, setPhase] = useState<'idle' | 'scanning' | 'verifying' | 'results' | 'cleaning' | 'done' | 'error'>('idle');
  const scanStartRef = useRef<number>(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [bytesFreed, setBytesFreed] = useState(0);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;
  const accentGreen = colors.success;
  const bevel = useBevel();

  const addLog = useCallback((msg: string) => setScanLog(prev => [...prev, `> ${msg}`]), []);

  const startScan = useCallback(async () => {
    scanStartRef.current = Date.now();
    setScanError(null);
    setPhase('scanning');
    setScanProgress(0);
    setScanLog([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {

    if (Platform.OS === 'web') {
      addLog('[web] media library unavailable in browser');
      setScanProgress(100);
      setGroups([]);
      setPhase('results');
      return;
    }

    addLog('requesting media access...');
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      addLog('[!] permission denied');
      setScanProgress(100);
      setGroups([]);
      setPhase('results');
      return;
    }

    // ── Phase 1: Load all photos (paginated) ────────────────────────────────
    addLog('loading photo library...');
    let allPhotos: MediaLibrary.Asset[] = [];
    let cursor: string | undefined;
    do {
      const page = await MediaLibrary.getAssetsAsync({
        first: 500,
        after: cursor,
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      allPhotos = [...allPhotos, ...page.assets];
      cursor = page.hasNextPage ? page.endCursor : undefined;
      setScanProgress(Math.min(40, 5 + Math.floor(allPhotos.length / 50)));
      if (allPhotos.length % 500 === 0 && allPhotos.length > 0) {
        addLog(`loaded ${allPhotos.length} photos...`);
      }
    } while (cursor && allPhotos.length < 5000);

    if (cursor) addLog(`[!] large library — checked first ${allPhotos.length} photos`);
    addLog(`total: ${allPhotos.length} photos loaded`);
    setScanProgress(45);

    // ── Phase 2: Build filename groups ──────────────────────────────────────
    addLog('grouping by filename...');
    const filenameMap = new Map<string, MediaLibrary.Asset[]>();
    for (const asset of allPhotos) {
      const key = normalizeFilename(asset.filename);
      if (key.length < 3) continue; // skip trivially short names
      const existing = filenameMap.get(key) ?? [];
      existing.push(asset);
      filenameMap.set(key, existing);
    }
    setScanProgress(60);

    // ── Phase 3: Build dimension+date groups ────────────────────────────────
    addLog('grouping by dimension + date...');
    const dimDateMap = new Map<string, MediaLibrary.Asset[]>();
    for (const asset of allPhotos) {
      if (asset.width === 0 || asset.height === 0) continue;
      const date = new Date(asset.creationTime * 1000);
      const key = `${asset.width}x${asset.height}_${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const existing = dimDateMap.get(key) ?? [];
      existing.push(asset);
      dimDateMap.set(key, existing);
    }
    setScanProgress(70);

    // ── Phase 4: Collect all candidate groups ───────────────────────────────
    addLog('identifying duplicates...');
    const usedAssetIds = new Set<string>();
    const candidateGroups: DuplicateGroup[] = [];

    // Process filename groups first (higher confidence)
    for (const [normName, assets] of filenameMap) {
      if (assets.length < 2) continue;
      // Deduplicate (asset might appear in multiple normalised groups)
      const fresh = assets.filter(a => !usedAssetIds.has(a.id));
      if (fresh.length < 2) continue;
      fresh.forEach(a => usedAssetIds.add(a.id));

      // Sort by creationTime — newest last
      fresh.sort((a, b) => a.creationTime - b.creationTime);
      const keepIdx = fresh.length - 1;
      const estSize = estimateImageSize(fresh[0].width, fresh[0].height);
      const wasted = estSize * (fresh.length - 1);
      const oldestDays = Math.floor((Date.now() - fresh[0].creationTime * 1000) / 86_400_000);
      const newestDays = Math.floor((Date.now() - fresh[keepIdx].creationTime * 1000) / 86_400_000);

      candidateGroups.push({
        id: fresh[0].id,
        displayFilename: fresh[keepIdx].filename,
        normalizedName: normName,
        matchType: 'filename',
        size: estSize,
        sizeIsReal: false,
        count: fresh.length,
        uris: fresh.map(a => a.uri),
        assetIds: fresh.map(a => a.id),
        creationTimes: fresh.map(a => a.creationTime),
        keepIndex: keepIdx,
        selectedIndexes: new Set(fresh.map((_, i) => i).filter(i => i !== keepIdx)),
        recommendation: getDuplicateRecommendation(fresh.length, 'filename', oldestDays, newestDays, wasted),
        wasted,
      });
    }

    // Process dimension+date groups (medium confidence, only if not already caught)
    for (const [, assets] of dimDateMap) {
      if (assets.length < 3) continue; // higher threshold — same-day same-resolution is common
      const fresh = assets.filter(a => !usedAssetIds.has(a.id));
      if (fresh.length < 2) continue;
      fresh.forEach(a => usedAssetIds.add(a.id));

      fresh.sort((a, b) => a.creationTime - b.creationTime);
      const keepIdx = fresh.length - 1;
      const estSize = estimateImageSize(fresh[0].width, fresh[0].height);
      const wasted = estSize * (fresh.length - 1);
      const oldestDays = Math.floor((Date.now() - fresh[0].creationTime * 1000) / 86_400_000);
      const newestDays = Math.floor((Date.now() - fresh[keepIdx].creationTime * 1000) / 86_400_000);

      candidateGroups.push({
        id: `dd_${fresh[0].id}`,
        displayFilename: `${fresh[0].width}×${fresh[0].height} (${fresh.length} copies)`,
        normalizedName: '',
        matchType: 'dimension_date',
        size: estSize,
        sizeIsReal: false,
        count: fresh.length,
        uris: fresh.map(a => a.uri),
        assetIds: fresh.map(a => a.id),
        creationTimes: fresh.map(a => a.creationTime),
        keepIndex: keepIdx,
        selectedIndexes: new Set(fresh.map((_, i) => i).filter(i => i !== keepIdx)),
        recommendation: getDuplicateRecommendation(fresh.length, 'dimension_date', oldestDays, newestDays, wasted),
        wasted,
      });
    }

    // Sort by wasted space descending, take top 20
    candidateGroups.sort((a, b) => b.wasted - a.wasted);
    const topGroups = candidateGroups.slice(0, 20);
    setScanProgress(80);

    // ── Phase 5: Get real file sizes for group representatives ─────────────
    addLog(`getting real sizes for ${topGroups.length} groups...`);
    await Promise.all(topGroups.map(async (grp) => {
      const repUri = grp.uris[grp.keepIndex] || grp.uris[0];
      if (!repUri) return;
      const real = await getRealFileSize(repUri);
      if (real !== null && real > 0) {
        grp.size = real;
        grp.sizeIsReal = true;
        grp.wasted = real * (grp.count - 1);
      }
    }));

    // Re-sort after real sizes
    topGroups.sort((a, b) => b.wasted - a.wasted);

    setScanProgress(100);
    addLog(`found ${topGroups.length} duplicate group${topGroups.length !== 1 ? 's' : ''}`);
    await new Promise(r => setTimeout(r, 200));
    setGroups(topGroups);
    setPhase('verifying');
    await new Promise(r => setTimeout(r, 1200));
    setPhase('results');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'UNEXPECTED ERROR DURING SCAN');
      setPhase('error');
    }
  }, [addLog]);

  const toggleInGroup = (groupId: string, idx: number) =>
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const newSet = new Set(g.selectedIndexes);
      if (newSet.has(idx)) newSet.delete(idx);
      else newSet.add(idx);
      // Always keep at least one
      if (newSet.size >= g.count) newSet.delete(g.keepIndex);
      return { ...g, selectedIndexes: newSet };
    }));

  const totalWasted = groups.reduce((acc, g) => acc + g.wasted, 0);
  const totalSelectedBytes = groups.reduce((acc, g) => acc + (g.selectedIndexes.size * g.size), 0);
  const totalSelectedCount = groups.reduce((acc, g) => acc + g.selectedIndexes.size, 0);

  const handleClean = async () => {
    if (totalSelectedCount === 0) return;
    setPhase('cleaning');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    let bytesActuallyFreed = 0;
    let itemsRemoved = 0;
    const toDelete: string[] = [];
    for (const g of groups) {
      for (const idx of g.selectedIndexes) {
        if (g.assetIds[idx]) toDelete.push(g.assetIds[idx]);
      }
    }
    if (toDelete.length > 0 && Platform.OS !== 'web') {
      try {
        await MediaLibrary.deleteAssetsAsync(toDelete);
        bytesActuallyFreed = totalSelectedBytes;
        itemsRemoved = toDelete.length;
      } catch {}
    }

    await new Promise(r => setTimeout(r, 800));
    setBytesFreed(bytesActuallyFreed);
    if (bytesActuallyFreed > 0 || itemsRemoved > 0) {
      await addHistoryItem({
        date: new Date().toISOString(),
        bytesFreed: bytesActuallyFreed,
        type: 'duplicates',
        label: `Duplicate Finder — ${itemsRemoved} file${itemsRemoved !== 1 ? 's' : ''} removed`,
      });
    }
    await addJournalEntry({
      timestamp: Date.now(),
      tool: 'duplicates',
      durationMs: Date.now() - scanStartRef.current,
      itemsFound: groups.length,
      itemsCleaned: itemsRemoved,
      bytesFound: totalWasted,
      bytesRecovered: bytesActuallyFreed,
      totalStorageBytes: storageStats?.totalSpace ?? 0,
    });
    setPhase('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

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
            <View style={[styles.idleIconBox, bevel, { backgroundColor: colors.card }]}>
              <Feather name="copy" size={44} color={accentGreen} />
            </View>
            <Text style={[styles.idleTitle, { color: colors.foreground }]}>DUPLICATE FINDER</Text>
            <View style={[styles.infoBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.infoTitle, { color: accentGreen }]}>{'[DETECTION METHOD]'}</Text>
              <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>
                {'[1] '} Filename match — strips copy suffixes like "(1)"
              </Text>
              <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>
                {'[2] '} Same resolution + same day (burst/transfer duplicates)
              </Text>
              <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>
                {'[i] '} Newest copy is pre-selected as KEEP
              </Text>
              <Text style={[styles.infoLine, { color: colors.mutedForeground }]}>
                {'[i] '} Real file sizes fetched for top groups
              </Text>
            </View>
            <Pressable onPress={startScan} style={styles.fullWidth} accessibilityLabel="Start duplicate scan" accessibilityRole="button">
              <View style={[styles.primaryBtn, {
                backgroundColor: accentGreen,
                borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              }]}>
                <Feather name="search" size={16} color="#000" />
                <Text style={[styles.primaryBtnText, { color: '#000' }]}>{'>> SCAN FOR DUPLICATES'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* ── SCANNING ── */}
        {phase === 'scanning' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.scanBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.scanTitle, { color: accentGreen }]}>{'[SCANNING...]'}</Text>
              <Text style={[styles.scanPct, { color: accentGreen }]}>
                {String(scanProgress).padStart(3, '0')}%
              </Text>
              <SegBar value={scanProgress / 100} color={accentGreen} />
            </View>
            <TerminalLog lines={scanLog} />
          </Animated.View>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.errorBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.errorTitle, { color: accentGreen }]}>{'[SCAN FAILED]'}</Text>
              <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>
                {'> '}{scanError ?? 'UNEXPECTED ERROR — CHECK PERMISSIONS'}
              </Text>
              <Pressable onPress={() => { setScanError(null); setPhase('idle'); }} style={styles.fullWidth}>
                <View style={[styles.retryBtn, {
                  backgroundColor: accentGreen,
                  borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
                  borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
                  borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                }]}>
                  <Feather name="refresh-cw" size={14} color="#000" />
                  <Text style={[styles.retryBtnText, { color: '#000' }]}>{'>> TRY AGAIN'}</Text>
                </View>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* ── VERIFYING ── */}
        {phase === 'verifying' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <VerifyingPanel color={accentGreen} />
          </Animated.View>
        )}

        {/* ── RESULTS ── */}
        {(phase === 'results' || phase === 'cleaning') && (
          <Animated.View entering={FadeIn} style={{ gap: 10 }}>
            {/* Summary */}
            <View style={[styles.summaryPanel, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.summaryHead, { color: accentGreen }]}>{'[SCAN COMPLETE]'}</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>GROUPS_FOUND</Text>
                <Text style={styles.summarySep}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>{groups.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>TOTAL_WASTED</Text>
                <Text style={styles.summarySep}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: colors.accent }]}>~{formatBytes(totalWasted)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>SEL_RECLAIMABLE</Text>
                <Text style={styles.summarySep}>{' = '}</Text>
                <Text style={[styles.summaryVal, { color: accentGreen }]}>{formatBytes(totalSelectedBytes)}</Text>
              </View>
            </View>

            {groups.length === 0 ? (
              <View style={[styles.emptyPanel, bevel, { backgroundColor: colors.card }]}>
                <Text style={[styles.emptyText, { color: accentGreen }]}>{'[OK] NO DUPLICATES FOUND'}</Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                  No duplicate filenames or same-day/same-resolution groups detected
                </Text>
              </View>
            ) : (
              groups.map(group => {
                const keepColor = accentGreen;
                return (
                  <View key={group.id} style={[styles.groupPanel, bevel, { backgroundColor: colors.card }]}>
                    {/* Group header */}
                    <View style={[styles.groupHeader, { borderBottomColor: colors.border }]}>
                      <View style={[styles.matchBadge, {
                        backgroundColor: group.matchType === 'filename' ? colors.primary + '20' : colors.warning + '20',
                        borderColor: group.matchType === 'filename' ? colors.primary : colors.warning,
                      }]}>
                        <Text style={[styles.matchBadgeText, {
                          color: group.matchType === 'filename' ? colors.primary : colors.warning,
                        }]}>
                          {group.matchType === 'filename' ? 'FILENAME' : 'DIM+DATE'}
                        </Text>
                      </View>
                      <Text style={[styles.groupName, { color: colors.foreground }]} numberOfLines={1}>
                        {group.displayFilename.toUpperCase()}
                      </Text>
                      <Text style={[styles.groupMeta, { color: colors.mutedForeground }]}>
                        {group.sizeIsReal ? '' : '~'}{formatBytes(group.size)} ×{group.count}
                      </Text>
                    </View>

                    {/* Recommendation */}
                    <View style={[styles.recoRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.recoText, { color: colors.mutedForeground }]}>
                        {'> '}{group.recommendation}
                      </Text>
                    </View>

                    {/* Copy cells */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.copiesRow}>
                      {group.uris.map((uri, idx) => {
                        const isKeep = idx === group.keepIndex;
                        const isSelected = group.selectedIndexes.has(idx);
                        return (
                          <Pressable
                            key={idx}
                            style={[
                              styles.copyCell,
                              {
                                borderTopColor: isSelected ? colors.destructive : isKeep ? keepColor : colors.bevelLight,
                                borderLeftColor: isSelected ? colors.destructive : isKeep ? keepColor : colors.bevelLight,
                                borderBottomColor: isSelected ? colors.destructive : isKeep ? keepColor : colors.bevelDark,
                                borderRightColor: isSelected ? colors.destructive : isKeep ? keepColor : colors.bevelDark,
                                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                                backgroundColor: isSelected ? colors.destructive + '12' : isKeep ? keepColor + '08' : colors.muted,
                              },
                            ]}
                            onPress={() => !isKeep && toggleInGroup(group.id, idx)}
                            disabled={isKeep}
                          >
                            {uri ? (
                              <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                            ) : (
                              <View style={[styles.thumbPlaceholder, { backgroundColor: colors.border }]}>
                                <Feather name="image" size={18} color={colors.mutedForeground} />
                              </View>
                            )}
                            <Text style={[styles.copyDate, { color: colors.mutedForeground }]}>
                              {formatDateShort(group.creationTimes[idx])}
                            </Text>
                            <Text style={[styles.copyLabel, {
                              color: isKeep ? keepColor : isSelected ? colors.destructive : colors.mutedForeground,
                            }]}>
                              {isKeep ? 'KEEP' : isSelected ? 'DEL' : 'KEEP'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                );
              })
            )}

            {/* Compact scan log */}
            {scanLog.length > 0 && (
              <View>
                <Text style={[styles.logLabel, { color: colors.mutedForeground }]}>
                  {'── SCAN LOG ──────────────────────'}
                </Text>
                <TerminalLog lines={scanLog} />
              </View>
            )}
          </Animated.View>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <View style={[styles.doneBox, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.doneHead, { color: accentGreen }]}>{'[OK] DUPLICATES PURGED'}</Text>
              <Text style={[styles.doneBytes, { color: colors.primary }]}>{formatBytes(bytesFreed)}</Text>
              <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>RECLAIMED</Text>
            </View>
            <Pressable onPress={() => { setPhase('idle'); setGroups([]); setScanLog([]); }} style={styles.fullWidth}>
              <View style={[styles.outlineBtn, {
                borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
                borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
                backgroundColor: colors.card,
              }]}>
                <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>{'>> RE-SCAN'}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      {/* ── Footer ── */}
      {(phase === 'results' || phase === 'cleaning') && groups.length > 0 && (
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
                    <Text style={[styles.primaryBtnText, { color: '#000' }]}>{'>> PURGE DUPLICATES'}</Text>
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
  content: { padding: 16, gap: 12 },
  center: { alignItems: 'center', paddingTop: 32, gap: 16 },
  fullWidth: { width: '100%' },
  errorBox: { padding: 20, gap: 12, width: '100%' },
  errorTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 2 },
  errorMsg: { fontFamily: 'Inter_400Regular', fontSize: 11, letterSpacing: 0.5, lineHeight: 16 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14 },
  retryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 2 },

  idleIconBox: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  idleTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  infoBox: { width: '100%', borderWidth: 1, padding: 12, gap: 5 },
  infoTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 4 },
  infoLine: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 10,
  },
  primaryBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  scanBox: { width: '100%', padding: 20, gap: 14 },
  scanTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  scanPct: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 2, textAlign: 'center' },

  logLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, marginBottom: 5 },

  summaryPanel: { padding: 14, gap: 6 },
  summaryHead: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 4 },
  summaryRow: { flexDirection: 'row' },
  summaryKey: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, width: 145 },
  summarySep: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#444' },
  summaryVal: { fontSize: 11, fontFamily: 'Inter_700Bold' },

  emptyPanel: { padding: 28, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  emptyDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },

  groupPanel: { overflow: 'hidden' },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderBottomWidth: 1,
  },
  matchBadge: { borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  matchBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  groupName: { flex: 1, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  groupMeta: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  recoRow: { borderBottomWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  recoText: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3, lineHeight: 16 },
  copiesRow: { paddingHorizontal: 10, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  copyCell: { width: 80, alignItems: 'center', overflow: 'hidden' },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  copyDate: { fontSize: 7, fontFamily: 'Inter_400Regular', letterSpacing: 0.3, paddingTop: 3, textAlign: 'center' },
  copyLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, paddingBottom: 4 },

  doneBox: { width: '100%', padding: 24, gap: 10, alignItems: 'center' },
  doneHead: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  doneBytes: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  doneSub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },

  outlineBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  outlineBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  footer: { padding: 16, borderTopWidth: 1, gap: 10 },
  footerSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textAlign: 'center' },
});
