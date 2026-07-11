/**
 * Source app type definitions — extracted to break potential circular imports
 * between CleanerContext and scan utilities that need these types.
 *
 * CleanerContext re-exports everything here for backward compatibility.
 */

export type SourceApp =
  | 'camera' | 'whatsapp' | 'telegram' | 'instagram' | 'snapchat'
  | 'tiktok' | 'twitter' | 'facebook' | 'signal' | 'discord'
  | 'screen_recording' | 'screenshots' | 'downloads' | 'other';

export const SOURCE_APP_META: Record<SourceApp, { label: string; icon: string }> = {
  camera:           { label: 'Camera',            icon: 'camera' },
  whatsapp:         { label: 'WhatsApp',           icon: 'message-circle' },
  telegram:         { label: 'Telegram',           icon: 'send' },
  instagram:        { label: 'Instagram',          icon: 'aperture' },
  snapchat:         { label: 'Snapchat',           icon: 'zap' },
  tiktok:           { label: 'TikTok',             icon: 'video' },
  twitter:          { label: 'Twitter / X',        icon: 'at-sign' },
  facebook:         { label: 'Facebook',           icon: 'users' },
  signal:           { label: 'Signal',             icon: 'lock' },
  discord:          { label: 'Discord',            icon: 'hash' },
  screen_recording: { label: 'Screen Recordings',  icon: 'play-circle' },
  screenshots:      { label: 'Screenshots',        icon: 'monitor' },
  downloads:        { label: 'Downloads',          icon: 'download' },
  other:            { label: 'Other Media',        icon: 'folder' },
};

export interface RichAsset {
  id: string;
  filename: string;
  uri: string;
  mediaType: 'photo' | 'video' | 'audio';
  width: number;
  height: number;
  /** Seconds */
  duration: number;
  /** Seconds since epoch — from MediaLibrary creationTime */
  creationTime: number;
  /** Seconds since epoch — from MediaLibrary modificationTime (0 if unavailable) */
  modificationTime: number;
  estimatedSize: number;
  sourceApp: SourceApp;
  isScreenshot: boolean;
  isDownload: boolean;
}

export interface SmartCategory {
  sourceApp: SourceApp;
  label: string;
  /** Feather icon name */
  icon: string;
  count: number;
  estimatedSize: number;
}

export interface RichScanData {
  /** ISO timestamp when this scan was taken */
  timestamp: string;
  /** All scanned assets, sorted by estimatedSize desc (capped at SCAN_CAP_GLOBAL) */
  assets: RichAsset[];
  totalAssetCount: number;
  /** Grouped by source app, sorted by estimatedSize desc */
  smartCategories: SmartCategory[];
}
