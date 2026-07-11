import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  color: string;
  char?: string;
  fontSize?: number;
}

/**
 * Retro blinking cursor — blinks with a hard-off feel (on long, off short),
 * matching the terminal identity. Drop anywhere inline.
 *
 * @param char   Character to display — default '_', use '█' for block cursor
 */
export default function BlinkingCursor({ color, char = '_', fontSize = 26 }: Props) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    // 860ms cycle: hold ON for 500ms, snap OFF for 80ms, hold OFF for 200ms, snap ON
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(1, { duration: 500 }),
        withTiming(0, { duration: 80 }),
        withTiming(0, { duration: 200 }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text
      style={[{ color, fontSize, fontFamily: 'Inter_700Bold', lineHeight: fontSize + 4 }, animStyle]}
    >
      {char}
    </Animated.Text>
  );
}
