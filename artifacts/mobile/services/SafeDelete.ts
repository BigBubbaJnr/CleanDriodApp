/**
 * SafeDelete — the single deletion gateway for CleanDroid.
 *
 * Every delete operation in the entire app must route through here.
 * Responsibilities:
 *   1. Validate each item still exists before attempting deletion
 *   2. Perform the deletion (MediaLibrary or FileSystem)
 *   3. Simulate in Safe Mode (no real files touched)
 *   4. Log every outcome at the appropriate level
 *   5. Return a structured result for post-clean reporting
 *
 * Never throws — all errors are caught, logged, and counted.
 */
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { logInfo, logWarn, logError, logDebug } from '@/utils/logger';

const TAG = 'SafeDelete';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SafeDeleteItem {
  /** Human-readable filename for logging */
  name: string;
  /** Estimated or measured size in bytes */
  estimatedBytes: number;
  /** MediaLibrary asset ID — set for media items */
  assetId?: string;
  /** FileSystem absolute path — set for cache / APK items */
  filePath?: string;
}

export interface SafeDeleteRequest {
  items: SafeDeleteItem[];
  /** Human-readable category for logging and reporting (e.g. "Duplicate Photos") */
  category: string;
  /** When true: simulate only — no real files are touched */
  safeMode: boolean;
}

export interface SafeDeleteResult {
  category: string;
  /** Number of items successfully deleted (or simulated) */
  deleted: number;
  /** Items skipped because they failed validation */
  skipped: number;
  /** Items where the delete call itself threw an error */
  failed: number;
  /** Total bytes freed (sum of estimatedBytes for deleted items) */
  bytesFreed: number;
  /** Whether this was a Safe Mode simulation */
  safeMode: boolean;
  /** Human-readable error snippets (max 10) */
  errors: string[];
  /** Duration of the entire operation in ms */
  durationMs: number;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Returns true if the MediaLibrary asset still exists and is accessible.
 * We do a lightweight check rather than a full getAssetInfoAsync call.
 */
async function validateMediaAsset(assetId: string): Promise<boolean> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    return !!info && !!info.uri;
  } catch {
    return false;
  }
}

/**
 * Returns true if the FileSystem path exists and is a real file.
 */
async function validateFilePath(filePath: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists && !info.isDirectory;
  } catch {
    return false;
  }
}

// ── Core service ──────────────────────────────────────────────────────────────

export async function safeDelete(request: SafeDeleteRequest): Promise<SafeDeleteResult> {
  const { items, category, safeMode } = request;
  const startMs = Date.now();

  const result: SafeDeleteResult = {
    category,
    deleted: 0,
    skipped: 0,
    failed: 0,
    bytesFreed: 0,
    safeMode,
    errors: [],
    durationMs: 0,
  };

  if (safeMode) {
    logInfo(TAG, `[SAFE MODE] Simulating deletion of ${items.length} item(s) in category "${category}"`);
  } else {
    logInfo(TAG, `Starting deletion of ${items.length} item(s) in category "${category}"`);
  }

  // Separate media assets from file-system paths
  const mediaItems = items.filter(i => i.assetId);
  const fsItems = items.filter(i => !i.assetId && i.filePath);

  // ── MediaLibrary items ──────────────────────────────────────────────────────
  if (mediaItems.length > 0) {
    // Validate all media assets in parallel (cap concurrency to avoid OOM)
    const VALIDATE_BATCH = 20;
    const validAssetIds: string[] = [];
    const validAssetBytes: number[] = [];

    for (let i = 0; i < mediaItems.length; i += VALIDATE_BATCH) {
      const batch = mediaItems.slice(i, i + VALIDATE_BATCH);
      const checks = await Promise.all(
        batch.map(item => validateMediaAsset(item.assetId!))
      );
      for (let j = 0; j < batch.length; j++) {
        if (checks[j]) {
          validAssetIds.push(batch[j].assetId!);
          validAssetBytes.push(batch[j].estimatedBytes);
        } else {
          logWarn(TAG, `Skipping "${batch[j].name}" — asset no longer found in MediaLibrary`);
          result.skipped++;
        }
      }
    }

    logDebug(TAG, `Validated ${validAssetIds.length}/${mediaItems.length} media assets`);

    if (validAssetIds.length > 0) {
      if (safeMode) {
        logInfo(TAG, `[SAFE MODE] Would delete ${validAssetIds.length} media asset(s) — skipping`);
        result.deleted += validAssetIds.length;
        result.bytesFreed += validAssetBytes.reduce((a, b) => a + b, 0);
      } else {
        try {
          await MediaLibrary.deleteAssetsAsync(validAssetIds);
          result.deleted += validAssetIds.length;
          result.bytesFreed += validAssetBytes.reduce((a, b) => a + b, 0);
          logInfo(TAG, `Deleted ${validAssetIds.length} media asset(s)`);
        } catch (err) {
          // MediaLibrary batch failed — try items individually as fallback
          logWarn(TAG, `Batch delete failed, attempting one-by-one fallback`);
          for (let i = 0; i < validAssetIds.length; i++) {
            try {
              await MediaLibrary.deleteAssetsAsync([validAssetIds[i]]);
              result.deleted++;
              result.bytesFreed += validAssetBytes[i];
            } catch (itemErr) {
              const msg = itemErr instanceof Error ? itemErr.message : String(itemErr);
              logError(TAG, itemErr);
              result.failed++;
              if (result.errors.length < 10) result.errors.push(msg);
            }
          }
        }
      }
    }
  }

  // ── FileSystem items ────────────────────────────────────────────────────────
  for (const item of fsItems) {
    const path = item.filePath!;
    try {
      const exists = await validateFilePath(path);
      if (!exists) {
        logWarn(TAG, `Skipping "${item.name}" — path not found: ${path}`);
        result.skipped++;
        continue;
      }

      if (safeMode) {
        logInfo(TAG, `[SAFE MODE] Would delete "${item.name}" — skipping`);
        result.deleted++;
        result.bytesFreed += item.estimatedBytes;
      } else {
        await FileSystem.deleteAsync(path, { idempotent: true });
        result.deleted++;
        result.bytesFreed += item.estimatedBytes;
        logDebug(TAG, `Deleted file: "${item.name}"`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError(TAG, err);
      result.failed++;
      if (result.errors.length < 10) result.errors.push(`${item.name}: ${msg}`);
    }
  }

  result.durationMs = Date.now() - startMs;

  if (safeMode) {
    logInfo(TAG, `[SAFE MODE] Simulation complete — would have freed ${result.bytesFreed} bytes in ${result.durationMs}ms`);
  } else {
    logInfo(TAG, `Delete complete — freed ${result.bytesFreed} bytes, skipped ${result.skipped}, failed ${result.failed} in ${result.durationMs}ms`);
  }

  return result;
}
