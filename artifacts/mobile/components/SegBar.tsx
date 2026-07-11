/**
 * Retro segmented pixel-block progress bar.
 * Single source of truth — import this instead of defining locally.
 */
import React from 'react';
import { View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface SegBarProps {
  /** Fill ratio 0–1 */
  value: number;
  /** Filled-segment colour */
  color: string;
  /** Number of segments (default 20) */
  total?: number;
  /** Segment height in pixels (default 6) */
  height?: number;
}

const SegBar = React.memo(function SegBar({ value, color, total = 20, height = 6 }: SegBarProps) {
  const colors = useColors();
  const filled = Math.max(0, Math.min(total, Math.round(value * total)));
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{ flex: 1, height, backgroundColor: i < filled ? color : colors.border }}
        />
      ))}
    </View>
  );
});

export default SegBar;
