import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import BlinkingCursor from './BlinkingCursor';

// ── Boot sequence definition ──────────────────────────────────────────────────

interface BootLine {
  text: string;
  type: 'sys' | 'title' | 'spacer' | 'step' | 'status' | 'ready';
  suffix?: string; // [OK] etc
}

const LINES: BootLine[] = [
  { text: '> SYS v1.0 / ANDROID',        type: 'sys'    },
  { text: 'CLEANDROID',                   type: 'title'  },
  { text: '',                             type: 'spacer' },
  { text: '[BOOT SEQUENCE INITIATED]',    type: 'status' },
  { text: '',                             type: 'spacer' },
  { text: 'INITIALISING CLEANDROID...',   type: 'step',  suffix: '[OK]' },
  { text: 'LOADING MODULES...',           type: 'step',  suffix: '[OK]' },
  { text: 'MOUNTING FILESYSTEM...',       type: 'step',  suffix: '[OK]' },
  { text: 'SCANNING DEVICE PROFILE...',   type: 'step',  suffix: '[OK]' },
  { text: 'CHECKING PERMISSIONS...',      type: 'step',  suffix: '[OK]' },
  { text: '',                             type: 'spacer' },
  { text: 'ALL SYSTEMS NOMINAL.',         type: 'status' },
  { text: '',                             type: 'spacer' },
  { text: '>> READY',                     type: 'ready'  },
];

// Delay (ms) at which each line appears
const LINE_AT = [0, 180, 420, 470, 660, 710, 1120, 1530, 2020, 2490, 2840, 2960, 3200, 3380];

// Fade-out starts this many ms after the last line appears
const HOLD_AFTER_READY = 1300;
const FADE_DURATION    = 700;
const TOTAL_DONE       = LINE_AT[LINE_AT.length - 1] + HOLD_AFTER_READY + FADE_DURATION;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { onDone: () => void; }

export default function BootScreen({ onDone }: Props) {
  const colors  = useColors();
  const [count, setCount] = useState(0);
  const opacity = useSharedValue(1);
  const fade    = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Web: skip the boot sequence — AsyncStorage sets the flag,
      // but the overlay still plays once.
    }

    // Reveal lines
    const timers = LINE_AT.map((ms, i) =>
      setTimeout(() => setCount(i + 1), ms),
    );

    // Begin fade
    const fadeTimer = setTimeout(() => {
      opacity.value = withTiming(0, {
        duration: FADE_DURATION,
        easing: Easing.out(Easing.quad),
      });
    }, LINE_AT[LINE_AT.length - 1] + HOLD_AFTER_READY);

    // Signal done
    const doneTimer = setTimeout(onDone, TOTAL_DONE);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  function stepColor(line: BootLine): string {
    switch (line.type) {
      case 'sys':    return colors.mutedForeground;
      case 'title':  return colors.primary;
      case 'status': return colors.foreground;
      case 'step':   return colors.mutedForeground;
      case 'ready':  return colors.primary;
      default:       return colors.foreground;
    }
  }

  return (
    <Animated.View
      style={[styles.overlay, { backgroundColor: colors.background }, fade]}
      pointerEvents="none"
    >
      <View style={styles.content}>
        {LINES.slice(0, count).map((line, i) => {
          if (line.type === 'spacer') {
            return <View key={i} style={styles.spacer} />;
          }

          const isLast = i === count - 1;

          return (
            <View key={i} style={styles.row}>
              {/* Main text */}
              <Text
                style={[
                  line.type === 'title' ? styles.titleText : styles.lineText,
                  { color: stepColor(line), flexShrink: 1 },
                ]}
              >
                {line.text}
              </Text>

              {/* [OK] suffix */}
              {line.suffix && (
                <Text style={[styles.suffix, { color: colors.success }]}>
                  {line.suffix}
                </Text>
              )}

              {/* Blinking cursor on last revealed line (only on 'ready') */}
              {line.type === 'ready' && isLast && (
                <BlinkingCursor color={colors.primary} fontSize={14} char="█" />
              )}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 9999,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spacer: {
    height: 10,
  },
  lineText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  titleText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    letterSpacing: 3,
    marginTop: 2,
    marginBottom: 4,
  },
  suffix: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    marginLeft: 'auto',
  },
});
