import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, spacing, type Palette } from '../lib/theme';
import { Checkbox } from './Checkbox';

export interface FilterRowProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Leading text. Tapping it toggles the row, so the target isn't just the checkbox. */
  label: string;
  /** Inline controls (and any trailing text) that follow the label on the same line. */
  children?: ReactNode;
  /** Set when the data this row needs isn't collected yet: row is locked and annotated. */
  unavailable?: boolean;
  note?: string;
}

export function FilterRow({ checked, onCheckedChange, label, children, unavailable, note }: FilterRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const on = checked && !unavailable;
  const toggle = () => {
    if (!unavailable) onCheckedChange(!checked);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={styles.checkbox}>
          <Checkbox size="sm" checked={on} disabled={unavailable} onPress={toggle} />
        </View>
        <View style={[styles.content, !on && styles.contentOff]}>
          <Pressable onPress={toggle} disabled={unavailable} hitSlop={{ top: 10, bottom: 10 }}>
            <Text style={styles.label}>{label}</Text>
          </Pressable>
          {children}
        </View>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    wrapper: {
      paddingVertical: 7,
    },
    row: {
      flexDirection: 'row',
      // Top-aligned so the checkbox stays next to the first line when a row's
      // controls wrap; the offset optically centers it against that line.
      alignItems: 'flex-start',
      gap: 10,
    },
    checkbox: {
      marginTop: 5,
    },
    content: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    contentOff: {
      opacity: 0.45,
    },
    label: {
      fontSize: 14,
      color: colors.text,
    },
    note: {
      fontSize: 11,
      color: colors.textMuted,
      marginLeft: 28,
      marginTop: spacing.xs,
    },
  });
