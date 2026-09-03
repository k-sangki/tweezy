import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, radius, spacing, type Palette } from '../lib/theme';

export interface SelectOption<T> {
  label: string;
  value: T;
}

export interface SelectProps<T> {
  /** Sheet title. Shown as the row label too, unless `compact` (then it's sheet-only). */
  label: string;
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Renders as a small value-only pill (no row label) for packing several controls on one line. */
  compact?: boolean;
}

export function Select<T>({ label, options, value, onChange, compact }: SelectProps<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  return (
    <>
      <Pressable
        style={compact ? styles.triggerCompact : styles.trigger}
        onPress={() => setOpen(true)}
        hitSlop={{ top: 8, bottom: 8 }}
      >
        {compact ? null : <Text style={styles.triggerLabel}>{label}</Text>}
        <View style={styles.triggerValue}>
          <Text style={styles.triggerValueText}>{current?.label ?? '선택'}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(_, index) => String(index)}
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    style={styles.option}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{item.label}</Text>
                    {selected ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
    },
    triggerCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: colors.accentSoft,
    },
    triggerLabel: {
      fontSize: 15,
      color: colors.text,
    },
    triggerValue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    triggerValueText: {
      fontSize: 15,
      color: colors.accent,
      fontWeight: '600',
    },
    chevron: {
      fontSize: 14,
      color: colors.accent,
    },
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      maxHeight: '70%',
    },
    sheetTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    option: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
    },
    optionText: {
      fontSize: 16,
      color: colors.text,
    },
    optionTextSelected: {
      color: colors.accent,
      fontWeight: '700',
    },
    check: {
      color: colors.accent,
      fontWeight: '700',
    },
  });
