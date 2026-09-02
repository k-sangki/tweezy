import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface FilterGroupProps {
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function FilterGroup({ title, defaultExpanded = false, children }: FilterGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={() => setExpanded((value) => !value)}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>
      {expanded ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 12,
    color: '#888',
  },
  content: {
    paddingBottom: 16,
  },
});
