import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, radius, spacing, type Palette } from '../lib/theme';
import { Checkbox } from './Checkbox';

export interface FilterGroupProps {
  title: string;
  /**
   * Inline controls rendered next to the title, for a filter whose whole
   * definition fits in its heading (e.g. 주가 [5,000원 v] 이하 제외). Such a
   * group has no detail rows and no expand chevron.
   */
  titleControls?: ReactNode;
  defaultExpanded?: boolean;
  children?: ReactNode;
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
  titleControls,
  defaultExpanded = false,
  children,
  checked,
  indeterminate,
  onCheckedChange,
  note,
}: FilterGroupProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasCheckbox = onCheckedChange != null;
  const collapsible = children != null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {hasCheckbox ? (
            <Checkbox
              checked={!!checked}
              indeterminate={indeterminate}
              onPress={() => onCheckedChange?.(!checked)}
            />
          ) : null}
          <Pressable
            style={styles.titlePress}
            onPress={() => (hasCheckbox ? onCheckedChange?.(!checked) : setExpanded((value) => !value))}
          >
            <Text style={styles.title}>{title}</Text>
          </Pressable>
          {titleControls}
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
        {collapsible ? (
          <Pressable style={styles.chevronButton} onPress={() => setExpanded((value) => !value)} hitSlop={10}>
            <Text style={[styles.chevron, expanded && styles.chevronOpen]}>⌄</Text>
          </Pressable>
        ) : null}
      </View>
      {collapsible && expanded ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
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
      flexWrap: 'wrap',
      gap: 8,
      paddingVertical: 14,
    },
    titlePress: {
      paddingVertical: 2,
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
      paddingLeft: spacing.md,
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
