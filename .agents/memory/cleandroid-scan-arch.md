---
name: CleanDroid real-scan architecture
description: How CleanDroid scans storage — what's real, what's estimated, and why.
---

## Rule
All scanning must use real Android APIs only. Never fabricate file lists or sizes.

**Why:** ChatGPT code review confirmed fake results (Math.random junkEstimate, hardcoded 10-item junk list) undermine user trust and mislead about device state.

## What's real
- `FileSystem.getInfoAsync(cacheDirectory, { size: true })` → real own-cache size in bytes
- `FileSystem.deleteAsync(cacheDirectory)` → real deletion
- `MediaLibrary.getAssetsAsync()` → real filenames, dimensions, duration, creation time
- `MediaLibrary.deleteAssetsAsync(ids)` → real deletion
- `MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })` → finds "Screenshots", "Downloads" albums

## What's estimated (label clearly with ~)
- Image byte size: `width * height * 0.2` (JPEG ~20:1 compression estimate)
- Video byte size: `duration * 4_000_000 / 8` (4 Mbps average mobile bitrate estimate)
- Screenshot size: `width * height * 0.4` (PNG less compression)
- All size labels prefixed with `~` in UI, plus a transparency note

## Key constraints
- Modern Android (API 30+) blocks arbitrary filesystem access — cannot scan /sdcard/Download for APKs
- File sizes not available from MediaLibrary without getAssetInfoAsync per-asset (too slow for bulk)
- Always paginate MediaLibrary reads with endCursor; cap at safe limit with a "[!] partial scan" log

## De-duplication rule
An asset in the Downloads album AND matching the large_video filter appears in BOTH scan passes.
Always deduplicate by assetId before setting scan results state.

## History recording rule
Only call addHistoryItem (and setBytesFreed) after deletion actually succeeds — wrap in try/catch
and accumulate bytesActuallyFreed separately.

## Downloads double-count in Storage Intelligence
The `downloads` bucket in MediaBreakdown is a subset of `images` + `videos`, not additive.
Label it `DOWNLOADS*` and include a footnote in the transparency note box.

## How to apply
Apply to: junk-cleaner.tsx, screenshot-manager.tsx, storage-intel.tsx, CleanerContext.tsx
Any future scan feature must follow the same real-API-only pattern.
