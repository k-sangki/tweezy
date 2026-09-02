import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';
import { Checkbox } from './Checkbox';

export interface FilterGroupProps {
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  /** When provided, shows a checkbox that turns every row in the group on/off at once. */
  checked?: boolean;
  /** Some rows on, some off. */
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Short annotation next to the title, e.g. "데이터 준비 중". */
  note?: string;
}

export function FilterGroup({
  title,
  defaultExpanded = false,
  children,
  checked,
  indeterminate,
  onCheckedChange,
  note,
}: FilterGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasCheckbox = onCheckedChange != null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.titleRow}
          onPress={() => (hasCheckbox ? onCheckedChange?.(!checked) : setExpanded((value) => !value))}
        >
          {hasCheckbox ? (
            <Checkbox
              checked={!!checked}
              indeterminate={indeterminate}
              onPress={() => onCheckedChange?.(!checked)}
            />
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </Pressable>
        <Pressable style={styles.chevronButton} onPress={() => setExpanded((value) => !value)} hitSlop={8}>
          <Text style={[styles.chevron, expanded && styles.chevronOpen]}>⌄</Text>
        </Pressable>
      </View>
      {expanded ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  note: {
    fontSize: 11,
    color: colors.textMuted,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  chevronButton: {
    paddingVertical: 16,
    paddingLeft: spacing.sm,
  },
  chevron: {
    fontSize: 16,
    color: colors.textMuted,
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  content: {
    paddingBottom: spacing.md,
  },
});
