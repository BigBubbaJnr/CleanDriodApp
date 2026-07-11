---
name: CleanDroid scan architecture
description: All scans use real APIs; MediaLibrary/FileSystem only; no fake data; sizes estimated from dimensions/duration. Shared utilities, snapshot/trend system, trust decisions, voice/identity conventions, and delight components.
---

## Core rule
No fake data, no Math.random(). Every scan uses real Expo APIs.

## Shared utilities (single source of truth — always import, never redefine locally)
- `utils/format.ts` — `formatBytes`, `formatDelta`, `formatRelativeDate`, `formatAbsoluteDate`, `formatDateShort`, `getAgeText`, `daysAgoLabel`
- `components/SegBar.tsx` — retro pixel-block progress bar (props: `value`, `color`, `total?`, `height?`)
- `components/TerminalLog.tsx` — auto-scrolling log box (props: `lines`, `maxHeight?`)
- `components/BlinkingCursor.tsx` — shared Reanimated cursor (props: `color`, `char?` default `_`, `fontSize?` default 26); hard-on/snap-off 860ms cycle; use `char='█'` for block cursor
- `hooks/useBevel.ts` — `useBevel()` returns asymmetric bevel border object; `useBevelPressed()` for active buttons

## Boot sequence (first-launch only)
- `components/BootScreen.tsx` — terminal boot overlay; 14 lines, ~5.2s total, fades out at end
- Wired in `app/_layout.tsx`: renders as absolute overlay on top of `<RootLayoutNav />`; checks AsyncStorage key `cleandroid_booted`; calls `handleBootDone` which sets key to `'1'` so sequence never replays
- `showBoot` state: `null` = checking, `true` = show, `false` = done/skip
- Boot overlay uses `pointerEvents="none"` — does not block touches under it
- On web: sequence still plays; `BootScreen` handles it fine

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

## Storage Advisor (storage-intel.tsx) — built
- `buildAdvisorCards(storageStats, mediaBreakdown, journal, snapshots)` returns `AdvisorCard[]`
- Cards: LOW_STORAGE (P1), LARGE_VIDEOS (P2), DUPLICATES (P3), SCREENSHOTS (P4), DOWNLOADS (P5), TREND (P6), APP_CACHE (P7)
- Each card: priority, icon, category, triggerSummary, recoveryBytes, safetyLevel (SAFE/REVIEW/MANUAL), explanation, androidNote?, actionRoute
- SafetyLevel drives badge colour: success=SAFE, warning=REVIEW, accent=MANUAL
- Recovery bytes are labeled `~` (estimated, never fabricated)
- `AdvisorCardUI` functional sub-component renders cards with header, stats row (RECOVERABLE/SAFETY/EVIDENCE), explanation, optional Android note, CTA button

## Folder Intelligence (storage-intel.tsx) — built
- After main scan, calls `MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false })`
- Samples 4 assets per top-15 album to estimate avg size, multiplies by assetCount
- Shows top 8 albums by estimated size in `[FOLDER INTELLIGENCE]` section with SegBar
- Album scan is best-effort; wrapped in try/catch; doesn't block main scan
- Stored in local state `albumBreakdown: AlbumIntelRow[]`, not in context

## Burst detection (duplicate-finder.tsx) — built
- Phase 3.5: sorts all photos by creationTime, groups sequences where consecutive gap ≤ 5 seconds
- Requires ≥ 3 photos to qualify as burst
- keepIndex = middle shot (sharpest); all others default-selected for deletion
- matchType: 'burst' — badge: purple #BB55FF
- Processed AFTER filename groups (lower priority) but BEFORE dim+date groups in Phase 4

## Partial hash verification (duplicate-finder.tsx) — built  
- Phase 5.5: for top 8 dimension_date groups, calls `getAssetInfoAsync` to get `localUri`
- Reads first 32 KB via `FileSystem.readAsStringAsync(localUri, { encoding: Base64, length: 32768 } as any)`
- If chunk strings match and length > 100 chars → sets `grp.hashVerified = true`
- Badge upgrades from 'DIM+DATE' (warning) to 'HASH VERIFIED' (success green)
- Best-effort; wrapped in try/catch per group

## Outstanding TODOs
- App Cache list is hardcoded (12 fake entries) — native module needed to enumerate installed apps
- Background task UI exists but no task registered (removed packages in earlier session; v1.1 feature)
- Animated scan bar (pixel blocks sweep during active scans) — not yet built
- AdMob not started
- Context split (StorageContext / RecommendationContext / ScanContext / SettingsContext) — defer to v2

**Why trust matters:** Trustworthiness is the #1 priority. Fabricated numbers undermine the entire value proposition.
