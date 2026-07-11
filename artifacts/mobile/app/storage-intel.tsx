/**
 * Storage Intelligence — deterministic Storage Advisor + Folder Intelligence.
 *
 * Competitive features vs SD Maid SE / Files by Google / CCleaner:
 *   • AdvisorCard system: every recommendation explains WHY, HOW MUCH,
 *     HOW SAFE, and any Android API limitation — fully deterministic.
 *   • Folder Intelligence: album-level size breakdown via MediaLibrary albums.
 *   • Trend analysis: growth rate and projection.
 *   • All numbers labelled as estimates where applicable.
 */
import React, { useCallback, useState } from 'react';
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
import {
  useCleaner,
  MediaBreakdown,
  RichScanData,
  ScanSnapshot,
  estimateImageSize,
  estimateVideoSize,
} from '@/context/CleanerContext';
import type { ScanJournalEntry } from '@/context/CleanerContext';
import { POOL_CONCURRENCY } from '@/constants/limits';
import { logError } from '@/utils/logger';
import { runWithPool } from '@/utils/pool';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes, formatDelta, formatAbsoluteDate, daysAgoLabel, getAgeText } from '@/utils/format';
import SegBar from '@/components/SegBar';
import TerminalLog from '@/components/TerminalLog';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Advisor card types ────────────────────────────────────────────────────────

type SafetyLevel = 'SAFE' | 'REVIEW' | 'MANUAL';
type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'ESTIMATED';

interface AdvisorCard {
  id: string;
  priority: number;
  icon: keyof typeof Feather.glyphMap;
  category: string;
  title: string;
  triggerSummary: string;
  recoveryBytes: number;
  safetyLevel: SafetyLevel;
  explanation: string;
  androidNote?: string;
  actionLabel: string;
  actionRoute: string;
  confidence: ConfidenceLevel;
}

// ── Folder intelligence types ─────────────────────────────────────────────────

interface AlbumIntelRow {
  id: string;
  title: string;
  assetCount: number;
  estimatedSize: number;
  oldestAssetDate?: number; // seconds (expo-media-library creationTime)
  /** Seconds — most recent asset in the sampled set; used for recency detection */
  newestAssetDate?: number;
  /** True if all sampled assets are older than 180 days — album likely inactive */
  isStale?: boolean;
}

// ── Advisor card builder ──────────────────────────────────────────────────────

