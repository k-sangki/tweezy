import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../lib/theme';
import { Checkbox } from './Checkbox';

export interface FilterRowProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Label text and inline controls - laid out on one line, wrapping only if it has to. */
  children: ReactNode;
  /** Set when the data this row needs isn't collected yet: row is locked and annotated. */
  unavailable?: boolean;
  note?: string;
}

export function FilterRow({ checked, onCheckedChange, children, unavailable, note }: FilterRowProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={styles.checkbox}>
          <Checkbox
            size="sm"
            checked={checked && !unavailable}
            disabled={unavailable}
            onPress={() => onCheckedChange(!checked)}
          />
        </View>
        <View style={[styles.content, (!checked || unavailable) && styles.contentOff]}>{children}</View>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  note: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 27,
    marginTop: spacing.xs,
  },
});
