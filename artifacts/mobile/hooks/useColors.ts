import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';

type ColorPalette = typeof colors.light;

interface ColorsConfig {
  light: ColorPalette;
  dark?: ColorPalette;
  radius: number;
}

/**
 * Returns the design tokens for the current color scheme.
 * Falls back to the light palette when no dark key is defined.
 */
export function useColors() {
  const scheme = useColorScheme();
  const cfg = colors as unknown as ColorsConfig;
  const palette: ColorPalette = scheme === 'dark' && cfg.dark ? cfg.dark : cfg.light;
  return { ...palette, radius: cfg.radius };
}
