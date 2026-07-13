---
name: CleanDroid Safe Delete Trust Pass
description: SafeDelete + ConfirmDeleteSheet wired across all 4 cleaners; safeMode in context; settings overhaul
---

## What was done

### Context (CleanerContext.tsx)
- Added `safeMode: boolean` + `setSafeMode(enabled) => Promise<void>` to context and interface.
- AsyncStorage key: `cleandroid_safe_mode`. Default: `__DEV__` (true in dev builds, false in release).
- Persisted value is only applied if the key already exists (null check), so fresh installs get the `__DEV__` default.

### Settings (app/(tabs)/settings.tsx)
- Fully rewritten (the old version had a lot of stale patterns).
- **DEVELOPER SETTINGS** section: Safe Mode toggle with Alert confirmation when disabling (`handleSafeModeToggle`).
- **ADVANCED** section: Root Mode replaced with disabled row + "COMING SOON — REQUIRES ROOTED DEVICE" label.
- **Diagnostic log**: now reads `entry.ts` (not `entry.timestamp`), renders `entry.level` with color-coded `levelBadge` using `LEVEL_COLORS` map (DEBUG=#888, INFO=green, WARN=orange, ERROR=red).
- System Report includes `SAFE_MODE` readout row.
- `colors.warning` used for Safe Mode UI — confirm it exists in the theme.

### SafeDelete wiring — all 4 cleaners
Each cleaner now follows this pattern:
1. Footer button → `setShowConfirm(true)` (NOT calling handleClean/handleDelete directly).
2. `handleClean`/`handleDelete` → `setShowConfirm(false)` first, then `safeDelete({items, category, safeMode})`.
3. `<ConfirmDeleteSheet>` added to JSX with `visible={showConfirm}`, `safeMode`, `onCancel`, `onConfirm`.

**Junk Cleaner special case:** Own-cache items (isOwnCache) bypass SafeDelete and use FileSystem.deleteAsync directly (it's CleanDroid's own cache directory, not user data). Only MediaLibrary assetId items go through SafeDelete.

**Screenshot Manager:** Added `permissionDenied` state. When permission denied → `setPermissionDenied(true); setPhase('results')`. A styled panel is shown in the results section when `permissionDenied` is true (same visual style as duplicate-finder/large-files panels).

### Logging
All 4 cleaners now call `logInfo`/`logWarn` at scan start, permission grant, deletion start, deletion complete.

## Key rules to preserve
- `safeMode` defaults `__DEV__` — never hardcode false.
- Disabling Safe Mode requires an Alert confirmation (see `handleSafeModeToggle` in settings.tsx).
- Own-cache (junk-cleaner) is safe to delete directly — it's CleanDroid's own FileSystem.cacheDirectory.
- `ConfirmDeleteSheet` is a Modal — keep it at the bottom of the container's JSX (sibling to ScrollView/footer, inside the outer View).
