import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface ChipOption<T> {
  label: string;
  value: T;
}

export interface ChipSelectProps<T> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ChipSelect<T>({ options, value, onChange }: ChipSelectProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={index}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipSelected: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  chipText: {
    color: '#333',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
});
