/**
 * Storage Map — WinDirStat-style terminal visualization.
 * Powered by the Storage Intelligence Engine (richScanData from context).
 * Shows storage by source app (Camera, WhatsApp, Telegram, etc.) with
 * proportional SegBars and tap-to-navigate to the relevant cleaning tool.
 */
import React from 'react';
import {
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
import SegBar from '@/components/SegBar';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SourceApp } from '@/context/CleanerContext';

/** Maps source app → the most relevant cleaning tool screen */
const SOURCE_APP_ROUTES: Partial<Record<SourceApp, string>> = {
  screenshots:      '/screenshot-manager',
  downloads:        '/junk-cleaner',
  camera:           '/large-files',
  screen_recording: '/large-files',
  whatsapp:         '/duplicate-finder',
  telegram:         '/large-files',
  instagram:        '/large-files',
  tiktok:           '/large-files',
};

/** Colour palette for category rows — cycles if there are many categories */
const CAT_COLORS = [
  '#00E5CC', // teal (primary)
  '#FF5500', // orange (accent)
  '#39FF14', // green (success)
  '#FFB800', // amber (warning)
  '#7B7BFF', // indigo
  '#BB55FF', // violet
  '#FF55BB', // pink
  '#55BBFF', // sky
  '#FF8855', // peach
  '#55FFBB', // mint
];

