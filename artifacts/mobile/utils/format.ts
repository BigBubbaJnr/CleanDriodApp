/**
 * Shared formatting utilities — single source of truth.
 * Import from here instead of defining locally in each screen.
 */

/** Human-readable byte count: "1.4 GB", "340 MB", "12 KB" */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

/** Signed delta for trend display: "+1.2 GB", "-340 MB" */
export function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '-';
  return `${sign}${formatBytes(Math.abs(delta))}`;
}

/**
 * Relative time from an ISO date string or epoch ms — used in activity logs.
 * Examples: "JUST NOW", "4H AGO", "3D AGO", "Jan 15"
 */
export function formatRelativeDate(isoOrMs: string | number): string {
  const d = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  const diff = Date.now() - d;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'JUST NOW';
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}D AGO`;
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
}

/**
 * Absolute date + time from ISO string — used in scan logs and history panels.
 * Example: "JAN 15, 14:32"
 */
export function formatAbsoluteDate(isoString: string): string {
  return new Date(isoString)
    .toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    .toUpperCase();
}

/**
 * Short calendar date from creation-time in seconds — used in media item cells.
 * Example: "Jan 15, '25"
 */
export function formatDateShort(creationTimeSecs: number): string {
  return new Date(creationTimeSecs * 1000)
    .toLocaleDateString([], { year: '2-digit', month: 'short', day: 'numeric' })
    .toUpperCase();
}

/**
 * Human-readable age from a creation timestamp in seconds.
 * Examples: "TODAY", "YESTERDAY", "5D AGO", "3W AGO", "4MO AGO", "1Y 2MO AGO"
 */
export function getAgeText(creationTimeSecs: number): string {
  const days = Math.floor((Date.now() - creationTimeSecs * 1000) / 86_400_000);
  if (days < 1) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return `${days}D AGO`;
  if (days < 30) return `${Math.floor(days / 7)}W AGO`;
  if (days < 365) return `${Math.floor(days / 30)}MO AGO`;
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  return m > 0 ? `${y}Y ${m}MO AGO` : `${y}Y AGO`;
}

/**
 * Relative label for a past ISO timestamp — used for scan comparison ("3 DAYS AGO").
 * Examples: "TODAY", "YESTERDAY", "3 DAYS AGO", "2 WEEKS AGO", "4 MONTHS AGO"
 */
export function daysAgoLabel(isoString: string): string {
  const days = Math.floor((Date.now() - new Date(isoString).getTime()) / 86_400_000);
  if (days === 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return `${days} DAYS AGO`;
  if (days < 30) return `${Math.floor(days / 7)} WEEKS AGO`;
  return `${Math.floor(days / 30)} MONTHS AGO`;
}
