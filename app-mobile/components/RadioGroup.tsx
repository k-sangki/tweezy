import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, spacing, type Palette } from '../lib/theme';

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={index}
            style={styles.option}
            onPress={() => onChange(option.value)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
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

const createStyles = (colors: Palette) =>
  StyleSheet.create({
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
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    circleCompact: {
      width: 17,
      height: 17,
      borderRadius: 9,
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
      width: 9,
      height: 9,
      borderRadius: 5,
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
