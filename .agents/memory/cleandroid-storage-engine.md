---
name: CleanDroid Storage Intelligence Engine
description: Unified scan architecture — scan once, power all tool screens. Key types, cache contract, and new screens.
---

## What was built

`scanMediaLibrary()` in `CleanerContext.tsx` now builds `RichScanData` after its normal scan:
- Detects source apps (Camera, WhatsApp, Telegram, Instagram, etc.) from MediaLibrary album membership
- Builds `RichAsset[]` (all scanned assets annotated with `sourceApp`, `isScreenshot`, `isDownload`)
- Builds `SmartCategory[]` (grouped by sourceApp, sorted by estimatedSize)
- Stored as `richScanData: RichScanData | null` in context (NOT persisted to AsyncStorage — rebuilt on each scan)

## Key types (all exported from CleanerContext.tsx)

- `SourceApp` — union of 14 values: `'camera' | 'whatsapp' | 'telegram' | 'instagram' | 'snapchat' | 'tiktok' | 'twitter' | 'facebook' | 'signal' | 'discord' | 'screen_recording' | 'screenshots' | 'downloads' | 'other'`
- `SOURCE_APP_META` — label + Feather icon name for each SourceApp
- `RichAsset` — single media asset with `sourceApp`, `isScreenshot`, `isDownload`, `estimatedSize`, all dimensions
- `SmartCategory` — aggregated per sourceApp: `count`, `estimatedSize`, `label`, `icon`
- `RichScanData` — `{ timestamp, assets: RichAsset[], totalAssetCount, smartCategories }`

## Cache contract for tool screens

30-minute TTL. Check pattern (both large-files.tsx and screenshot-manager.tsx):
```typescript
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
if (richScanData && richScanData.timestamp) {
  const cacheAge = Date.now() - new Date(richScanData.timestamp).getTime();
  if (cacheAge < CACHE_MAX_AGE_MS) { /* derive from cache, return early */ }
}
// Fall through to full MediaLibrary scan
```

Place AFTER permission check (always request permissions before using any cache).

## New screens

- `app/storage-tree.tsx` — WinDirStat-style storage map. Shows `richScanData.smartCategories` as proportional SegBars with tap-to-navigate. Falls back to basic `mediaBreakdown` breakdown if no rich scan yet. Card registered in `clean.tsx` as "Storage Map" in STORAGE ANALYSIS section.

## storage-intel.tsx additions

- Added `richScanData` to `useCleaner()` destructure
- Added `[SMART CATEGORIES]` section rendered between Media Breakdown and Folder Intelligence when `richScanData.smartCategories.length > 0`

## Why this matters

**Why:** Every tool screen previously ran its own independent MediaLibrary scan. ChatGPT's architectural review identified this as the primary deficiency. The engine scans once and all views are derived from shared data.

**How to apply:** When adding a new analysis screen, always check `richScanData` first. Only fall through to a fresh MediaLibrary scan if the cache is stale or missing. Never re-implement the source-app detection logic — use `richScanData.assets[].sourceApp`.
