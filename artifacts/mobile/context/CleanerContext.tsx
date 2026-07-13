import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { SCAN_CAP_GLOBAL, POOL_CONCURRENCY, SNAPSHOT_MAX, JOURNAL_MAX, HISTORY_MAX } from '@/constants/limits';
import { logError } from '@/utils/logger';
import { runWithPool } from '@/utils/pool';

export interface CleanHistoryItem {
  id: string;
  date: string;
  bytesFreed: number;
  type: 'junk' | 'duplicates' | 'large_files' | 'cache' | 'full' | 'screenshots';
  label: string;
}

export interface ScheduleSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  lastRun: string | null;
}

export interface StorageStats {
  totalSpace: number;
  usedSpace: number;
  freeSpace: number;
  /** Bytes of own app cache — real, from FileSystem.getInfoAsync */
  appCacheSize: number;
}

export interface MediaBreakdown {
  images: { count: number; size: number };
  videos: { count: number; size: number };
  audio: { count: number; size: number };
  screenshots: { count: number; size: number };
  downloads: { count: number; size: number };
  appCache: { size: number };
  totalScanned: number;
  /** Sizes derived from dimensions/duration — not exact */
  sizesAreEstimated: true;
  lastScanned: string | null;
}

/** Snapshot of storage state at a point in time — used for trend comparison */
export interface ScanSnapshot {
  id: string;
  timestamp: string;
  totalSpace: number;
  usedSpace: number;
  freeSpace: number;
  appCacheSize: number;
  mediaItemCount: number;
  imageSize: number;
  videoSize: number;
  audioSize: number;
  screenshotSize: number;
}

export interface ScanJournalEntry {
  id: string;
  /** Auto-assigned sequential scan number */
  scanNumber: number;
  /** Unix ms timestamp of the clean operation */
  timestamp: number;
  tool: 'junk' | 'duplicates' | 'large_files' | 'screenshots' | 'cache' | 'storage_intel';
  /** Total ms from scan start to clean completion */
  durationMs: number;
  /** Number of items/groups found during scan */
  itemsFound: number;
  /** Number of items actually deleted */
  itemsCleaned: number;
  /** Total bytes of all found items */
  bytesFound: number;
  /** Bytes actually freed */
  bytesRecovered: number;
  /** Device total storage at time of scan */
  totalStorageBytes: number;
}

/** Estimate image bytes from dimensions (JPEG ~20:1 compression from raw RGB) */
export function estimateImageSize(width: number, height: number): number {
  return Math.round(width * height * 0.2);
}

/** Estimate video bytes from duration (assumes ~4 Mbps average mobile bitrate) */
export function estimateVideoSize(durationSeconds: number): number {
  return Math.round(Math.max(1, durationSeconds) * 4_000_000 / 8);
}

/** Estimate audio bytes from duration (assumes ~128 kbps) — internal use only */
function estimateAudioSize(durationSeconds: number): number {
  return Math.round(Math.max(1, durationSeconds) * 128_000 / 8);
}


/** Try to get real file size from a local URI. Returns null on failure. */
export async function getRealFileSize(uri: string): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
    if (info.exists) return (info as any).size ?? null;
  } catch {}
  return null;
}

// ── Storage Intelligence Engine — source app types & rich scan data ───────────
// Types live in sourceApps.ts; re-exported here for backward compatibility.

export type { SourceApp, RichAsset, SmartCategory, RichScanData } from './sourceApps';
export { SOURCE_APP_META } from './sourceApps';
// Local aliases for internal use in this file
import type { SourceApp, RichAsset, SmartCategory, RichScanData } from './sourceApps';
import { SOURCE_APP_META } from './sourceApps';

