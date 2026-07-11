/**
 * RetroStorageDisplay — replaces smooth donut chart with a
 * Windows-defragmenter-style pixel block map. Totally unique
 * vs every other cleaner app on the store.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Props {
  totalSpace: number;
  usedSpace: number;
  junkSize: number;
  /** ignored — kept for API compat */
  size?: number;
}

function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

const COLS = 32;
const ROWS = 6;
const TOTAL_BLOCKS = COLS * ROWS;

export default function StorageRingChart({ totalSpace, usedSpace, junkSize }: Props) {
  const colors = useColors();
  const animVal = useRef(new Animated.Value(0)).current;

  const freeSpace = Math.max(0, totalSpace - usedSpace);
  const cleanUsed = Math.max(0, usedSpace - junkSize);

  const junkBlocks = Math.round((junkSize / totalSpace) * TOTAL_BLOCKS);
  const usedBlocks = Math.round((cleanUsed / totalSpace) * TOTAL_BLOCKS);
  const freeBlocks = TOTAL_BLOCKS - junkBlocks - usedBlocks;

  useEffect(() => {
    animVal.setValue(0);
    Animated.timing(animVal, {
      toValue: 1,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [totalSpace, usedSpace, junkSize]);

  const revealedCount = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TOTAL_BLOCKS],
  });

  const blocks: ('used' | 'junk' | 'free')[] = [
    ...Array(usedBlocks).fill('used'),
    ...Array(junkBlocks).fill('junk'),
    ...Array(Math.max(0, freeBlocks)).fill('free'),
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerLabel, { color: colors.mutedForeground }]}>DISK MAP</Text>
        <Text style={[styles.headerTotal, { color: colors.primary }]}>{fmt(totalSpace)}</Text>
      </View>

      {/* Defrag grid */}
      <View style={[styles.gridContainer, {
        borderTopColor: colors.bevelLight,
        borderLeftColor: colors.bevelLight,
        borderBottomColor: colors.bevelDark,
        borderRightColor: colors.bevelDark,
        backgroundColor: colors.muted,
      }]}>
        <Animated.View style={styles.grid}>
          {blocks.map((type, i) => {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            let bg = colors.border;
            if (type === 'used') bg = colors.primary + 'AA';
            if (type === 'junk') bg = colors.accent;
            if (type === 'free') bg = colors.border;
            return (
              <View
                key={i}
                style={[
                  styles.block,
                  { backgroundColor: bg },
                  type === 'junk' && styles.junkBlock,
                ]}
              />
            );
          })}
        </Animated.View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary + 'AA' }]} />
          <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>USED</Text>
          <Text style={[styles.legendValue, { color: colors.primary }]}>{fmt(cleanUsed)}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>CACHE</Text>
          <Text style={[styles.legendValue, { color: colors.accent }]}>{fmt(junkSize)}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
          <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>FREE</Text>
          <Text style={[styles.legendValue, { color: colors.foreground }]}>{fmt(freeSpace)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 10 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 3,
  },
  headerTotal: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  gridContainer: {
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    padding: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  block: {
    width: 7,
    height: 7,
  },
  junkBlock: {
    opacity: 0.95,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
  },
  legendLabel: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
  },
  legendValue: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
});
