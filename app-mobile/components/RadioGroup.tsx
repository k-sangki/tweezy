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
}

export function RadioGroup<T>({ options, value, onChange }: RadioGroupProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable key={index} style={styles.option} onPress={() => onChange(option.value)}>
            <View style={[styles.circle, selected && styles.circleSelected]}>
              {selected ? <View style={styles.dot} /> : null}
            </View>
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  circleSelected: {
    borderColor: colors.accent,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  label: {
    fontSize: 15,
    color: colors.textMuted,
  },
  labelSelected: {
    color: colors.text,
    fontWeight: '700',
  },
});
