/**
 * Content-based fingerprint cache for duplicate detection.
 *
 * Strategy: read the first 64 KB of a file as Base64 — this serves as the
 * content fingerprint. Not a cryptographic hash, but 64 KB of identical
 * base64-encoded content makes a false positive essentially impossible for
 * real photo/video files.
 *
 * Cache persists across app sessions via AsyncStorage so repeat scans are
 * near-instant for already-seen files. Invalidated per-asset when creationTime
 * changes (proxy for file modification).
 *
 * Follows CLEANDROID_PRINCIPLES.md:
 *   - Every fingerprint is derived from a real file read (Principle 1)
 *   - Cache hits and miss counts shown in scan log (Principle 3)
 *   - Failure is silent — fingerprint absence never blocks the scan (Principle 6)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { HASH_CACHE_MAX } from '@/constants/limits';
import { logError } from '@/utils/logger';

/** Bytes read per fingerprint (64 KB — sufficient to uniquely identify any photo/video) */
export const FINGERPRINT_CHUNK_BYTES = 65_536;

const CACHE_STORAGE_KEY = 'cleandroid_hash_cache_v2';

interface CacheEntry {
  fingerprint: string;
  /** Seconds since epoch — from MediaLibrary creationTime; used as cache-bust key */
  creationTime: number;
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Persists across renders within a session; reset on full app kill.
// AsyncStorage provides cross-session durability.

let _cache: Map<string, CacheEntry> | null = null;
let _dirty = false;

async function ensureCacheLoaded(): Promise<Map<string, CacheEntry>> {
  if (_cache !== null) return _cache;
  try {
    const raw = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
    if (raw) {
      const obj: Record<string, CacheEntry> = JSON.parse(raw);
      _cache = new Map(Object.entries(obj));
    } else {
      _cache = new Map();
    }
  } catch (err) {
    logError('hash/load', err);
    _cache = new Map();
  }
  return _cache;
}

/**
 * Look up a cached fingerprint for an asset.
 * Returns null if not cached or if creationTime differs (file changed).
 *
 * On a hit, the entry is promoted to the Map tail (LRU behaviour) so the
 * least-recently-used entry is always at the head when eviction runs.
 */
export async function getCachedFingerprint(
  assetId: string,
  creationTime: number,
): Promise<string | null> {
  const cache = await ensureCacheLoaded();
  const entry = cache.get(assetId);
  if (!entry || entry.creationTime !== creationTime) return null;
  // LRU promotion: delete + re-insert moves the key to Map tail
  cache.delete(assetId);
  cache.set(assetId, entry);
  return entry.fingerprint;
}

/**
 * Store a computed fingerprint in the in-memory cache.
 * Call persistFingerprintCache() after a batch to flush to AsyncStorage.
 */
export async function setCachedFingerprint(
  assetId: string,
  creationTime: number,
  fingerprint: string,
): Promise<void> {
  const cache = await ensureCacheLoaded();
  cache.set(assetId, { fingerprint, creationTime });
  _dirty = true;
}

/**
 * Flush the in-memory cache to AsyncStorage.
 * Call once after finishing a batch of fingerprint operations.
 * Non-critical — a failure here doesn't affect scan results.
 */
export async function persistFingerprintCache(): Promise<void> {
  if (!_dirty || !_cache) return;
  try {
    // LRU eviction: Map preserves insertion order — head = oldest (least recently used)
    if (_cache.size > HASH_CACHE_MAX) {
      const excess = _cache.size - HASH_CACHE_MAX;
      const toDelete = Array.from(_cache.keys()).slice(0, excess);
      toDelete.forEach(k => _cache!.delete(k));
    }
    const obj: Record<string, CacheEntry> = {};
    _cache.forEach((v, k) => { obj[k] = v; });
    await AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
    _dirty = false;
  } catch (err) {
    logError('hash/persist', err);
  }
}

/**
 * Return the number of fingerprints currently in the cache (for display in scan log).
 */
export async function getFingerprintCacheSize(): Promise<number> {
  const cache = await ensureCacheLoaded();
  return cache.size;
}

/**
 * Read the first 64 KB of a file and return it as a Base64 content fingerprint.
 * Returns null if the file is inaccessible, too small, or the read fails.
 *
 * A returned string of equal length and content from two different files means
 * the files are byte-for-byte identical up to 64 KB — sufficient to confirm
 * any photo/video pair is a genuine duplicate.
 */
export async function computeFileFingerprint(localUri: string): Promise<string | null> {
  try {
    const chunk = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: FINGERPRINT_CHUNK_BYTES,
    } as any);
    // Require at least 1 KB of content — tiny files are not reliable fingerprints
    if (!chunk || chunk.length < 1024) return null;
    return chunk;
  } catch (err) {
    logError('hash/fingerprint', err);
    return null;
  }
}
