---
name: CleanDroid Stability & Play Store Pass
description: What was hardened, what was cleaned up for Play Store, and what remains outstanding.
---

## Error Hardening (done)
All 4 tool screens (junk-cleaner, large-files, duplicate-finder, screenshot-manager) now have:
- Outer try/catch wrapping the entire startScan/loadScreenshots body
- `'error'` phase + `scanError` state
- Terminal-style [SCAN FAILED] panel with `>> TRY AGAIN` button that resets to idle
- Per-tool accent colour on the error panel (teal/amber/green/green)
Inner per-operation catches remain unchanged.

## Context Performance (done)
CleanerContext value wrapped in `useMemo` with full dependency array — prevents unnecessary re-renders across all tabs when unrelated state changes.

## app.json Permission Cleanup (done)
Removed: READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, READ_MEDIA_AUDIO, RECEIVE_BOOT_COMPLETED (all unused).
Kept: READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, VIBRATE.
Added: versionCode: 1.
Fixed: notification colour was #7B6EFA (purple), now #00E5CC (brand teal).
Fixed: expo-router origin was hardcoded to https://replit.com/ (dev artifact), removed.
Fixed: splash backgroundColor was #0B0B18, now #080808 (matches app background).
Improved: expo-media-library permission strings are now user-facing and Play-Policy-compliant.

## Settings Screen (done)
- Live version display using Constants.expoConfig?.version + versionCode
- Privacy Policy row (opens PRIVACY_POLICY_URL — placeholder, needs real URL before submission)
- Send Feedback row (opens mailto: FEEDBACK_EMAIL — placeholder, needs real address)
- Both URLs defined as named constants at top of file for easy update

## Schedule Screen Copy (done)
"DAEMON HANDLES IT — ZERO MAINTENANCE" → "CONFIGURE YOUR AUTO-CLEAN SCHEDULE"
"[DAEMON STATUS]" → "[CLEAN SCHEDULE]"
"DAEMON OFFLINE" → "SCHEDULE DISABLED"
"RUNS DAILY/WEEKLY" → "REMINDER: DAILY/WEEKLY"
**Why:** Background task (expo-background-fetch) is installed but not registered. Previous copy implied autonomous cleaning was happening, which was false. New copy is honest about it being a schedule preference.

## App Cache Honesty (done)
BASE_APPS list (12 hardcoded entries) now shows:
- Section label changed to "COMMON APPS — ESTIMATED SIZES"
- Disclaimer box added explaining Android doesn't expose per-app cache sizes to third-party apps
- All size values prefixed with ~ to indicate estimation
**Why:** Android API restriction — UsageStatsManager requires PACKAGE_USAGE_STATS which needs Settings permission grant, not a normal runtime permission. Smart Sweep (Step 2) opens actual Android Settings pages where real sizes appear.

## Accessibility Baseline (done)
All 6 tool screen back buttons: accessibilityLabel="Go back" accessibilityRole="button"
3 main scan action buttons: accessibilityLabel + accessibilityRole="button"

## Engineering Audit Pass (done this session)
- Created `utils/sleep.ts` — centralises `await new Promise(r => setTimeout(r, ms))` pattern; all 5 tool screens now import it
- Removed 10 unused packages: expo-background-fetch, expo-task-manager, expo-crypto, zod-validation-error, expo-blur, expo-linear-gradient, expo-image-picker, expo-location, @stardazed/streams-text-encoding, @ungap/structured-clone
- `estimateAudioSize` made unexported (internal to CleanerContext) — was a dead export
- `_ScanJournalEntryUsed` dummy type removed; `ScanJournalEntry` import changed to `import type`
- `SegBar` and `TerminalLog` wrapped in `React.memo`
- Schedule screen: Coming Soon banner added (`[!] BACKGROUND EXECUTION: V1.1`); toggle shows "PREFERENCES SAVED" / "CONFIGURED: WEEKLY" to be honest about current state
- Created `README.md` — external docs with FAQ answers for "why are sizes estimated?" and "why can't you clean app caches?"
- Created `CLEANDROID_PRINCIPLES.md` — 8 product principles; north star for all future decisions

## Outstanding (not yet done)
- Background task registration (expo-background-fetch + expo-task-manager installed, task not registered)
- Real app icon (all densities + adaptive icon for Android)
- Privacy Policy URL + Feedback email (placeholders in settings.tsx constants)
- Full accessibility pass (only back buttons + scan buttons done; list items, toggle, etc. remain)
- FlatList for large item lists (currently ScrollView+map — can lag with 200+ items)
- Play Store listing assets (screenshots, feature graphic, store description)
- AdMob integration
- Onboarding / first-run flow
