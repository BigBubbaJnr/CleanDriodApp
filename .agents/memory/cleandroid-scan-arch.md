---
name: CleanDroid scan architecture
description: All scans use real APIs; MediaLibrary/FileSystem only; no fake data; sizes estimated from dimensions/duration. Snapshot/trend system details.
---

## Core rule
No fake data, no Math.random(). Every scan uses real Expo APIs.

## Size estimation labels
- Images: `width × height × 0.2` bytes, labelled `~`
- Videos: `duration × 4Mbps/8`, labelled `~`
- Audio: `duration × 128kbps/8`, labelled `~`
- Real file sizes: `FileSystem.getInfoAsync(uri, { size: true } as any)` — requires `as any` because legacy types omit the `size` option

## Snapshot / trend system
- `ScanSnapshot` interface + `snapshots: ScanSnapshot[]` in context, persisted to AsyncStorage key `cleandroid_snapshots`
- `addScanSnapshot(Omit<ScanSnapshot, 'id'>)` generates an ID internally
- `storage-intel.tsx` calls `addScanSnapshot` after every `scanMediaLibrary` completes
- `snapshots[0]` = most recent, `snapshots[1]` = previous — used for delta display
- Schedule tab reads `history` (CleanHistoryItem[]) for per-session log, weekly trend, per-type breakdown

## MediaLibrary pagination limits
- Duplicate finder: cap at 5000 photos
- Junk cleaner: cap at 3000 downloads
- Screenshot manager: cap at 5000
- Show `[!] partial scan` log line when cap is hit

## Deletion tracking
Bytes accumulated in a separate counter; only added to history if `deleteAsync`/`deleteAssetsAsync` actually succeeds (try/catch).

## Outstanding TODOs
- App Cache list is still hardcoded (12 fake entries) — native module needed to enumerate installed apps
- Background task UI exists but no task is registered (`expo-background-fetch` + `expo-task-manager` installed)
- AdMob not started

**Why:** Trustworthiness is the #1 priority per user + ChatGPT design review. Fabricated numbers undermine the app's entire value proposition.
