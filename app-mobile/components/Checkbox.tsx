import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme, type Palette } from '../lib/theme';

export interface CheckboxProps {
  checked: boolean;
  /** Some-but-not-all children checked - renders a dash instead of a tick. */
  indeterminate?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  size?: 'md' | 'sm';
}

export function Checkbox({ checked, indeterminate, onPress, disabled, size = 'md' }: CheckboxProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const on = checked || indeterminate;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      // Generous slop: the box itself is 17-20px, well under a comfortable
      // touch target, and these sit next to other tappable controls.
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      style={[styles.box, size === 'sm' && styles.boxSm, on && styles.boxOn, disabled && styles.boxDisabled]}
    >
      {on ? (
        <Text style={[styles.mark, size === 'sm' && styles.markSm]}>
          {indeterminate && !checked ? '–' : '✓'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    box: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      // borderStrong (not border): an unchecked box has to read as a control,
      // and the subtle divider colour vanishes against the card behind it.
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    boxSm: {
      width: 18,
      height: 18,
      borderRadius: 5,
    },
    boxOn: {
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    boxDisabled: {
      opacity: 0.4,
    },
    mark: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    markSm: {
      fontSize: 11,
    },
  });