interface CleanerContextType {
  storageStats: StorageStats | null;
  isLoadingStats: boolean;
  isStatsError: boolean;
  mediaBreakdown: MediaBreakdown | null;
  richScanData: RichScanData | null;
  /** True when the last scan hit SCAN_CAP_GLOBAL and results were truncated */
  scanTruncated: boolean;
  snapshots: ScanSnapshot[];
  history: CleanHistoryItem[];
  totalBytesFreed: number;
  scheduleSettings: ScheduleSettings;
  rootEnabled: boolean;
  safeMode: boolean;
  refreshStats: () => Promise<void>;
  scanMediaLibrary: (
    onProgress?: (pct: number) => void,
    onLog?: (msg: string) => void
  ) => Promise<MediaBreakdown | null>;
  addScanSnapshot: (snap: Omit<ScanSnapshot, 'id'>) => Promise<void>;
  addHistoryItem: (item: Omit<CleanHistoryItem, 'id'>) => Promise<void>;
  journal: ScanJournalEntry[];
  addJournalEntry: (entry: Omit<ScanJournalEntry, 'id' | 'scanNumber'>) => Promise<void>;
  updateSchedule: (settings: Partial<ScheduleSettings>) => Promise<void>;
  setRootEnabled: (enabled: boolean) => Promise<void>;
  setSafeMode: (enabled: boolean) => Promise<void>;
}

const CleanerContext = createContext<CleanerContextType | null>(null);

const STORAGE_KEYS = {
  HISTORY: 'cleandroid_history',
  SCHEDULE: 'cleandroid_schedule',
  ROOT: 'cleandroid_root',
  SAFE_MODE: 'cleandroid_safe_mode',
  TOTAL_FREED: 'cleandroid_total_freed',
  SNAPSHOTS: 'cleandroid_snapshots',
  JOURNAL: 'cleandroid_journal',
};

const DEFAULT_SCHEDULE: ScheduleSettings = {
  enabled: false,
  frequency: 'weekly',
  lastRun: null,
};

async function getOwnCacheSize(): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = await FileSystem.getInfoAsync(FileSystem.cacheDirectory!, { size: true } as any);
    if (info.exists) return (info as any).size ?? 0;
  } catch {}
  return 0;
}

