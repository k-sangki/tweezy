import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Market, ScreenerFilter } from '@tweezy/core';
import { FilterGroup } from '../components/FilterGroup';
import { useScreener } from '../lib/ScreenerContext';

const ALL_MARKETS: Market[] = ['KOSPI', 'KOSDAQ'];

function toInputText(value: number | undefined): string {
  return value == null ? '' : String(value);
}

function parseInputNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function FiltersScreen() {
  const router = useRouter();
  const { filter, setFilter } = useScreener();
  const [markets, setMarkets] = useState<Market[]>(filter.markets ?? []);
  const [minDividendYieldText, setMinDividendYieldText] = useState(
    toInputText(filter.minDividendYield),
  );

  const toggleMarket = (market: Market) => {
    setMarkets((current) =>
      current.includes(market) ? current.filter((item) => item !== market) : [...current, market],
    );
  };

  const apply = () => {
    const next: ScreenerFilter = {
      markets: markets.length > 0 ? markets : undefined,
      minDividendYield: parseInputNumber(minDividendYieldText),
    };
    setFilter(next);
    router.back();
  };

  const reset = () => {
    setMarkets([]);
    setMinDividendYieldText('');
    setFilter({});
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <FilterGroup title="시장" defaultExpanded>
          <View style={styles.chipRow}>
            {ALL_MARKETS.map((market) => {
              const selected = markets.includes(market);
              return (
                <Pressable
                  key={market}
                  onPress={() => toggleMarket(market)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{market}</Text>
                </Pressable>
              );
            })}
          </View>
        </FilterGroup>

        <FilterGroup title="밸류에이션" defaultExpanded>
          <Text style={styles.label}>배당수익률(%) 이상</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="예: 1"
            value={minDividendYieldText}
            onChangeText={setMinDividendYieldText}
          />
        </FilterGroup>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.resetButton]} onPress={reset}>
          <Text style={styles.resetButtonText}>초기화</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.applyButton]} onPress={apply}>
          <Text style={styles.applyButtonText}>적용</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
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
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#f2f2f2',
  },
  resetButtonText: {
    color: '#333',
    fontWeight: '600',
  },
  applyButton: {
    backgroundColor: '#0a7ea4',
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
