import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

interface Props {
  color?: string;
}

export default function VerifyingPanel({ color }: Props) {
  const colors = useColors();
  const accent = color ?? colors.primary;
  const progress = useSharedValue(0);
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 1100,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const fillStyle = useAnimatedStyle(() => ({
    width: progress.value * containerW,
  }));

  return (
    <View style={[styles.box, {
      borderTopColor: colors.bevelLight, borderLeftColor: colors.bevelLight,
      borderBottomColor: colors.bevelDark, borderRightColor: colors.bevelDark,
      borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
      backgroundColor: colors.card,
    }]}>
      <Text style={[styles.title, { color: accent }]}>{'[VERIFYING RESULTS...]'}</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        {'> CROSS-REFERENCING DATA — PLEASE STAND BY'}
      </Text>

      {/* Pixel progress bar */}
      <View
        style={[styles.barTrack, { backgroundColor: colors.border }]}
        onLayout={e => setContainerW(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.barFill, { backgroundColor: accent }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: 20,
    gap: 10,
    width: '100%',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  barTrack: {
    height: 6,
    width: '100%',
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