export default function StorageTreeScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const bevel   = useBevel();
  const { richScanData, storageStats, mediaBreakdown } = useCleaner();

  const webTopPad    = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const hasRich  = richScanData  && richScanData.smartCategories.length > 0;
  const hasBasic = !hasRich && !!mediaBreakdown;

  // Total across smart categories for proportional bars
  const totalCatSize = richScanData
    ? richScanData.smartCategories.reduce((s, c) => s + c.estimatedSize, 0)
    : 0;

  // Basic breakdown from mediaBreakdown for the fallback panel
  const basicCats = mediaBreakdown ? [
    { label: 'VIDEOS',       size: mediaBreakdown.videos.size,      count: mediaBreakdown.videos.count,      icon: 'film',     color: colors.accent },
    { label: 'IMAGES',       size: mediaBreakdown.images.size,      count: mediaBreakdown.images.count,      icon: 'image',    color: colors.primary },
    { label: 'SCREENSHOTS',  size: mediaBreakdown.screenshots.size, count: mediaBreakdown.screenshots.count, icon: 'monitor',  color: colors.success },
    { label: 'AUDIO',        size: mediaBreakdown.audio.size,       count: mediaBreakdown.audio.count,       icon: 'music',    color: colors.warning },
  ].filter(c => c.count > 0) : [];
  const basicTotal = basicCats.reduce((s, c) => s + c.size, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, {
        paddingTop: insets.top + 12 + webTopPad,
        backgroundColor: colors.background,
        borderBottomColor: colors.primary + '40',
      }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, bevel, { backgroundColor: colors.card }]}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Feather name="arrow-left" size={16} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{'> ANALYSIS'}</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>STORAGE MAP</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 + webBottomPad },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Disk overview ── */}
        {storageStats && (
          <Animated.View entering={FadeIn} style={[styles.diskPanel, bevel, { backgroundColor: colors.card }]}>
            <Text style={[styles.panelHead, { color: colors.primary }]}>{'[DISK OVERVIEW]'}</Text>
            {[
              { key: 'TOTAL', val: formatBytes(storageStats.totalSpace),  color: colors.foreground },
              { key: 'USED',  val: formatBytes(storageStats.usedSpace),   color: colors.accent },
              { key: 'FREE',  val: formatBytes(storageStats.freeSpace),   color: colors.success },
            ].map(row => (
              <View key={row.key} style={styles.diskRow}>
                <Text style={[styles.diskKey, { color: colors.mutedForeground }]}>{row.key}</Text>
                <Text style={styles.diskSep}>{' = '}</Text>
                <Text style={[styles.diskVal, { color: row.color }]}>{row.val}</Text>
              </View>
            ))}
            <View style={{ marginTop: 10, gap: 4 }}>
              <SegBar
                value={storageStats.usedSpace / Math.max(1, storageStats.totalSpace)}
                color={
                  storageStats.usedSpace / storageStats.totalSpace > 0.9 ? colors.destructive
                  : storageStats.usedSpace / storageStats.totalSpace > 0.75 ? colors.warning
                  : colors.accent
                }
                total={30}
              />
              <View style={styles.barLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                    USED {Math.round((storageStats.usedSpace / storageStats.totalSpace) * 100)}%
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
                  <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                    FREE {Math.round((storageStats.freeSpace / storageStats.totalSpace) * 100)}%
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── No data at all — empty state ── */}
        {!hasRich && !hasBasic && (
          <Animated.View entering={FadeIn} style={[styles.emptyPanel, bevel, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>{'[ _ ]'}</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>NO MAP DATA</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              {'Run Storage Intelligence to build a source app\nbreakdown — Camera, WhatsApp, Telegram, and more.'}
            </Text>
            <Pressable onPress={() => router.push('/storage-intel' as never)} style={styles.fullWidth}>
              <View style={[styles.primaryBtn, {
                backgroundColor: colors.primary,
                borderTopColor:    colors.bevelDark,  borderLeftColor:   colors.bevelDark,
                borderBottomColor: colors.bevelLight, borderRightColor:  colors.bevelLight,
                borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
              }]}>
                <Feather name="bar-chart-2" size={14} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                  {'>> ANALYSE STORAGE'}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* ── Basic breakdown (mediaBreakdown available but no rich scan yet) ── */}
        {hasBasic && (
          <Animated.View entering={FadeIn} style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {'── BY MEDIA TYPE ────────────────────'}
            </Text>
            <View style={[styles.mapPanel, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.panelHead, { color: colors.primary }]}>
                {'[BASIC MAP]'}
                <Text style={[styles.estNote, { color: colors.mutedForeground }]}>
                  {' · run Storage Intelligence for source-app view'}
                </Text>
              </Text>
              {basicCats.map((cat, idx) => (
                <View
                  key={cat.label}
                  style={[
                    styles.mapRow,
                    idx < basicCats.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.mapIconBox, { borderColor: cat.color + '40' }]}>
                    <Feather name={cat.icon as never} size={13} color={cat.color} />
                  </View>
                  <View style={styles.mapInfo}>
                    <View style={styles.mapTopRow}>
                      <Text style={[styles.mapLabel, { color: colors.foreground }]}>{cat.label}</Text>
                      <Text style={[styles.mapSize, { color: cat.color }]}>~{formatBytes(cat.size)}</Text>
                    </View>
                    <View style={styles.mapBottomRow}>
                      <Text style={[styles.mapCount, { color: colors.mutedForeground }]}>
                        {cat.count.toLocaleString()} items
                      </Text>
                      <Text style={[styles.mapPct, { color: colors.mutedForeground }]}>
                        {basicTotal > 0 ? Math.round((cat.size / basicTotal) * 100) : 0}%
                      </Text>
                    </View>
                    <View style={{ marginTop: 5 }}>
                      <SegBar value={basicTotal > 0 ? cat.size / basicTotal : 0} color={cat.color} total={20} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
            {/* Prompt to run full scan */}
            <Pressable onPress={() => router.push('/storage-intel' as never)}>
              <View style={[styles.scanPrompt, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '10' }]}>
                <Feather name="bar-chart-2" size={12} color={colors.primary} />
                <Text style={[styles.scanPromptText, { color: colors.primary }]}>
                  {'>> RUN STORAGE INTELLIGENCE FOR SOURCE APP BREAKDOWN'}
                </Text>
                <Feather name="arrow-right" size={12} color={colors.primary} />
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* ── Smart categories (Storage Intelligence Engine result) ── */}
        {hasRich && (
          <Animated.View entering={FadeIn} style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {'── BY SOURCE APP ────────────────────'}
            </Text>
            <View style={[styles.mapPanel, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.panelHead, { color: colors.primary }]}>
                {'[STORAGE MAP]'}
                <Text style={[styles.estNote, { color: colors.mutedForeground }]}>
                  {' · tap to clean · sizes estimated'}
                </Text>
              </Text>
              {richScanData.smartCategories.map((cat, idx) => {
                const share     = totalCatSize > 0 ? cat.estimatedSize / totalCatSize : 0;
                const catColor  = CAT_COLORS[idx % CAT_COLORS.length];
                const route     = SOURCE_APP_ROUTES[cat.sourceApp];
                return (
                  <Pressable
                    key={cat.sourceApp}
                    onPress={() => route ? router.push(route as never) : undefined}
                    style={[
                      styles.mapRow,
                      idx < richScanData.smartCategories.length - 1 && {
                        borderBottomWidth: 1, borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View style={[styles.mapIconBox, { borderColor: catColor + '40' }]}>
                      <Feather name={cat.icon as never} size={13} color={catColor} />
                    </View>
                    <View style={styles.mapInfo}>
                      <View style={styles.mapTopRow}>
                        <Text style={[styles.mapLabel, { color: colors.foreground }]}>
                          {cat.label.toUpperCase()}
                        </Text>
                        <Text style={[styles.mapSize, { color: catColor }]}>
                          ~{formatBytes(cat.estimatedSize)}
                        </Text>
                      </View>
                      <View style={styles.mapBottomRow}>
                        <Text style={[styles.mapCount, { color: colors.mutedForeground }]}>
                          {cat.count.toLocaleString()} items
                        </Text>
                        <Text style={[styles.mapPct, { color: colors.mutedForeground }]}>
                          {Math.round(share * 100)}%
                        </Text>
                      </View>
                      <View style={{ marginTop: 5 }}>
                        <SegBar value={share} color={catColor} total={20} />
                      </View>
                    </View>
                    {route && (
                      <Feather
                        name="chevron-right"
                        size={14}
                        color={colors.mutedForeground}
                        style={styles.chevron}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Scan metadata */}
            <Text style={[styles.scanTime, { color: colors.mutedForeground }]}>
              {'> SCAN: '}
              {new Date(richScanData.timestamp).toLocaleString().toUpperCase()}
              {'  ·  '}
              {richScanData.totalAssetCount.toLocaleString()} ITEMS MAPPED
            </Text>

            {/* Re-scan prompt */}
            <Pressable onPress={() => router.push('/storage-intel' as never)}>
              <View style={[styles.scanPrompt, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
                <Text style={[styles.scanPromptText, { color: colors.mutedForeground }]}>
                  {'>> RE-SCAN TO REFRESH MAP'}
                </Text>
                <Feather name="arrow-right" size={12} color={colors.mutedForeground} />
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* ── Transparency note ── */}
        {(hasRich || hasBasic) && (
          <View style={[styles.noteBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
            <Text style={[styles.noteTitle, { color: colors.primary }]}>{'[!] ABOUT THIS MAP'}</Text>
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
              {'> Sizes are estimated from media dimensions and duration — Android restricts exact file sizes.\n'}
              {'> Source apps are detected from album names.\n'}
              {'> Tap any row to navigate to the relevant cleaning tool.'}
            </Text>
          </View>
        )}

      </ScrollView>
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
  headerSub:   { fontSize: 9,  fontFamily: 'Inter_400Regular', letterSpacing: 2 },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold',    letterSpacing: 2 },
  content: { padding: 16, gap: 12 },
  fullWidth: { width: '100%' },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  diskPanel: { padding: 14, gap: 6 },
  diskRow:   { flexDirection: 'row', alignItems: 'center' },
  diskKey:   { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, width: 60 },
  diskSep:   { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#444' },
  diskVal:   { fontSize: 11, fontFamily: 'Inter_700Bold' },
  barLegend: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8 },
  legendText:{ fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  panelHead: { fontSize: 10, fontFamily: 'Inter_700Bold',    letterSpacing: 2, marginBottom: 8 },
  estNote:   { fontSize: 9,  fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  emptyPanel: { padding: 32, alignItems: 'center', gap: 8 },
  emptyIcon:  { fontSize: 22, fontFamily: 'Inter_700Bold',    letterSpacing: 4 },
  emptyTitle: { fontSize: 13, fontFamily: 'Inter_700Bold',    letterSpacing: 2, marginTop: 4 },
  emptyDesc:  { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, textAlign: 'center', lineHeight: 18 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 10, marginTop: 12,
  },
  primaryBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  mapPanel: { overflow: 'hidden' },
  mapRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  mapIconBox: { width: 30, height: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  mapInfo:    { flex: 1, gap: 2 },
  mapTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapLabel:   { fontSize: 11, fontFamily: 'Inter_700Bold',    letterSpacing: 1, flex: 1, marginRight: 8 },
  mapSize:    { fontSize: 11, fontFamily: 'Inter_700Bold',    letterSpacing: 0.5 },
  mapBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapCount:   { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },
  mapPct:     { fontSize: 9,  fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  chevron:    { alignSelf: 'center' },

  scanPrompt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, padding: 10, gap: 8,
  },
  scanPromptText: { flex: 1, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  scanTime:   { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, textAlign: 'center' },

  noteBox:   { borderWidth: 1, padding: 12, gap: 6 },
  noteTitle: { fontSize: 10, fontFamily: 'Inter_700Bold',    letterSpacing: 2, marginBottom: 4 },
  noteText:  { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 16 },
});
