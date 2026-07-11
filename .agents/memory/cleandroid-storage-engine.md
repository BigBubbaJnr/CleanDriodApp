---
name: CleanDroid Storage Intelligence Engine
description: Unified scan architecture — scan once, power all tool screens. Key types, cache contract, competitive improvements, and new screens.
---

## What was built

`scanMediaLibrary()` in `CleanerContext.tsx` builds `RichScanData` after its normal scan:
- Detects source apps from MediaLibrary album membership
- Builds `RichAsset[]` (all scanned assets annotated with `sourceApp`, `isScreenshot`, `isDownload`, `modificationTime`)
- Builds `SmartCategory[]` (grouped by sourceApp, sorted by estimatedSize)
- Stored as `richScanData: RichScanData | null` in context (NOT persisted — rebuilt on each scan)

## Key types (all exported from CleanerContext.tsx)

- `SourceApp` — union of 14 values
- `SOURCE_APP_META` — label + Feather icon per SourceApp
- `RichAsset` — single media asset with `sourceApp`, `isScreenshot`, `isDownload`, `estimatedSize`, `modificationTime`, all dimensions
- `SmartCategory` — aggregated per sourceApp: `count`, `estimatedSize`, `label`, `icon`
- `RichScanData` — `{ timestamp, assets: RichAsset[], totalAssetCount, smartCategories }`

## Content fingerprint cache (utils/hash.ts)

All hash/fingerprint logic lives in `utils/hash.ts`. Key exports:
- `computeFileFingerprint(localUri)` — reads first 64 KB as Base64; returns null on failure
- `getCachedFingerprint(assetId, creationTime)` — looks up AsyncStorage cache; null if missing/stale
- `setCachedFingerprint(assetId, creationTime, fingerprint)` — writes to in-memory cache
- `persistFingerprintCache()` — flushes in-memory → AsyncStorage (call after each batch)
- `getFingerprintCacheSize()` — returns count for display in scan log

Cache key: `cleandroid_hash_cache_v2`. Max 2000 entries, LRU eviction. Invalidated per-asset when `creationTime` changes.

**Why:** SD Maid SE maintains a persistent hash database for instant repeat scans. Our fingerprint cache achieves the same — first scan reads files, all subsequent scans reuse cached fingerprints.

## duplicate-finder.tsx architecture (post-competitive-review)

- **Group limit:** 50 (was 20) — better coverage for large libraries
- **Phase 5.5:** Fingerprint verification now applies to ALL group types (filename, burst, dimension_date), not just dimension_date. Checks first 25 groups.
- **Favourites protection:** For each group, calls `getAssetInfoAsync` on keep + selected assets. If any selected asset has `isFavorite: true`, it's silently removed from `selectedIndexes` and `group.hasFavorite = true`.
- **Badge logic:** Verified groups of any type show `✓` suffix (FILENAME ✓, BURST ✓, HASH VERIFIED). hasFavorite groups show amber `★` in groupMeta.
- **Cache hits logged** in scan log for transparency.

## storage-intel.tsx improvements (post-competitive-review)

### buildAdvisorCards — P2.5 Source Concentration Card
New `richScanData: RichScanData | null` 5th parameter. Adds P2.5 card when:
- `richScanData.smartCategories[0]` share > 35% of total AND > 200 MB
- Routes to: screenshots→`/screenshot-manager`, downloads→`/junk-cleaner`, whatsapp→`/duplicate-finder`, others→`/large-files`

### Folder Intelligence (AlbumIntelRow)
- Sample: 12 assets (was 4), sorted DESC (most recent first)
- New fields: `newestAssetDate?: number`, `isStale?: boolean`
- `isStale`: newest sampled asset older than 180 days
- UI: shows ACTIVE (green) or STALE (muted) badge next to item count
- Shows "latest: X AGO" instead of "oldest: X AGO"
- Albums shown: 12 (was 8)

## 30-minute cache contract for tool screens

Check pattern (both large-files.tsx and screenshot-manager.tsx):
```typescript
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
if (richScanData && richScanData.timestamp) {
  const cacheAge = Date.now() - new Date(richScanData.timestamp).getTime();
  if (cacheAge < CACHE_MAX_AGE_MS) { /* derive from cache, return early */ }
}
// Fall through to full MediaLibrary scan
```

**Why:** Every tool screen previously ran its own independent scan. The engine scans once and all views derive from shared data.

**How to apply:** When adding a new analysis screen, always check `richScanData` first. Never re-implement source-app detection — use `richScanData.assets[].sourceApp`.

## Screens

- `app/storage-tree.tsx` — WinDirStat-style storage map. Tap rows navigate to relevant cleaner.
- `app/(tabs)/clean.tsx` — "Storage Map" card in STORAGE ANALYSIS section → `/storage-tree`
