/**
 * CleanDroid — canonical scan caps and collection bounds.
 *
 * All magic numbers for scan limits, collection sizes, and concurrency caps
 * live here. Change a value once and it propagates everywhere.
 */

/** Max assets fetched in the global media scan (CleanerContext / Storage Intel) */
export const SCAN_CAP_GLOBAL   = 3_000;

/** Max assets fetched in individual tool-screen scans (Large Files, Duplicate Finder, Screenshot Manager) */
export const SCAN_CAP_TOOL     = 5_000;

/** Max ScanJournalEntry records persisted */
export const JOURNAL_MAX       = 100;

/** Max CleanHistoryItem records persisted */
export const HISTORY_MAX       = 50;

/** Max ScanSnapshot records persisted */
export const SNAPSHOT_MAX      = 30;

/** Max fingerprint entries kept in the LRU cache (hash.ts) */
export const HASH_CACHE_MAX    = 2_000;

/**
 * Max concurrent async operations in tool-screen Promise batches.
 * Keeps I/O load manageable on low-RAM Android devices (≥512 MB).
 */
export const POOL_CONCURRENCY  = 6;

/** AsyncStorage key for schema versioning — bump when any persisted shape changes */
export const SCHEMA_VERSION_KEY = 'cleandroid_schema_v';

/** Current schema version — increment whenever a persisted key's shape changes */
export const SCHEMA_VERSION     = 1;
