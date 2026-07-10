import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ToolCardProps {
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  /** First color is used as icon accent in retro mode */
  gradientColors: string[];
  badge?: string;
  onPress: () => void;
}

export default function ToolCard({ title, description, icon, gradientColors, badge, onPress }: ToolCardProps) {
  const colors = useColors();
  const iconColor = gradientColors[0];

  const pressed = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    // Invert bevel on press to look "pressed in"
    opacity: 1 - pressed.value * 0.08,
    transform: [{ translateY: pressed.value * 1 }],
  }));

  const handlePressIn = () => { pressed.value = withTiming(1, { duration: 60 }); };
  const handlePressOut = () => { pressed.value = withTiming(0, { duration: 100 }); };

  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[
        styles.card,
        animStyle,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.bevelLight,
          borderLeftColor: colors.bevelLight,
          borderBottomColor: colors.bevelDark,
          borderRightColor: colors.bevelDark,
        },
      ]}>
        {/* Icon box */}
        <View style={[styles.iconBox, { borderColor: iconColor + '50', backgroundColor: iconColor + '12' }]}>
          <Feather name={icon} size={20} color={iconColor} />
        </View>

        {/* Text */}
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title.toUpperCase()}</Text>
          <Text style={[styles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>{description}</Text>
        </View>

        {/* Right side */}
        <View style={styles.right}>
          {badge ? (
            <View style={[styles.badge, { borderColor: colors.accent + '60', backgroundColor: colors.accent + '15' }]}>
              <Text style={[styles.badgeText, { color: colors.accent }]}>{badge}</Text>
            </View>
          ) : null}
          <Text style={[styles.arrow, { color: colors.mutedForeground }]}>{'→'}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    marginBottom: 6,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  iconBox: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  textBlock: { flex: 1 },
  title: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  desc: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
  right: { alignItems: 'flex-end', gap: 6 },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  arrow: { fontSize: 16, fontFamily: 'Inter_700Bold' },
});
