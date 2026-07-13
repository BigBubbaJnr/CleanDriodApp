/**
 * CleanDroid structured logger.
 *
 * Levels: DEBUG < INFO < WARN < ERROR
 *
 * All entries are stored in a 50-entry circular ring readable from Settings.
 * DEBUG entries are only stored in __DEV__ builds.
 *
 * Usage:
 *   logDebug('Tag', 'verbose detail');
 *   logInfo('Tag', 'scan started');
 *   logWarn('Tag', 'file not found, skipping');
 *   logError('Tag', err);  // accepts Error or unknown
 *
 * Read / clear the ring from the Error Log in Settings:
 *   getErrorLog()    → LogEntry[]
 *   clearErrorLog()  → void
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  ts: string;        // ISO timestamp
  level: LogLevel;
  tag: string;
  message: string;
}

const MAX_RING = 50;
const _ring: LogEntry[] = [];

function push(level: LogLevel, tag: string, message: string) {
  const entry: LogEntry = { ts: new Date().toISOString(), level, tag, message };
  if (_ring.length >= MAX_RING) _ring.shift();
  _ring.push(entry);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Verbose diagnostics — only stored and forwarded to console in __DEV__. */
export function logDebug(tag: string, message: string): void {
  if (!__DEV__) return;
  push('DEBUG', tag, message);
  console.debug(`[DBG][${tag}] ${message}`);
}

/** Normal operational events (scan started, permission granted, etc.). */
export function logInfo(tag: string, message: string): void {
  push('INFO', tag, message);
  if (__DEV__) console.info(`[INF][${tag}] ${message}`);
}

/** Non-fatal issues (file skipped, unexpected state). */
export function logWarn(tag: string, message: string): void {
  push('WARN', tag, message);
  if (__DEV__) console.warn(`[WRN][${tag}] ${message}`);
}

/** Errors — accepts an Error object or any unknown thrown value. */
export function logError(tag: string, err: unknown): void {
  const message = err instanceof Error
    ? `${err.name}: ${err.message}`
    : String(err);
  push('ERROR', tag, message);
  if (__DEV__) console.error(`[ERR][${tag}] ${message}`);
}

// ── Ring accessors ────────────────────────────────────────────────────────────

/** Returns all stored log entries, newest first. */
export function getErrorLog(): LogEntry[] {
  return [..._ring].reverse();
}

/** Clears the in-memory ring. */
export function clearErrorLog(): void {
  _ring.length = 0;
}
