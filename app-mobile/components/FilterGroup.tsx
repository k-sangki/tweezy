import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

export interface FilterGroupProps {
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  /** When provided, shows a checkbox that turns this whole group's filter on/off at its default values. */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function FilterGroup({ title, defaultExpanded = false, children, checked, onCheckedChange }: FilterGroupProps) {
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
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
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
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  checkboxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
