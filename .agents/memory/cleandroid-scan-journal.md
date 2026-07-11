---
name: CleanDroid Scan Journal
description: ScanJournalEntry system — what fields exist, where it's stored, how it integrates with the 4 tool screens and the Schedule tab.
---

## Structure
`ScanJournalEntry` fields: `id`, `scanNumber` (auto-increment, 1-based), `timestamp`, `tool` (union: junk/duplicates/large_files/screenshots/cache/storage_intel), `durationMs`, `itemsFound`, `itemsCleaned`, `bytesFound`, `bytesRecovered`, `totalStorageBytes`.

## Storage
AsyncStorage key: `cleandroid_journal`. Capped at 100 entries. Newest entry prepended.

## Context API
`addJournalEntry(entry: Omit<ScanJournalEntry, 'id' | 'scanNumber'>)` — auto-assigns id (timestamp+random) and scanNumber (prev.length+1).

## Tool screen integration
All 4 tool screens (junk-cleaner, large-files, duplicate-finder, screenshot-manager) call `addJournalEntry` at the end of their clean/delete handler, after `addHistoryItem`. They also set `scanStartRef.current = Date.now()` at the start of startScan/loadScreenshots, and use `Date.now() - scanStartRef.current` for `durationMs`.

## VerifyingPanel
`components/VerifyingPanel.tsx` — shown for ~1200ms between scan completion and results. Props: `color`. Uses Reanimated `withTiming` fill bar over 1100ms. Each tool gets a 'verifying' phase inserted between scanning/loading and results.

## Schedule tab
EXECUTION LOG section replaced with SCAN JOURNAL section. Shows journal cards (SCAN #N / tool / date / STORAGE / RECOVERED / CLEANED / DURATION). Falls back to old history items if journal is empty (legacy graceful degradation).

**Why:** Both systems are kept; `history` still drives stats/trend/breakdown calculations; `journal` only drives the SCAN JOURNAL display.