function buildAdvisorCards(
  storageStats: { totalSpace: number; usedSpace: number; freeSpace: number; appCacheSize: number } | null,
  mediaBreakdown: MediaBreakdown | null,
  journal: ScanJournalEntry[],
  snapshots: ScanSnapshot[],
  richScanData: RichScanData | null,
): AdvisorCard[] {
  const cards: AdvisorCard[] = [];
  const prevSnap: ScanSnapshot | null = snapshots.length >= 2 ? snapshots[1] : null;
  const lastFor = (tool: ScanJournalEntry['tool']) => journal.find(j => j.tool === tool);

  // ── P1: STORAGE CRITICAL / LOW ───────────────────────────────────────────
  if (storageStats) {
    const freeRatio = storageStats.freeSpace / Math.max(1, storageStats.totalSpace);
    if (freeRatio < 0.15) {
      const label = freeRatio < 0.05 ? 'CRITICAL' : 'LOW';
      cards.push({
        id: 'low_storage',
        priority: 1,
        icon: 'alert-circle',
        category: label,
        title: `STORAGE ${label}`,
        triggerSummary: `${formatBytes(storageStats.freeSpace)} free — ${Math.round(freeRatio * 100)}% remaining`,
        recoveryBytes: mediaBreakdown
          ? Math.round(mediaBreakdown.screenshots.size * 0.7 + mediaBreakdown.appCache.size + (mediaBreakdown.videos.size * 0.3))
          : 0,
        safetyLevel: 'REVIEW',
        explanation:
          'Android begins throttling performance below 15% free space. Camera apps may fail to save new photos below 5%. Run all cleaners now, starting with the safest options (cache and screenshots) and working toward larger decisions (videos, downloads).',
        actionLabel: 'START WITH JUNK CLEANER',
        actionRoute: '/junk-cleaner',
        confidence: 'HIGH',
      });
    }
  }

  // ── P2: LARGE VIDEOS ─────────────────────────────────────────────────────
  if (mediaBreakdown && mediaBreakdown.videos.size > 200 * 1024 * 1024) {
    const lastScan = lastFor('large_files');
    cards.push({
      id: 'large_videos',
      priority: 2,
      icon: 'film',
      category: 'MEDIA',
      title: 'LARGE VIDEO FILES',
      triggerSummary:
        `~${formatBytes(mediaBreakdown.videos.size)} across ${mediaBreakdown.videos.count} videos` +
        (lastScan ? ` · last scan found ${lastScan.itemsFound} large files` : ''),
      recoveryBytes: Math.round(mediaBreakdown.videos.size * 0.35),
      safetyLevel: 'REVIEW',
      explanation:
        'A single minute of 4K video can exceed 400 MB. Recordings from events, holidays, and screen captures accumulate silently. Large File Scanner sorts every video and image by size so you can review and delete the biggest items first — no guesswork.',
      androidNote: 'Full read and delete access is available via Media Library. No root required. Files are shown before deletion.',
      actionLabel: 'OPEN LARGE FILE SCANNER',
      actionRoute: '/large-files',
      confidence: 'MEDIUM',
    });
  }

  // ── P2.5: SOURCE APP CONCENTRATION ───────────────────────────────────────
  // Only available when Storage Intelligence Engine has run. Fires when one
  // source app accounts for >35% of total scanned media AND >200 MB — this
  // is the single most actionable insight unique to CleanDroid.
  if (richScanData && richScanData.smartCategories.length > 0) {
    const totalCatSize = richScanData.smartCategories.reduce((s, c) => s + c.estimatedSize, 0);
    const top = richScanData.smartCategories[0];
    const topShare = totalCatSize > 0 ? top.estimatedSize / totalCatSize : 0;
    if (topShare > 0.35 && top.estimatedSize > 200 * 1024 * 1024) {
      const sourceRoutes: Record<string, string> = {
        screenshots:      '/screenshot-manager',
        downloads:        '/junk-cleaner',
        camera:           '/large-files',
        screen_recording: '/large-files',
        whatsapp:         '/duplicate-finder',
        telegram:         '/large-files',
        instagram:        '/large-files',
        tiktok:           '/large-files',
        twitter:          '/large-files',
        facebook:         '/large-files',
      };
      const route = sourceRoutes[top.sourceApp] ?? '/large-files';
      cards.push({
        id: 'source_concentration',
        priority: 2.5,
        icon: top.icon as keyof typeof Feather.glyphMap,
        category: 'SOURCE APP',
        title: `${top.label.toUpperCase()} DOMINATES STORAGE`,
        triggerSummary: `${Math.round(topShare * 100)}% of scanned media · ~${formatBytes(top.estimatedSize)} · ${top.count.toLocaleString()} items`,
        recoveryBytes: Math.round(top.estimatedSize * 0.4),
        safetyLevel: 'REVIEW',
        explanation: `${top.label} is your single largest media source — ${Math.round(topShare * 100)}% of all scanned content (~${formatBytes(top.estimatedSize)} across ${top.count.toLocaleString()} items). This level of source concentration is common with active messaging apps, auto-save features, or frequent screen recording. Reviewing this source first gives the highest space return per item reviewed.`,
        androidNote: undefined,
        actionLabel: `REVIEW ${top.label.toUpperCase()} FILES`,
        actionRoute: route,
        confidence: 'MEDIUM',
      });
    }
  }

  // ── P3: DUPLICATES ────────────────────────────────────────────────────────
  const dupScan = lastFor('duplicates');
  if (dupScan && dupScan.bytesFound > 0) {
    cards.push({
      id: 'duplicates',
      priority: 3,
      icon: 'copy',
      category: 'DUPLICATE',
      title: 'DUPLICATE PHOTOS CONFIRMED',
      triggerSummary: `Last scan: ${dupScan.itemsFound} groups · ${formatBytes(dupScan.bytesFound)} recoverable`,
      recoveryBytes: dupScan.bytesFound,
      safetyLevel: 'REVIEW',
      explanation:
        'Duplicate groups were found in your last scan — same filename across backups and cloud transfers, same resolution from the same calendar day, camera burst sequences (multiple shots within seconds), and partial hash-verified exact copies. The newest copy is always preserved by default.',
      androidNote: 'Both copies are shown before deletion. You choose what to keep. The original is never automatically removed.',
      actionLabel: 'OPEN DUPLICATE FINDER',
      actionRoute: '/duplicate-finder',
      confidence: 'HIGH',
    });
  } else {
    const estDupBytes = mediaBreakdown ? Math.round(mediaBreakdown.images.size * 0.08) : 0;
    cards.push({
      id: 'duplicates_unscan',
      priority: dupScan ? 9 : 3,
      icon: 'copy',
      category: 'DUPLICATE',
      title: dupScan ? 'NO DUPLICATES FOUND' : 'DUPLICATES NOT YET SCANNED',
      triggerSummary: dupScan
        ? 'Last scan returned zero duplicate groups'
        : 'Duplicate scan has never been run on this device',
      recoveryBytes: dupScan ? 0 : estDupBytes,
      safetyLevel: 'REVIEW',
      explanation: dupScan
        ? 'Your last duplicate scan returned no groups. Common sources of duplicates include WhatsApp media, cloud sync folders, and camera burst shots. If you have received many new files since the last scan, re-running is recommended.'
        : 'Most phones accumulate duplicates over time — WhatsApp forwards, edited copies, cloud sync downloads, and camera burst sequences. A typical 2-year-old device has 200–800 MB of duplicate media. This estimate assumes ~8% duplication across your image library.',
      actionLabel: 'RUN DUPLICATE SCAN',
      actionRoute: '/duplicate-finder',
      confidence: dupScan ? 'HIGH' : 'ESTIMATED',
    });
  }

  // ── P4: SCREENSHOT ACCUMULATION ──────────────────────────────────────────
  if (mediaBreakdown && mediaBreakdown.screenshots.count > 30) {
    cards.push({
      id: 'screenshots',
      priority: 4,
      icon: 'monitor',
      category: 'MEDIA',
      title: 'SCREENSHOT ACCUMULATION',
      triggerSummary: `${mediaBreakdown.screenshots.count} screenshots · ~${formatBytes(mediaBreakdown.screenshots.size)}`,
      recoveryBytes: Math.round(mediaBreakdown.screenshots.size * 0.75),
      safetyLevel: 'REVIEW',
      explanation:
        'Screenshots are taken for a momentary reference — a receipt, a map, a conversation — and rarely revisited after 30 days. On most devices, 75–90% of screenshots are candidates for deletion. Screenshot Manager shows them all at once for fast bulk review.',
      actionLabel: 'OPEN SCREENSHOT MANAGER',
      actionRoute: '/screenshot-manager',
      confidence: 'HIGH',
    });
  }

  // ── P5: DOWNLOADS BUILDUP ─────────────────────────────────────────────────
  if (mediaBreakdown && mediaBreakdown.downloads.count > 20) {
    const lastJunk = lastFor('junk');
    cards.push({
      id: 'downloads',
      priority: 5,
      icon: 'download',
      category: 'DOWNLOAD',
      title: 'DOWNLOADS FOLDER BUILDUP',
      triggerSummary:
        `${mediaBreakdown.downloads.count} items in Downloads` +
        (lastJunk ? ` · last junk scan: ${formatBytes(lastJunk.bytesFound)} found` : ''),
      recoveryBytes: Math.round(mediaBreakdown.downloads.size * 0.55),
      safetyLevel: 'REVIEW',
      explanation:
        'Files downloaded for a single purpose — PDFs, APKs, zip archives, browser images — accumulate without ever being opened again. Large downloads (APK installers, video files, archives) are the most common culprits. Junk Cleaner identifies files by size and age, not by guessing.',
      actionLabel: 'OPEN JUNK CLEANER',
      actionRoute: '/junk-cleaner',
      confidence: 'MEDIUM',
    });
  }

  // ── P6: STORAGE GROWTH TREND ──────────────────────────────────────────────
  if (prevSnap && storageStats) {
    const growthBytes = storageStats.usedSpace - prevSnap.usedSpace;
    const daysSince = Math.max(1, (Date.now() - new Date(prevSnap.timestamp).getTime()) / 86_400_000);
    const dailyGrowthMB = growthBytes / daysSince / (1024 * 1024);
    if (growthBytes > 300 * 1024 * 1024 && dailyGrowthMB > 3) {
      const daysToFull = Math.round(storageStats.freeSpace / (growthBytes / daysSince) / 86400);
      cards.push({
        id: 'trend',
        priority: 6,
        icon: 'trending-up',
        category: 'TREND',
        title: 'STORAGE GROWING RAPIDLY',
        triggerSummary: `+${formatBytes(growthBytes)} in ${Math.round(daysSince)} days · ~${Math.round(dailyGrowthMB)} MB/day`,
        recoveryBytes: 0,
        safetyLevel: 'REVIEW',
        explanation: `At the current growth rate, storage will be full in approximately ${daysToFull} days. Common causes are 4K video recording, active WhatsApp groups, and automatic cloud sync downloads. The most effective first step is running a full scan to identify the largest growing categories.`,
        actionLabel: 'RE-ANALYSE NOW',
        actionRoute: '/storage-intel',
        confidence: 'HIGH',
      });
    }
  }

  // ── P7: APP CACHE (always shown) ─────────────────────────────────────────
  const ownCacheBytes = mediaBreakdown?.appCache.size ?? 0;
  const estimatedOtherCachesMB = 350; // typical for a phone with social + streaming apps
  cards.push({
    id: 'app_cache',
    priority: 7,
    icon: 'cpu',
    category: 'CACHE',
    title: 'APP CACHES CLEARABLE',
    triggerSummary: `Own cache: ${formatBytes(ownCacheBytes)} · estimated common apps: ~${estimatedOtherCachesMB} MB`,
    recoveryBytes: ownCacheBytes + estimatedOtherCachesMB * 1024 * 1024,
    safetyLevel: 'SAFE',
    explanation:
      'App caches are temporary files that apps create to avoid re-downloading data. They are always safe to clear — apps rebuild their cache automatically on next use. Auto-Clear removes CleanDroid\'s own accessible caches immediately. Smart Sweep opens each additional app\'s Settings page so you clear the actual amount with one tap each.',
    androidNote:
      'Android prevents third-party apps from silently clearing other apps\' caches — only the system or the user via Settings can do this. Smart Sweep removes the manual back-and-forth by navigating automatically.',
    actionLabel: 'OPEN CACHE CLEANER',
    actionRoute: '/app-cache',
    confidence: 'HIGH',
  });

  return cards.sort((a, b) => a.priority - b.priority);
}