export function CleanerProvider({ children }: { children: React.ReactNode }) {
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isStatsError, setIsStatsError] = useState(false);
  const [mediaBreakdown, setMediaBreakdown] = useState<MediaBreakdown | null>(null);
  const [richScanData, setRichScanData] = useState<RichScanData | null>(null);
  const [scanTruncated, setScanTruncated] = useState(false);
  const [snapshots, setSnapshots] = useState<ScanSnapshot[]>([]);
  const [journal, setJournal] = useState<ScanJournalEntry[]>([]);
  const [history, setHistory] = useState<CleanHistoryItem[]>([]);
  const [totalBytesFreed, setTotalBytesFreed] = useState(0);
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettings>(DEFAULT_SCHEDULE);
  const [rootEnabled, setRootEnabledState] = useState(false);
  // Safe Mode: simulate deletions without touching real files.
  // Default ON in __DEV__ (beta testing), OFF in production builds.
  const [safeMode, setSafeModeState] = useState(__DEV__);

  const refreshStats = useCallback(async () => {
    setIsLoadingStats(true);
    setIsStatsError(false);
    try {
      const [freeSpace, totalSpace, appCacheSize] = await Promise.all([
        FileSystem.getFreeDiskStorageAsync(),
        FileSystem.getTotalDiskCapacityAsync(),
        getOwnCacheSize(),
      ]);
      setStorageStats({ totalSpace, usedSpace: totalSpace - freeSpace, freeSpace, appCacheSize });
    } catch (err) {
      logError('refreshStats', err);
      // Android filesystem APIs unavailable (e.g. web preview, restricted sandbox).
      // Leave storageStats as null — never fabricate storage numbers.
      setIsStatsError(true);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const scanMediaLibrary = useCallback(async (
    onProgress?: (pct: number) => void,
    onLog?: (msg: string) => void
  ): Promise<MediaBreakdown | null> => {
    if (Platform.OS === 'web') return null;

    onLog?.('requesting media library access...');
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      onLog?.('[!] media access denied — grant permission in settings');
      return null;
    }

    onProgress?.(5);
    onLog?.('loading media library...');

    try {
      let allAssets: MediaLibrary.Asset[] = [];
      let after: string | undefined;
      let batchNum = 0;

      do {
        const page = await MediaLibrary.getAssetsAsync({
          first: 500,
          after,
          sortBy: [MediaLibrary.SortBy.creationTime],
          mediaType: [
            MediaLibrary.MediaType.photo,
            MediaLibrary.MediaType.video,
            MediaLibrary.MediaType.audio,
          ],
        });
        allAssets = [...allAssets, ...page.assets];
        after = page.hasNextPage ? page.endCursor : undefined;
        batchNum++;
        onProgress?.(Math.min(40, 5 + batchNum * 10));
        onLog?.(`loaded ${allAssets.length} media items...`);
      } while (after && allAssets.length < SCAN_CAP_GLOBAL);

      const wasTruncated = !!after; // still had pages after hitting the cap
      setScanTruncated(wasTruncated);
      if (wasTruncated) onLog?.(`[!] large library — results capped at ${SCAN_CAP_GLOBAL}`);

      onProgress?.(50);
      onLog?.('finding albums...');

      const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      const screenshotAlbum = albums.find(a => a.title.toLowerCase().includes('screenshot'));
      const downloadAlbum = albums.find(a =>
        a.title.toLowerCase() === 'download' || a.title.toLowerCase() === 'downloads'
      );

      let screenshotIds = new Set<string>();
      let downloadIds = new Set<string>();

      if (screenshotAlbum) {
        onLog?.(`scanning Screenshots album...`);
        const ssAssets = await MediaLibrary.getAssetsAsync({
          first: 2000, album: screenshotAlbum,
          mediaType: [MediaLibrary.MediaType.photo],
        });
        ssAssets.assets.forEach(a => screenshotIds.add(a.id));
      }

      onProgress?.(70);

      if (downloadAlbum) {
        onLog?.(`scanning Downloads album...`);
        const dlAssets = await MediaLibrary.getAssetsAsync({
          first: 1000, album: downloadAlbum,
        });
        dlAssets.assets.forEach(a => downloadIds.add(a.id));
      }

      onProgress?.(85);
      onLog?.('calculating storage usage...');

      const breakdown: MediaBreakdown = {
        images: { count: 0, size: 0 },
        videos: { count: 0, size: 0 },
        audio: { count: 0, size: 0 },
        screenshots: { count: 0, size: 0 },
        downloads: { count: 0, size: 0 },
        appCache: { size: 0 },
        totalScanned: allAssets.length,
        sizesAreEstimated: true,
        lastScanned: new Date().toISOString(),
      };

      for (const asset of allAssets) {
        const isScreenshot = screenshotIds.has(asset.id);
        const isDownload = downloadIds.has(asset.id);

        if (asset.mediaType === MediaLibrary.MediaType.photo) {
          const size = estimateImageSize(asset.width, asset.height);
          if (isScreenshot) {
            breakdown.screenshots.count++;
            breakdown.screenshots.size += size;
          } else {
            breakdown.images.count++;
            breakdown.images.size += size;
          }
          if (isDownload) { breakdown.downloads.count++; breakdown.downloads.size += size; }
        } else if (asset.mediaType === MediaLibrary.MediaType.video) {
          const size = estimateVideoSize(asset.duration);
          breakdown.videos.count++;
          breakdown.videos.size += size;
          if (isDownload) { breakdown.downloads.count++; breakdown.downloads.size += size; }
        } else if (asset.mediaType === MediaLibrary.MediaType.audio) {
          breakdown.audio.count++;
          breakdown.audio.size += estimateAudioSize(asset.duration);
        }
      }

      breakdown.appCache.size = await getOwnCacheSize();

      onProgress?.(100);
      onLog?.(`scan complete — ${allAssets.length} items analysed`);

      setMediaBreakdown(breakdown);

      // ── Build rich scan data (Storage Intelligence Engine) ────────────────
      // Detects source apps (WhatsApp, Telegram, Instagram, etc.) from album
      // membership, then builds SmartCategory[] for the Storage Map screen.
      // This is best-effort — any failure here leaves breakdown intact.
      try {
        onLog?.('building source app categories...');

        // Priority map: asset id → SourceApp
        // Screenshots and downloads are already detected above.
        const sourceMap = new Map<string, SourceApp>();
        screenshotIds.forEach(id => sourceMap.set(id, 'screenshots'));
        downloadIds.forEach(id  => sourceMap.set(id, 'downloads'));

        // Named source-app patterns (order = tie-break priority, lower = wins)
        const namedApps: Array<{ pattern: string; app: SourceApp }> = [
          { pattern: 'whatsapp',       app: 'whatsapp' },
          { pattern: 'telegram',       app: 'telegram' },
          { pattern: 'instagram',      app: 'instagram' },
          { pattern: 'snapchat',       app: 'snapchat' },
          { pattern: 'tiktok',         app: 'tiktok' },
          { pattern: 'musically',      app: 'tiktok' },
          { pattern: 'signal',         app: 'signal' },
          { pattern: 'discord',        app: 'discord' },
          { pattern: 'screen record',  app: 'screen_recording' },
          { pattern: 'screenrecord',   app: 'screen_recording' },
          { pattern: 'twitter',        app: 'twitter' },
          { pattern: 'facebook',       app: 'facebook' },
        ];

        // Fetch one page (≤2000 assets) per matched album, concurrency-limited
        await runWithPool(namedApps, async ({ pattern, app }) => {
          const match = albums.find(a => a.title.toLowerCase().includes(pattern));
          if (!match || match.assetCount === 0) return;
          const page = await MediaLibrary.getAssetsAsync({
            first: 2000, album: match,
            mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video, MediaLibrary.MediaType.audio],
          });
          page.assets.forEach(a => {
            if (!sourceMap.has(a.id)) sourceMap.set(a.id, app);
          });
        }, POOL_CONCURRENCY);

        // Build RichAsset[] — annotate every scanned asset with its sourceApp
        const richAssets: RichAsset[] = allAssets.map(a => {
          // Fallback: photos → camera, video/audio → other
          const sourceApp: SourceApp = sourceMap.get(a.id)
            ?? (a.mediaType === MediaLibrary.MediaType.photo ? 'camera' : 'other');
          const size =
            a.mediaType === MediaLibrary.MediaType.video ? estimateVideoSize(a.duration)
            : a.mediaType === MediaLibrary.MediaType.audio ? estimateAudioSize(a.duration)
            : estimateImageSize(a.width, a.height);
          return {
            id: a.id,
            filename: a.filename,
            uri: a.uri,
            mediaType:
              a.mediaType === MediaLibrary.MediaType.video ? 'video'
              : a.mediaType === MediaLibrary.MediaType.audio ? 'audio'
              : 'photo',
            width: a.width,
            height: a.height,
            duration: a.duration,
            creationTime: a.creationTime,
            modificationTime: (a as any).modificationTime ?? 0,
            estimatedSize: size,
            sourceApp,
            isScreenshot: screenshotIds.has(a.id),
            isDownload: downloadIds.has(a.id),
          };
        });

        // Sort largest-first (used by large-files cache)
        richAssets.sort((a, b) => b.estimatedSize - a.estimatedSize);

        // Build SmartCategory[] — group by sourceApp
        const catMap = new Map<SourceApp, SmartCategory>();
        for (const asset of richAssets) {
          const existing = catMap.get(asset.sourceApp);
          if (existing) {
            existing.count++;
            existing.estimatedSize += asset.estimatedSize;
          } else {
            const meta = SOURCE_APP_META[asset.sourceApp];
            catMap.set(asset.sourceApp, {
              sourceApp: asset.sourceApp,
              label: meta.label,
              icon: meta.icon,
              count: 1,
              estimatedSize: asset.estimatedSize,
            });
          }
        }
        const smartCategories = Array.from(catMap.values())
          .filter(c => c.count >= 2 || c.estimatedSize > 100_000)
          .sort((a, b) => b.estimatedSize - a.estimatedSize);

        setRichScanData({
          timestamp: new Date().toISOString(),
          assets: richAssets,
          totalAssetCount: allAssets.length,
          smartCategories,
        });

        onLog?.(`source analysis: ${smartCategories.length} app categor${smartCategories.length !== 1 ? 'ies' : 'y'} detected`);
      } catch (err) {
        logError('richScanData', err);
        // Rich scan data is best-effort — breakdown result is unaffected
      }

      return breakdown;
    } catch (e) {
      logError('scanMediaLibrary', e);
      onLog?.(`[!] scan error: ${String(e)}`);
      return null;
    }
  }, []);

  const addScanSnapshot = useCallback(async (snap: Omit<ScanSnapshot, 'id'>) => {
    const newSnap: ScanSnapshot = {
      ...snap,
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    };
    setSnapshots(prev => {
      const updated = [newSnap, ...prev].slice(0, SNAPSHOT_MAX);
      AsyncStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const addJournalEntry = useCallback(async (entry: Omit<ScanJournalEntry, 'id' | 'scanNumber'>) => {
    setJournal(prev => {
      const newEntry: ScanJournalEntry = {
        ...entry,
        id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
        scanNumber: prev.length + 1,
      };
      const updated = [newEntry, ...prev].slice(0, JOURNAL_MAX);
      AsyncStorage.setItem(STORAGE_KEYS.JOURNAL, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const loadPersisted = useCallback(async () => {
    try {
      const [histRaw, schedRaw, rootRaw, freedRaw, snapsRaw, journalRaw, safeModeRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.HISTORY),
        AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE),
        AsyncStorage.getItem(STORAGE_KEYS.ROOT),
        AsyncStorage.getItem(STORAGE_KEYS.TOTAL_FREED),
        AsyncStorage.getItem(STORAGE_KEYS.SNAPSHOTS),
        AsyncStorage.getItem(STORAGE_KEYS.JOURNAL),
        AsyncStorage.getItem(STORAGE_KEYS.SAFE_MODE),
      ]);
      if (histRaw) setHistory(JSON.parse(histRaw));
      if (schedRaw) setScheduleSettings(JSON.parse(schedRaw));
      if (rootRaw) setRootEnabledState(rootRaw === 'true');
      if (freedRaw) setTotalBytesFreed(Number(freedRaw));
      // Only apply persisted safe mode if the user has explicitly set it before
      if (safeModeRaw !== null) setSafeModeState(safeModeRaw === 'true');
      if (snapsRaw) setSnapshots(JSON.parse(snapsRaw));
      if (journalRaw) setJournal(JSON.parse(journalRaw));
    } catch (err) {
      logError('loadPersisted', err);
    }
  }, []);

  useEffect(() => {
    loadPersisted();
    refreshStats();
  }, [loadPersisted, refreshStats]);

  const addHistoryItem = useCallback(async (item: Omit<CleanHistoryItem, 'id'>) => {
    const newItem: CleanHistoryItem = {
      ...item,
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
    };
    setHistory(prev => {
      const updated = [newItem, ...prev].slice(0, HISTORY_MAX);
      AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));
      return updated;
    });
    setTotalBytesFreed(prev => {
      const updated = prev + item.bytesFreed;
      AsyncStorage.setItem(STORAGE_KEYS.TOTAL_FREED, String(updated));
      return updated;
    });
    await refreshStats();
  }, [refreshStats]);

  const updateSchedule = useCallback(async (settings: Partial<ScheduleSettings>) => {
    setScheduleSettings(prev => {
      const updated = { ...prev, ...settings };
      AsyncStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const setRootEnabled = useCallback(async (enabled: boolean) => {
    setRootEnabledState(enabled);
    await AsyncStorage.setItem(STORAGE_KEYS.ROOT, String(enabled));
  }, []);

  const setSafeMode = useCallback(async (enabled: boolean) => {
    setSafeModeState(enabled);
    await AsyncStorage.setItem(STORAGE_KEYS.SAFE_MODE, String(enabled));
  }, []);

  const contextValue = useMemo(() => ({
    storageStats, isLoadingStats, isStatsError, mediaBreakdown, richScanData, scanTruncated,
    snapshots, history, totalBytesFreed, scheduleSettings, rootEnabled, safeMode,
    journal, refreshStats, scanMediaLibrary, addScanSnapshot,
    addHistoryItem, addJournalEntry, updateSchedule, setRootEnabled, setSafeMode,
  }), [
    storageStats, isLoadingStats, isStatsError, mediaBreakdown, richScanData, scanTruncated,
    snapshots, history, totalBytesFreed, scheduleSettings, rootEnabled, safeMode,
    journal, refreshStats, scanMediaLibrary, addScanSnapshot,
    addHistoryItem, addJournalEntry, updateSchedule, setRootEnabled, setSafeMode,
  ]);

  return (
    <CleanerContext.Provider value={contextValue}>
      {children}
    </CleanerContext.Provider>
  );
}

export function useCleaner() {
  const ctx = useContext(CleanerContext);
  if (!ctx) throw new Error('useCleaner must be used within CleanerProvider');
  return ctx;
}
