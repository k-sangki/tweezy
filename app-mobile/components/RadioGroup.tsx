import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../lib/theme';

export interface RadioOption<T> {
  label: string;
  value: T;
}

export interface RadioGroupProps<T> {
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
}

export function RadioGroup<T>({ options, value, onChange, compact }: RadioGroupProps<T>) {
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable key={index} style={styles.option} onPress={() => onChange(option.value)}>
            <View style={[styles.circle, compact && styles.circleCompact, selected && styles.circleSelected]}>
              {selected ? <View style={[styles.dot, compact && styles.dotCompact]} /> : null}
            </View>
            <Text style={[styles.label, compact && styles.labelCompact, selected && styles.labelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingVertical: 10,
  },
  rowCompact: {
    gap: spacing.sm,
    paddingVertical: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  circleCompact: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  circleSelected: {
    borderColor: colors.accent,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  dotCompact: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 15,
    color: colors.textMuted,
  },
  labelCompact: {
    fontSize: 13,
  },
  labelSelected: {
    color: colors.text,
    fontWeight: '700',
  },
});
