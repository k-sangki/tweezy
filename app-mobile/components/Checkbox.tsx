import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

export interface CheckboxProps {
  checked: boolean;
  /** Some-but-not-all children checked - renders a dash instead of a tick. */
  indeterminate?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  size?: 'md' | 'sm';
}

export function Checkbox({ checked, indeterminate, onPress, disabled, size = 'md' }: CheckboxProps) {
  const on = checked || indeterminate;
  const box = [
    styles.box,
    size === 'sm' && styles.boxSm,
    on && styles.boxOn,
    disabled && styles.boxDisabled,
  ];

  return (
    <Pressable onPress={disabled ? undefined : onPress} hitSlop={8} style={box}>
      {on ? <Text style={[styles.mark, size === 'sm' && styles.markSm]}>{indeterminate && !checked ? '–' : '✓'}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  boxSm: {
    width: 17,
    height: 17,
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
    fontSize: 10,
  },
});
