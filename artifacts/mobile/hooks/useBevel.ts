/**
 * Returns the asymmetric bevel border style used throughout CleanDroid.
 * Calling this hook instead of repeating the object eliminates 50+ lines
 * of duplicate border declarations across all screens.
 *
 * Usage:
 *   const bevel = useBevel();
 *   <View style={[bevel, { backgroundColor: colors.card }]} />
 */
import { useColors } from '@/hooks/useColors';

export function useBevel() {
  const colors = useColors();
  return {
    borderTopColor: colors.bevelLight,
    borderLeftColor: colors.bevelLight,
    borderBottomColor: colors.bevelDark,
    borderRightColor: colors.bevelDark,
    borderTopWidth: 2 as const,
    borderLeftWidth: 2 as const,
    borderBottomWidth: 2 as const,
    borderRightWidth: 2 as const,
  };
}

/** Inverted bevel — looks "pressed in". Use for active buttons. */
export function useBevelPressed() {
  const colors = useColors();
  return {
    borderTopColor: colors.bevelDark,
    borderLeftColor: colors.bevelDark,
    borderBottomColor: colors.bevelLight,
    borderRightColor: colors.bevelLight,
    borderTopWidth: 2 as const,
    borderLeftWidth: 2 as const,
    borderBottomWidth: 2 as const,
    borderRightWidth: 2 as const,
  };
}
