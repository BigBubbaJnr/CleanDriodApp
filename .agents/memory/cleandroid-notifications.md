---
name: CleanDroid notifications & permission UX
description: expo-notifications v57 integration details, permission type quirks, and the permission-denied UX pattern across scan screens.
---

## expo-notifications v57 type quirk

`requestPermissionsAsync()` and `getPermissionsAsync()` return `NotificationPermissionsStatus` which extends `PermissionResponse` from `expo`. In the mobile artifact's tsconfig resolution chain, the inherited `granted` and `canAskAgain` properties are not visible to TypeScript. Fix: cast the return value `as any` before reading those properties. Runtime behaviour is correct.

**Why:** The mobile artifact's `expo@54` resolves `PermissionResponse` from a different copy than the workspace root's `expo`, breaking the inheritance visibility. This is a pnpm workspace resolution issue, not a bug in expo-notifications.

**How to apply:** Any time you call `getPermissionsAsync()` or `requestPermissionsAsync()` in notifications.ts, keep the `as any` cast. Do not try to fix it by importing `PermissionResponse` directly — the same problem will recur.

## setNotificationHandler return type

The `handleNotification` callback return type is `Promise<NotificationBehavior>`. In v57 the type is strict; safe workaround is `async (): Promise<any> => ({...})` to avoid breaking on new fields. The three required fields are `shouldShowAlert`, `shouldPlaySound`, `shouldSetBadge`.

## Notification schedule

- Fixed identifier `cleandroid_clean_reminder` — scheduling always cancels first to avoid stacking.
- Fires at 10:00 AM local time (changed from the old "02:00" placeholder in FREQUENCIES).
- `scheduleCleanReminder(frequency)` / `cancelCleanReminder()` live in `utils/notifications.ts`.
- `getNotificationPermission()` for status-check without prompting; `requestNotificationPermission()` for prompting.

## Schedule tab wiring

Toggle (`handleToggle`) and frequency picker (`handleFreqChange`) are both `useCallback`s in `app/(tabs)/schedule.tsx`. The toggle: requests permission, schedules or cancels, then calls `updateSchedule`. The frequency picker: calls `updateSchedule` + reschedules if currently enabled + granted. State: `notifPermission` and `notifScheduled` are checked on mount via `useEffect`.

## Permission-denied UX pattern

duplicate-finder.tsx and large-files.tsx both use a `permissionDenied: boolean` state. When `requestPermissionsAsync()` returns non-granted: set `permissionDenied = true`, reset progress to 0, return to `idle` phase. The idle phase renders a styled panel (permBox) with icon, title, description, and a `Linking.openSettings()` button. This pattern should be applied to any future scan screen that needs MediaLibrary.

## Privacy policy screen

`app/privacy-policy.tsx` — standalone scrollable screen with 10 policy sections. Settings navigates there via `router.push('/privacy-policy')` (in-app, no external URL). Expo Router auto-discovers it via the file-system router.

## Android permissions in app.json

Added `android.permission.READ_EXTERNAL_STORAGE` (legacy Android ≤12) and `android.permission.POST_NOTIFICATIONS` (Android 13+) to the `android.permissions` array. The `expo-notifications` plugin was already present in `plugins`.
