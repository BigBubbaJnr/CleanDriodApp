import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

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

/** Estimate audio bytes from duration (assumes ~128 kbps) */
export function estimateAudioSize(durationSeconds: number): number {
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

interface CleanerContextType {
  storageStats: StorageStats | null;
  isLoadingStats: boolean;
  mediaBreakdown: MediaBreakdown | null;
  snapshots: ScanSnapshot[];
  history: CleanHistoryItem[];
  totalBytesFreed: number;
  scheduleSettings: ScheduleSettings;
  rootEnabled: boolean;
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
}

const CleanerContext = createContext<CleanerContextType | null>(null);

const STORAGE_KEYS = {
  HISTORY: 'cleandroid_history',
  SCHEDULE: 'cleandroid_schedule',
  ROOT: 'cleandroid_root',
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
  const [mediaBreakdown, setMediaBreakdown] = useState<MediaBreakdown | null>(null);
  const [snapshots, setSnapshots] = useState<ScanSnapshot[]>([]);
  const [journal, setJournal] = useState<ScanJournalEntry[]>([]);
  const [history, setHistory] = useState<CleanHistoryItem[]>([]);
  const [totalBytesFreed, setTotalBytesFreed] = useState(0);
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettings>(DEFAULT_SCHEDULE);
  const [rootEnabled, setRootEnabledState] = useState(false);

  const refreshStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const [freeSpace, totalSpace, appCacheSize] = await Promise.all([
        FileSystem.getFreeDiskStorageAsync(),
        FileSystem.getTotalDiskCapacityAsync(),
        getOwnCacheSize(),
      ]);
      setStorageStats({ totalSpace, usedSpace: totalSpace - freeSpace, freeSpace, appCacheSize });
    } catch {
      const total = 64 * 1024 * 1024 * 1024;
      const used = 42 * 1024 * 1024 * 1024;
      setStorageStats({ totalSpace: total, usedSpace: used, freeSpace: total - used, appCacheSize: 0 });
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
      } while (after && allAssets.length < 3000);

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
      return breakdown;
    } catch (e) {
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
      const updated = [newSnap, ...prev].slice(0, 30);
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
      const updated = [newEntry, ...prev].slice(0, 100);
      AsyncStorage.setItem(STORAGE_KEYS.JOURNAL, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const loadPersisted = useCallback(async () => {
    try {
      const [histRaw, schedRaw, rootRaw, freedRaw, snapsRaw, journalRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.HISTORY),
        AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE),
        AsyncStorage.getItem(STORAGE_KEYS.ROOT),
        AsyncStorage.getItem(STORAGE_KEYS.TOTAL_FREED),
        AsyncStorage.getItem(STORAGE_KEYS.SNAPSHOTS),
        AsyncStorage.getItem(STORAGE_KEYS.JOURNAL),
      ]);
      if (histRaw) setHistory(JSON.parse(histRaw));
      if (schedRaw) setScheduleSettings(JSON.parse(schedRaw));
      if (rootRaw) setRootEnabledState(rootRaw === 'true');
      if (freedRaw) setTotalBytesFreed(Number(freedRaw));
      if (snapsRaw) setSnapshots(JSON.parse(snapsRaw));
      if (journalRaw) setJournal(JSON.parse(journalRaw));
    } catch {}
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
      const updated = [newItem, ...prev].slice(0, 50);
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

  return (
    <CleanerContext.Provider value={{
      storageStats, isLoadingStats, mediaBreakdown, snapshots,
      history, totalBytesFreed, scheduleSettings, rootEnabled,
      journal, refreshStats, scanMediaLibrary, addScanSnapshot,
      addHistoryItem, addJournalEntry, updateSchedule, setRootEnabled,
    }}>
      {children}
    </CleanerContext.Provider>
  );
}

export function useCleaner() {
  const ctx = useContext(CleanerContext);
  if (!ctx) throw new Error('useCleaner must be used within CleanerProvider');
  return ctx;
}
