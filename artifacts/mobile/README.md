# CleanDroid

A free, open, no-nonsense Android storage manager built with Expo (React Native).

Zero paywalls. Zero subscriptions. Every feature, always free.

---

## What it does

| Tool | What it finds | How it works |
|---|---|---|
| **Junk Cleaner** | Temp files, thumbnails, residual cache | Scans MediaStore for zero-byte and system-temp files |
| **Large File Scanner** | Files taking up the most space | Reads photo/video library sorted by estimated size |
| **Duplicate Finder** | Photos with identical dimensions and duration | Groups assets by fingerprint across the media library |
| **Screenshot Manager** | Screenshots folder | Reads `DCIM/Screenshots` and lists by size |
| **App Cache** | Accessible app caches | Auto-clears own cache; Smart Sweep guides you through Android Settings for other apps |
| **Storage Intelligence** | Total usage, trends, recommendations | Reads device storage stats and scan history |

---

## Why some numbers show `~`

Android does not give third-party apps access to every file's exact byte count. Where we can't read the real size, we estimate and mark it with `~`:

- **Photos** — estimated from pixel dimensions (`width × height × 0.2`)
- **Videos** — estimated from duration (`duration × 4 Mbps / 8`)
- **App caches** — typical averages for common apps (Android restricts per-app cache visibility to system apps)

When we have the real size from the filesystem, we show it without `~`.

---

## Why doesn't CleanDroid clean app caches directly?

Android's security model prevents third-party apps from clearing another app's cache silently. Only the Android system or the user (via Settings) can do it.

CleanDroid's **Smart Sweep** works around this by opening each app's Android Settings page in sequence, so you can tap "Clear Cache" without navigating back and forth yourself.

This is not a limitation of CleanDroid — it is an Android security feature that protects your data.

---

## Why doesn't Auto-Clean schedule run in the background?

Background execution on Android 12+ requires a foreground service or WorkManager, both of which have strict battery and scheduling constraints. This feature is on the roadmap for v1.1.

Your schedule preferences are saved now and will activate automatically when background execution is implemented.

---

## Privacy

CleanDroid performs all storage analysis **locally on your device**.

- No files are uploaded to any server
- No analytics are collected
- No account is required
- No network calls are made during scans

The only network access is notifications (system-level) and any future AdMob ad requests, which are handled entirely by Google's SDK.

For the full privacy policy, see: https://cleandroid.app/privacy

---

## Permissions

| Permission | Why it's needed |
|---|---|
| `READ_MEDIA_IMAGES` | Scan photos for duplicates and large files |
| `READ_MEDIA_VIDEO` | Scan videos for large files |
| `VIBRATE` | Haptic feedback on actions |

We request the minimum permissions required. If a permission isn't needed for a feature, it isn't in the manifest.

---

## Architecture

- **Framework**: Expo (React Native), Expo Router (file-based routing)
- **Storage**: AsyncStorage only — no backend, no database
- **State**: `CleanerContext` with `useMemo`-memoised value
- **Scans**: `expo-media-library` (MediaLibrary) + `expo-file-system` (FileSystem)
- **Style**: Retro CRT / Y2K terminal — see `CLEANDROID_PRINCIPLES.md`

---

## Contact

hello@cleandroid.app

---

## License

Free to use. See LICENSE.
