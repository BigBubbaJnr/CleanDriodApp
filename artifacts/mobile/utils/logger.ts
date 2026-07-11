/**
 * CleanDroid — lightweight error logger.
 *
 * On dev builds: forwards every call to console.error so it appears in the
 * Metro/Expo log immediately.
 *
 * On production builds: accumulates up to MAX_LOG_ENTRIES entries in a
 * circular in-memory ring buffer. The ring is exposed via getErrorLog() so
 * Settings can render it as a copy-pasteable bug-report payload.
 *
 * The ring is never written to AsyncStorage — it is diagnostic only and
 * resets on every app launch. This keeps the logger zero-cost at startup.
 */

const MAX_LOG_ENTRIES = 50;

export interface LogEntry {
  /** ISO timestamp of the error */
  timestamp: string;
  /** Short category label, e.g. "scanMediaLibrary", "persistFingerprintCache" */
  tag: string;
  /** Human-readable error message */
  message: string;
}

const _ring: LogEntry[] = [];

/**
 * Record an error. Replaces every silent `catch {}` in the codebase.
 *
 * @param tag   Short category for filtering (e.g. "hash", "loadPersisted")
 * @param err   The caught value — can be any thrown type
 */
export function logError(tag: string, err: unknown): void {
  const message =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : String(err);

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error(`[CleanDroid/${tag}]`, err);
  }

  _ring.push({ timestamp: new Date().toISOString(), tag, message });

  // Trim to capacity — splice from the front to evict oldest entries
  if (_ring.length > MAX_LOG_ENTRIES) {
    _ring.splice(0, _ring.length - MAX_LOG_ENTRIES);
  }
}

/** Return a read-only snapshot of the error ring (newest entry last). */
export function getErrorLog(): ReadonlyArray<LogEntry> {
  return _ring;
}

/** Clear the error ring — exposed for the Settings "Clear Log" action. */
export function clearErrorLog(): void {
  _ring.length = 0;
}
