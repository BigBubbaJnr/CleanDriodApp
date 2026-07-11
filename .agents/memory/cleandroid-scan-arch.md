---
name: CleanDroid scan architecture
description: All scans use real APIs; MediaLibrary/FileSystem only; no fake data; sizes estimated from dimensions/duration. Shared utilities, snapshot/trend system, trust decisions, and voice/identity conventions.
---

## Core rule
No fake data, no Math.random(). Every scan uses real Expo APIs.

## Shared utilities (single source of truth — always import, never redefine locally)
- `utils/format.ts` — `formatBytes`, `formatDelta`, `formatRelativeDate`, `formatAbsoluteDate`, `formatDateShort`, `getAgeText`, `daysAgoLabel`
- `components/SegBar.tsx` — retro pixel-block progress bar (props: `value`, `color`, `total?`, `height?`)
- `components/TerminalLog.tsx` — auto-scrolling log box (props: `lines`, `maxHeight?`)
- `hooks/useBevel.ts` — `useBevel()` returns asymmetric bevel border object; `useBevelPressed()` for active buttons

## Device Health (home screen)
- Home screen shows a DEVICE STATUS card derived entirely from real device data — no invented percentages
- Health tiers: OPTIMAL / HEALTHY / MODERATE / CRITICAL / UNKNOWN (computed by pure functions in index.tsx)
- STORAGE and CACHE derived from `storageStats` (always available after load)
- SCREENSHOTS and DOWNLOADS derived from `mediaBreakdown` (only after a Storage Intelligence scan; show [?] / UNSCAN'D until then)
- `worstTier()` aggregates all known tiers (excludes UNKNOWN from worst calculation)
- Overall delta (`storageDelta`) shown from `snapshots[0].usedSpace - snapshots[1].usedSpace`
- Footer CTA: tap → `/storage-intel` for recommendations or full analysis

## Voice / copy conventions (terminal identity — NEVER revert to generic copy)
- Completion: `[OK] PURGE COMPLETE` / `[OK] SWEEP COMPLETE` / `[OK] AUTO-CLEAR: COMPLETE`
- Empty/clean states: `SYSTEM STATUS: CLEAN — no X detected` / `SYSTEM STATUS: OPTIMAL`
- Awaiting scan: `AWAITING SCAN` / `AWAITING FIRST SCAN`
- Scan log messages: ALL CAPS (e.g., `REQUESTING MEDIA ACCESS...` not `requesting media access...`)
- Buttons: `>> INITIATE SCAN`, `>> RE-SCAN`, `>> PURGE SELECTED`, `>> PURGE DUPLICATES`
- Freed bytes label: `RECLAIMED` (not "FREED FROM DEVICE" or "FREED UP")
- Zero bytes in history: show `—` not `+0 B`
- Weekly trend: `WEEK-ON-WEEK: UP/DOWN/STABLE — <context>`
- Device status header: `DAEMON HANDLES IT — ZERO MAINTENANCE`

## Size estimation labels
- Images: `width × height × 0.2` bytes, labelled `~`
- Videos: `duration × 4Mbps/8`, labelled `~`
- Audio: `duration × 128kbps/8`, labelled `~`
- Real file sizes: `FileSystem.getInfoAsync(uri, { size: true } as any)` — requires `as any` (legacy types omit `size`)

## Snapshot / trend system
- `ScanSnapshot` interface + `snapshots: ScanSnapshot[]` in context, persisted to AsyncStorage key `cleandroid_snapshots`
- `snapshots[0]` = most recent, `snapshots[1]` = previous — used for delta display on home screen
- `storage-intel.tsx` calls `addScanSnapshot` after every `scanMediaLibrary` completes

## MediaLibrary pagination limits
- Duplicate finder: cap at 5000 photos
- Junk cleaner: cap at 3000 downloads
- Screenshot manager: cap at 5000
- Show `[!] partial scan` log line when cap is hit

## Trust decisions (do not revert)
- App Cache Smart Sweep records 0 bytes freed — Android doesn't expose actual cleared amount
- handleAutoClear records only real bytes from `FileSystem.getInfoAsync`, no fake additions
- App cache list sizes (`BASE_APPS.cacheSize`) used for ordering only — not displayed to users
- All recommendation strings must explain *why*: include size, age, and reason the file is safe/unsafe to delete
- Activity log: show `—` for items with `bytesFreed === 0` (Smart Sweep operations)

## Recommendation string convention (ChatGPT 4-question framework)
Every recommendation answers: Why? / How much? / How old? / How safe?
- BAD: "Review old recordings"
- GOOD: "380 MB — over a year old; almost certainly safe to remove or archive to cloud"
- GOOD: "screenshots accumulate silently; Screenshot Manager clears them in one step"

## Outstanding TODOs
- App Cache list is hardcoded (12 fake entries) — native module needed to enumerate installed apps
- Background task UI exists but no task registered (`expo-background-fetch` + `expo-task-manager` installed)
- AdMob not started
- Context split (StorageContext / RecommendationContext / ScanContext / SettingsContext) — defer to v2

**Why trust matters:** Trustworthiness is the #1 priority. Fabricated numbers undermine the entire value proposition.