// ── AdvisorCard UI component ──────────────────────────────────────────────────

function AdvisorCardUI({ card, bevel }: { card: AdvisorCard; bevel: object }) {
  const colors = useColors();
  const safetyColor =
    card.safetyLevel === 'SAFE' ? colors.success :
    card.safetyLevel === 'REVIEW' ? colors.warning :
    colors.accent;
  const safetyLabel = { SAFE: 'SAFE TO RUN', REVIEW: 'REVIEW FIRST', MANUAL: 'MANUAL STEPS' }[card.safetyLevel];

  return (
    <View style={[
      styles.advisorCard,
      bevel as object,
      {
        backgroundColor: colors.card,
        borderTopColor: safetyColor + '70',
        borderLeftColor: safetyColor + '70',
      },
    ]}>
      {/* Card header */}
      <View style={[styles.advisorCardHeader, { borderBottomColor: colors.border }]}>
        <View style={styles.advisorCardHeaderLeft}>
          <Text style={[styles.advisorCategory, { color: safetyColor }]}>[{card.category}]</Text>
          <Text style={[styles.advisorPriority, { color: colors.mutedForeground }]}> · P{card.priority}</Text>
        </View>
        <Feather name={card.icon} size={14} color={safetyColor} />
      </View>

      {/* Card body */}
      <View style={styles.advisorCardBody}>
        <Text style={[styles.advisorTitle, { color: colors.foreground }]}>{card.title}</Text>
        <Text style={[styles.advisorTrigger, { color: colors.mutedForeground }]}>{'> '}{card.triggerSummary}</Text>

        {/* Stats row */}
        <View style={[styles.advisorStats, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
          {card.recoveryBytes > 0 && (
            <View style={styles.advisorStat}>
              <Text style={[styles.advisorStatLabel, { color: colors.mutedForeground }]}>RECOVERABLE</Text>
              <Text style={[styles.advisorStatValue, { color: colors.primary }]}>~{formatBytes(card.recoveryBytes)}</Text>
            </View>
          )}
          <View style={styles.advisorStat}>
            <Text style={[styles.advisorStatLabel, { color: colors.mutedForeground }]}>SAFETY</Text>
            <Text style={[styles.advisorStatValue, { color: safetyColor }]}>{safetyLabel}</Text>
          </View>
          <View style={styles.advisorStat}>
            <Text style={[styles.advisorStatLabel, { color: colors.mutedForeground }]}>EVIDENCE</Text>
            <Text style={[styles.advisorStatValue, { color: colors.mutedForeground }]}>{card.confidence}</Text>
          </View>
        </View>

        {/* Explanation */}
        <Text style={[styles.advisorExplanation, { color: colors.mutedForeground }]}>{card.explanation}</Text>

        {/* Android note */}
        {card.androidNote && (
          <View style={[styles.advisorAndroidNote, { borderColor: colors.border, backgroundColor: colors.muted }]}>
            <Text style={[styles.advisorAndroidNoteText, { color: colors.mutedForeground }]}>
              {'[ANDROID] '}{card.androidNote}
            </Text>
          </View>
        )}

        {/* CTA */}
        <Pressable
          onPress={() => router.push(card.actionRoute as never)}
          accessibilityRole="button"
          accessibilityLabel={card.actionLabel}
        >
          <View style={[styles.advisorCta, { borderColor: safetyColor, backgroundColor: safetyColor + '18' }]}>
            <Text style={[styles.advisorCtaText, { color: safetyColor }]}>{'>> '}{card.actionLabel}</Text>
            <Feather name="arrow-right" size={12} color={safetyColor} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

// ── Category row type (internal) ──────────────────────────────────────────────

interface CategoryRow {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  count: number;
  size: number;
  color: string;
  prevSize?: number;
  action?: () => void;
  actionLabel?: string;
  isSubset?: boolean;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StorageIntelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    storageStats, mediaBreakdown, richScanData, snapshots,
    scanMediaLibrary, addScanSnapshot, scanTruncated,
    journal,
  } = useCleaner();

  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [albumBreakdown, setAlbumBreakdown] = useState<AlbumIntelRow[]>([]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, `> ${msg}`]);
  }, []);

  const runScan = useCallback(async () => {
    setScanning(true);
    setProgress(0);
    setLogs([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ── Main media scan ──────────────────────────────────────────────────────
    const bd = await scanMediaLibrary(
      pct => setProgress(Math.round(pct * 0.8)), // reserve 20% for album scan
      msg => addLog(msg),
    );

    if (bd && storageStats) {
      await addScanSnapshot({
        timestamp: new Date().toISOString(),
        totalSpace: storageStats.totalSpace,
        usedSpace: storageStats.usedSpace,
        freeSpace: storageStats.freeSpace,
        appCacheSize: storageStats.appCacheSize,
        mediaItemCount: bd.totalScanned,
        imageSize: bd.images.size,
        videoSize: bd.videos.size,
        audioSize: bd.audio.size,
        screenshotSize: bd.screenshots.size,
      });
    }

    // ── Album / Folder Intelligence scan ─────────────────────────────────────
    if (Platform.OS !== 'web') {
      try {
        addLog('scanning folder structure...');
        setProgress(82);
        const allAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false });

        // Sort by asset count descending, take top 15 for size estimation
        const topAlbums = allAlbums
          .filter(a => a.assetCount > 0)
          .sort((a, b) => b.assetCount - a.assetCount)
          .slice(0, 15);

        setProgress(85);

        const albumData: AlbumIntelRow[] = [];
        await runWithPool(topAlbums, async (album) => {
          // Fetch 12 assets sorted DESC (most recent first) — better
          // recency detection than oldest-first sampling with 4 items.
          const { assets } = await MediaLibrary.getAssetsAsync({
            album: album.id,
            first: 12,
            mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
            sortBy: [[MediaLibrary.SortBy.creationTime, false]] as any,
          });
          if (assets.length === 0) return;

          let sampleTotal = 0;
          let oldestTime: number | undefined;
          let newestTime: number | undefined;
          const staleThreshold = Date.now() / 1000 - 180 * 86400; // 180 days ago
          for (const asset of assets) {
            const s = asset.mediaType === MediaLibrary.MediaType.video
              ? estimateVideoSize(asset.duration)
              : estimateImageSize(asset.width, asset.height);
            sampleTotal += s;
            if (!oldestTime || asset.creationTime < oldestTime) oldestTime = asset.creationTime;
            if (!newestTime || asset.creationTime > newestTime) newestTime = asset.creationTime;
          }
          const avgSize = sampleTotal / assets.length;
          // Album is stale when even the most recently sampled asset is >180 days old
          const isStale = newestTime !== undefined && newestTime < staleThreshold;

          albumData.push({
            id: album.id,
            title: album.title,
            assetCount: album.assetCount,
            estimatedSize: Math.round(avgSize * album.assetCount),
            oldestAssetDate: oldestTime,
            newestAssetDate: newestTime,
            isStale,
          });
        }, POOL_CONCURRENCY);

        albumData.sort((a, b) => b.estimatedSize - a.estimatedSize);
        setAlbumBreakdown(albumData.slice(0, 12));
        addLog(`folder analysis: ${albumData.length} folder${albumData.length !== 1 ? 's' : ''} mapped`);
      } catch (err) {
        logError('storage-intel/albumScan', err);
      }
    }

    setProgress(100);
    setScanning(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [scanMediaLibrary, addLog, addScanSnapshot, storageStats]);

  const bevel = useBevel();

  const prevSnap: ScanSnapshot | null = snapshots.length >= 2 ? snapshots[1] : null;

  const total = storageStats?.totalSpace ?? 1;
  const used = storageStats?.usedSpace ?? 0;
  const free = storageStats?.freeSpace ?? 0;

  const categories: CategoryRow[] = mediaBreakdown ? [
    {
      key: 'images', label: 'IMAGES', icon: 'image', color: colors.primary,
      count: mediaBreakdown.images.count, size: mediaBreakdown.images.size,
      prevSize: prevSnap?.imageSize,
    },
    {
      key: 'videos', label: 'VIDEOS', icon: 'film', color: colors.accent,
      count: mediaBreakdown.videos.count, size: mediaBreakdown.videos.size,
      prevSize: prevSnap?.videoSize,
      action: () => router.push('/large-files'), actionLabel: 'VIEW →',
    },
    {
      key: 'audio', label: 'AUDIO', icon: 'music', color: colors.warning,
      count: mediaBreakdown.audio.count, size: mediaBreakdown.audio.size,
      prevSize: prevSnap?.audioSize,
    },
    {
      key: 'screenshots', label: 'SCREENSHOTS', icon: 'monitor', color: colors.success,
      count: mediaBreakdown.screenshots.count, size: mediaBreakdown.screenshots.size,
      prevSize: prevSnap?.screenshotSize,
      action: () => router.push('/screenshot-manager'), actionLabel: 'MANAGE →',
    },
    {
      key: 'downloads', label: 'DOWNLOADS*', icon: 'download', color: '#7B7BFF',
      count: mediaBreakdown.downloads.count, size: mediaBreakdown.downloads.size,
      action: () => router.push('/junk-cleaner'), actionLabel: 'CLEAN →',
      isSubset: true,
    },
    {
      key: 'appCache', label: 'APP CACHE', icon: 'cpu', color: colors.destructive,
      count: 1, size: mediaBreakdown.appCache.size,
      action: () => router.push('/app-cache'), actionLabel: 'CLEAN →',
    },
  ] : [];

  const nonSubsetCats = categories.filter(c => !c.isSubset && c.key !== 'appCache');
  const totalMediaSize = nonSubsetCats.reduce((acc, c) => acc + c.size, 0);

  const advisorCards = buildAdvisorCards(storageStats, mediaBreakdown, journal, snapshots, richScanData);

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
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{'> ANALYSIS'}</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>STORAGE INTEL</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 + webBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Disk stats ── */}
        {storageStats && (
          <Animated.View entering={FadeIn} style={[styles.diskPanel, bevel, { backgroundColor: colors.card }]}>
            <Text style={[styles.panelHead, { color: colors.primary }]}>{'[DISK STATUS]'}</Text>
            {[
              { key: 'TOTAL', val: formatBytes(total), color: colors.foreground, delta: null },
              {
                key: 'USED', val: formatBytes(used), color: colors.accent,
                delta: prevSnap ? used - prevSnap.usedSpace : null,
              },
              {
                key: 'FREE', val: formatBytes(free), color: colors.success,
                delta: prevSnap ? free - prevSnap.freeSpace : null,
              },
            ].map(row => (
              <View key={row.key} style={styles.diskRow}>
                <Text style={[styles.diskKey, { color: colors.mutedForeground }]}>{row.key}</Text>
                <Text style={styles.diskSep}>{' = '}</Text>
                <Text style={[styles.diskVal, { color: row.color }]}>{row.val}</Text>
                {row.delta !== null && Math.abs(row.delta) > 100_000 && (
                  <Text style={[styles.diskDelta, {
                    color: row.key === 'USED'
                      ? (row.delta > 0 ? colors.destructive : colors.success)
                      : (row.delta > 0 ? colors.success : colors.destructive),
                  }]}>
                    {' '}{formatDelta(row.delta)}
                  </Text>
                )}
              </View>
            ))}
            <View style={{ marginTop: 10, gap: 4 }}>
              <SegBar value={used / total} color={colors.accent} total={30} />
              <View style={styles.barLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                    USED {Math.round((used / total) * 100)}%
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
                  <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                    FREE {Math.round((free / total) * 100)}%
                  </Text>
                </View>
                {prevSnap && (
                  <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                    vs {daysAgoLabel(prevSnap.timestamp)}
                  </Text>
                )}
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Scan button ── */}
        {!scanning && (
          <Pressable onPress={runScan} style={styles.fullWidth} accessibilityRole="button" accessibilityLabel={mediaBreakdown ? 'Re-scan storage' : 'Analyse storage'}>
            <View style={[styles.primaryBtn, {
              backgroundColor: colors.primary,
              borderTopColor: colors.bevelDark, borderLeftColor: colors.bevelDark,
              borderBottomColor: colors.bevelLight, borderRightColor: colors.bevelLight,
              borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
            }]}>
              <Feather name="bar-chart-2" size={16} color={colors.primaryForeground} />
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                {mediaBreakdown ? '>> RE-SCAN' : '>> ANALYSE STORAGE'}
              </Text>
            </View>
          </Pressable>
        )}

        {/* ── Scanning ── */}
        {scanning && (
          <Animated.View entering={FadeIn} style={[styles.scanPanel, bevel, { backgroundColor: colors.card }]}>
            <Text style={[styles.scanTitle, { color: colors.primary }]}>{'[ANALYSING...]'}</Text>
            <Text style={[styles.scanPct, { color: colors.primary }]}>
              {String(progress).padStart(3, '0')}%
            </Text>
            <SegBar value={progress / 100} color={colors.primary} total={30} />
            <TerminalLog lines={logs} />
          </Animated.View>
        )}

        {/* ── Post-scan results ── */}
        {mediaBreakdown && !scanning && (
          <Animated.View entering={FadeIn} style={{ gap: 10 }}>
            {/* Truncation banner — shown when the global scan cap was hit */}
            {scanTruncated && (
              <View style={[styles.truncBanner, { backgroundColor: colors.warning + '18', borderColor: colors.warning }]}>
                <Feather name="alert-triangle" size={12} color={colors.warning} />
                <Text style={[styles.truncText, { color: colors.warning }]}>
                  {'[!] RESULTS CAPPED — LIBRARY TOO LARGE FOR A SINGLE SCAN · RE-SCAN TO CYCLE'}
                </Text>
              </View>
            )}
            {/* Last scanned */}
            {mediaBreakdown.lastScanned && (
              <Text style={[styles.lastScanned, { color: colors.mutedForeground }]}>
                {'> LAST SCANNED: '}{formatAbsoluteDate(mediaBreakdown.lastScanned)}
                {'  ·  '}{mediaBreakdown.totalScanned} ITEMS
                {prevSnap && `  ·  PREV: ${daysAgoLabel(prevSnap.timestamp)}`}
              </Text>
            )}

            {/* ── Storage Advisor ── */}
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>
              {'── STORAGE ADVISOR ──────────────────'}
            </Text>
            <View style={[styles.advisorMeta, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.advisorMetaText, { color: colors.mutedForeground }]}>
                {'[i] '} Every recommendation explains WHY it exists, how much space is recoverable, how safe the action is, and any Android limitations. Priority is ordered by impact and safety.
              </Text>
            </View>
            {advisorCards.map(card => (
              <AdvisorCardUI key={card.id} card={card} bevel={bevel} />
            ))}

            {/* ── Media Breakdown ── */}
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>
              {'── MEDIA BREAKDOWN ──────────────────'}
            </Text>
            <View style={[styles.catPanel, bevel, { backgroundColor: colors.card }]}>
              <Text style={[styles.panelHead, { color: colors.primary }]}>
                {'[BY CATEGORY]'}
                <Text style={[styles.estNote, { color: colors.mutedForeground }]}>{' · sizes estimated'}</Text>
              </Text>

              {categories.map((cat, idx) => {
                const delta = (cat.prevSize !== undefined && cat.prevSize !== null)
                  ? cat.size - cat.prevSize : null;
                const share = totalMediaSize > 0 && !cat.isSubset ? cat.size / totalMediaSize : 0;
                return (
                  <View
                    key={cat.key}
                    style={[
                      styles.catRow,
                      idx < categories.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      cat.isSubset && { opacity: 0.75 },
                    ]}
                  >
                    <View style={[styles.catIconBox, { borderColor: cat.color + '40' }]}>
                      <Feather name={cat.icon} size={13} color={cat.color} />
                    </View>
                    <View style={styles.catInfo}>
                      <View style={styles.catTopRow}>
                        <Text style={[styles.catLabel, { color: cat.isSubset ? colors.mutedForeground : colors.foreground }]}>
                          {cat.label}
                        </Text>
                        <View style={styles.catTopRight}>
                          {delta !== null && Math.abs(delta) > 500_000 && (
                            <Text style={[styles.catDelta, {
                              color: delta > 0 ? colors.destructive : colors.success,
                            }]}>
                              {formatDelta(delta)}{'  '}
                            </Text>
                          )}
                          {cat.action && (
                            <Pressable onPress={cat.action}>
                              <Text style={[styles.catAction, { color: cat.color }]}>{cat.actionLabel}</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                      <View style={styles.catBottomRow}>
                        {cat.key !== 'appCache' && (
                          <Text style={[styles.catCount, { color: colors.mutedForeground }]}>
                            {cat.count.toLocaleString()} items{cat.isSubset ? '*' : ''}{' · '}
                          </Text>
                        )}
                        <Text style={[styles.catSize, { color: cat.color }]}>~{formatBytes(cat.size)}</Text>
                      </View>
                      {share > 0 && (
                        <View style={{ marginTop: 5 }}>
                          <SegBar value={share} color={cat.color} total={20} />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* ── Smart Categories (Storage Intelligence Engine) ── */}
            {richScanData && richScanData.smartCategories.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.primary }]}>
                  {'── SMART CATEGORIES ─────────────────'}
                </Text>
                <View style={[styles.catPanel, bevel, { backgroundColor: colors.card }]}>
                  <Text style={[styles.panelHead, { color: colors.primary }]}>
                    {'[BY SOURCE APP]'}
                    <Text style={[styles.estNote, { color: colors.mutedForeground }]}>{' · detected from album names'}</Text>
                  </Text>
                  {richScanData.smartCategories.map((cat, idx) => {
                    const catTotal = richScanData.smartCategories.reduce((s, c) => s + c.estimatedSize, 0);
                    const share = catTotal > 0 ? cat.estimatedSize / catTotal : 0;
                    const catColor =
                      idx === 0 ? colors.primary :
                      idx === 1 ? colors.accent :
                      idx === 2 ? colors.success :
                      idx === 3 ? colors.warning : colors.mutedForeground;
                    return (
                      <View
                        key={cat.sourceApp}
                        style={[
                          styles.catRow,
                          idx < richScanData.smartCategories.length - 1 && {
                            borderBottomWidth: 1, borderBottomColor: colors.border,
                          },
                        ]}
                      >
                        <View style={[styles.catIconBox, { borderColor: catColor + '40' }]}>
                          <Feather name={cat.icon as never} size={13} color={catColor} />
                        </View>
                        <View style={styles.catInfo}>
                          <View style={styles.catTopRow}>
                            <Text style={[styles.catLabel, { color: colors.foreground }]}>
                              {cat.label.toUpperCase()}
                            </Text>
                            <Text style={[styles.catSize, { color: catColor }]}>~{formatBytes(cat.estimatedSize)}</Text>
                          </View>
                          <Text style={[styles.catCount, { color: colors.mutedForeground }]}>
                            {cat.count.toLocaleString()} items
                          </Text>
                          <View style={{ marginTop: 5 }}>
                            <SegBar value={share} color={catColor} total={20} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Folder Intelligence ── */}
            {albumBreakdown.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.primary }]}>
                  {'── FOLDER INTELLIGENCE ──────────────'}
                </Text>
                <View style={[styles.catPanel, bevel, { backgroundColor: colors.card }]}>
                  <Text style={[styles.panelHead, { color: colors.primary }]}>
                    {'[TOP FOLDERS BY SIZE]'}
                    <Text style={[styles.estNote, { color: colors.mutedForeground }]}>{' · estimated'}</Text>
                  </Text>
                  {albumBreakdown.map((album, idx) => (
                    <View
                      key={album.id}
                      style={[
                        styles.catRow,
                        idx < albumBreakdown.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <View style={[styles.catIconBox, { borderColor: colors.primary + '40' }]}>
                        <Feather name="folder" size={13} color={colors.primary} />
                      </View>
                      <View style={styles.catInfo}>
                        <View style={styles.catTopRow}>
                          <Text style={[styles.catLabel, { color: colors.foreground }]} numberOfLines={1}>
                            {album.title.toUpperCase()}
                          </Text>
                          <Text style={[styles.catSize, { color: colors.primary }]}>~{formatBytes(album.estimatedSize)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                          <Text style={[styles.catCount, { color: colors.mutedForeground }]}>
                            {album.assetCount.toLocaleString()} items
                            {album.newestAssetDate ? ` · latest: ${getAgeText(album.newestAssetDate)}` :
                             album.oldestAssetDate ? ` · oldest: ${getAgeText(album.oldestAssetDate)}` : ''}
                          </Text>
                          {album.isStale !== undefined && (
                            <View style={{
                              paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1,
                              borderColor: album.isStale ? '#FFFFFF30' : colors.success + '70',
                              backgroundColor: album.isStale ? '#FFFFFF08' : colors.success + '18',
                            }}>
                              <Text style={{ fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1,
                                color: album.isStale ? colors.mutedForeground : colors.success }}>
                                {album.isStale ? 'STALE' : 'ACTIVE'}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={{ marginTop: 5 }}>
                          <SegBar
                            value={album.estimatedSize / Math.max(1, albumBreakdown[0].estimatedSize)}
                            color={colors.primary}
                            total={20}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={[styles.noteBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
                    {'[i] '} Folder sizes are estimated from a sample of each folder's assets. Actual sizes may differ based on compression and file format.
                  </Text>
                </View>
              </>
            )}

            {/* ── Transparency note ── */}
            <View style={[styles.noteBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.noteTitle, { color: colors.primary }]}>{'[!] ABOUT THESE NUMBERS'}</Text>
              <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
                {'> '} Sizes are estimated from image dimensions and video duration. Android does not expose exact file sizes to third-party apps without root.{'\n'}
                {'> '} DOWNLOADS* is a subset of Images+Videos — not additive.{'\n'}
                {'> '} Storage Advisor recovery figures are estimates based on typical usage patterns.
              </Text>
            </View>

            {/* ── Snapshot history ── */}
            {snapshots.length > 1 && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.lastScanned, { color: colors.mutedForeground }]}>
                  {'── SCAN HISTORY ──────────────────────'}
                </Text>
                <View style={[styles.snapPanel, bevel, { backgroundColor: colors.card }]}>
                  {snapshots.slice(0, 5).map((snap, idx) => (
                    <View
                      key={snap.id}
                      style={[
                        styles.snapRow,
                        idx < Math.min(snapshots.length, 5) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.snapDate, { color: colors.mutedForeground }]}>
                        {formatAbsoluteDate(snap.timestamp)}
                      </Text>
                      <Text style={[styles.snapUsed, { color: colors.accent }]}>
                        {formatBytes(snap.usedSpace)} used
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Empty state ── */}
        {!mediaBreakdown && !scanning && (
          <View style={[styles.emptyPanel, bevel, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>{'[ _ ]'}</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>AWAITING SCAN</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              {'> NO DATA ON FILE\n\nRun Analyse Storage to map your media by category, generate Storage Advisor recommendations, and build a folder-level size breakdown.'}
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
  headerSub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 2 },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  content: { padding: 16, gap: 12 },
  fullWidth: { width: '100%' },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  diskPanel: { padding: 14, gap: 6 },
  panelHead: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 6 },
  estNote: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  diskRow: { flexDirection: 'row', alignItems: 'center' },
  diskKey: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 1, width: 60 },
  diskSep: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#444' },
  diskVal: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  diskDelta: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  barLegend: { flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8 },
  legendText: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 10,
  },
  primaryBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },

  scanPanel: { padding: 16, gap: 14 },
  scanTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  scanPct: { fontSize: 40, fontFamily: 'Inter_700Bold', letterSpacing: 2, textAlign: 'center' },

  lastScanned: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  // Advisor card styles
  advisorMeta: { padding: 10, borderWidth: 1 },
  advisorMetaText: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3, lineHeight: 15 },

  advisorCard: {
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
    overflow: 'hidden',
  },
  advisorCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 10, borderBottomWidth: 1,
  },
  advisorCardHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  advisorCategory: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  advisorPriority: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 1 },
  advisorCardBody: { padding: 12, gap: 8 },
  advisorTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  advisorTrigger: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3, lineHeight: 15 },

  advisorStats: {
    flexDirection: 'row', gap: 6, paddingVertical: 8,
    borderTopWidth: 1, borderBottomWidth: 1, flexWrap: 'wrap',
  },
  advisorStat: { flex: 1, minWidth: 80, gap: 2 },
  advisorStatLabel: { fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  advisorStatValue: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  advisorExplanation: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17, letterSpacing: 0.2 },

  advisorAndroidNote: { padding: 8, borderWidth: 1 },
  advisorAndroidNoteText: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.3, lineHeight: 14 },

  advisorCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, padding: 10, marginTop: 2,
  },
  advisorCtaText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },

  // Category breakdown styles
  catPanel: { overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  catIconBox: { width: 30, height: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  catInfo: { flex: 1, gap: 2 },
  catTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1, flex: 1, marginRight: 8 },
  catTopRight: { flexDirection: 'row', alignItems: 'center' },
  catDelta: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  catAction: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  catBottomRow: { flexDirection: 'row', alignItems: 'center' },
  catCount: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },
  catSize: { fontSize: 10, fontFamily: 'Inter_700Bold' },

  truncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderWidth: 1,
  },
  truncText: { flex: 1, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, lineHeight: 14 },

  noteBox: { borderWidth: 1, padding: 12, gap: 6 },
  noteTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginBottom: 4 },
  noteText: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 16 },

  snapPanel: { overflow: 'hidden' },
  snapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10 },
  snapDate: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  snapUsed: { fontSize: 10, fontFamily: 'Inter_700Bold' },

  emptyPanel: { padding: 32, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: 4 },
  emptyTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginTop: 4 },
  emptyDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, textAlign: 'center', lineHeight: 18 },
});
