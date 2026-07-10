import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

interface StorageRingChartProps {
  totalSpace: number;
  usedSpace: number;
  junkSize: number;
  size?: number;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

export default function StorageRingChart({
  totalSpace,
  usedSpace,
  junkSize,
  size = 200,
}: StorageRingChartProps) {
  const colors = useColors();
  const strokeWidth = 20;
  const gap = 4;
  const innerStrokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const innerRadius = radius - strokeWidth / 2 - gap - innerStrokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const center = size / 2;

  const usedFraction = usedSpace / totalSpace;
  const junkFraction = junkSize / totalSpace;
  const freeFraction = 1 - usedFraction;

  // Outer ring: used (purple) + free (border)
  const usedDash = usedFraction * circumference;
  // Inner ring: junk (teal)
  const junkDash = junkFraction * innerCircumference;

  const freeSpace = totalSpace - usedSpace;

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="usedGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.primary} />
            <Stop offset="1" stopColor="#4ECDC4" />
          </LinearGradient>
          <LinearGradient id="junkGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accent} />
            <Stop offset="1" stopColor="#00A896" />
          </LinearGradient>
        </Defs>
        {/* Background ring (free space) */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.border}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Used space arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#usedGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${usedDash} ${circumference - usedDash}`}
          strokeDashoffset={circumference * 0.25}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
        {/* Junk inner ring background */}
        <Circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="none"
          stroke={colors.border}
          strokeWidth={innerStrokeWidth}
        />
        {/* Junk arc */}
        <Circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="none"
          stroke="url(#junkGrad)"
          strokeWidth={innerStrokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${junkDash} ${innerCircumference - junkDash}`}
          strokeDashoffset={innerCircumference * 0.25}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>

      {/* Center text */}
      <View style={[styles.centerContent, { width: size, height: size }]}>
        <Text style={[styles.centerLabel, { color: colors.mutedForeground }]}>FREE</Text>
        <Text style={[styles.centerValue, { color: colors.foreground }]}>
          {formatBytes(freeSpace)}
        </Text>
        <Text style={[styles.centerSub, { color: colors.mutedForeground }]}>
          of {formatBytes(totalSpace)}
        </Text>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
            Used · {formatBytes(usedSpace)}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
            Junk · {formatBytes(junkSize)}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
            Free · {formatBytes(freeSpace)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 2,
  },
  centerValue: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    marginTop: 2,
  },
  centerSub: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
