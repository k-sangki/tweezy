import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  GrowthPeriodType,
  GrowthStreakFilter,
  Market,
  ProfitTurnaroundMode,
  ScreenerFilter,
} from '@tweezy/core';
import { ChipSelect } from '../components/ChipSelect';
import { FilterGroup } from '../components/FilterGroup';
import { useScreener } from '../lib/ScreenerContext';

const ALL_MARKETS: Market[] = ['KOSPI', 'KOSDAQ'];

const TURNAROUND_OPTIONS: { label: string; value: ProfitTurnaroundMode | undefined }[] = [
  { label: '미사용', value: undefined },
  { label: '직전분기 대비', value: 'qoq' },
  { label: '전년동기 대비', value: 'yoy' },
];

const PERIOD_OPTIONS: { label: string; value: GrowthPeriodType }[] = [
  { label: '분기', value: 'quarterly' },
  { label: '연간', value: 'annual' },
];

const CONSECUTIVE_OPTIONS: { label: string; value: 0 | 1 | 2 | 3 | 4 }[] = [
  { label: '미사용', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
];

function toInputText(value: number | undefined): string {
  return value == null ? '' : String(value);
}

function parseInputNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toStreakFilter(period: GrowthPeriodType, consecutive: 0 | 1 | 2 | 3 | 4): GrowthStreakFilter | undefined {
  return consecutive === 0 ? undefined : { period, consecutive };
}

export default function FiltersScreen() {
  const router = useRouter();
  const { filter, setFilter } = useScreener();
  const [markets, setMarkets] = useState<Market[]>(filter.markets ?? []);
  const [minDividendYieldText, setMinDividendYieldText] = useState(
    toInputText(filter.minDividendYield),
  );
  const [profitTurnaround, setProfitTurnaround] = useState(filter.profitTurnaround);
  const [netIncomePeriod, setNetIncomePeriod] = useState<GrowthPeriodType>(
    filter.netIncomeStreak?.period ?? 'quarterly',
  );
  const [netIncomeConsecutive, setNetIncomeConsecutive] = useState<0 | 1 | 2 | 3 | 4>(
    filter.netIncomeStreak?.consecutive ?? 0,
  );
  const [revenuePeriod, setRevenuePeriod] = useState<GrowthPeriodType>(
    filter.revenueStreak?.period ?? 'quarterly',
  );
  const [revenueConsecutive, setRevenueConsecutive] = useState<0 | 1 | 2 | 3 | 4>(
    filter.revenueStreak?.consecutive ?? 0,
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
      profitTurnaround,
      netIncomeStreak: toStreakFilter(netIncomePeriod, netIncomeConsecutive),
      revenueStreak: toStreakFilter(revenuePeriod, revenueConsecutive),
    };
    setFilter(next);
    router.back();
  };

  const reset = () => {
    setMarkets([]);
    setMinDividendYieldText('');
    setProfitTurnaround(undefined);
    setNetIncomePeriod('quarterly');
    setNetIncomeConsecutive(0);
    setRevenuePeriod('quarterly');
    setRevenueConsecutive(0);
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

        <FilterGroup title="펀더멘털">
          <Text style={styles.label}>최근 분기 흑자전환</Text>
          <ChipSelect options={TURNAROUND_OPTIONS} value={profitTurnaround} onChange={setProfitTurnaround} />

          <Text style={[styles.label, styles.labelSpaced]}>순이익 지속상승</Text>
          <ChipSelect options={PERIOD_OPTIONS} value={netIncomePeriod} onChange={setNetIncomePeriod} />
          <View style={styles.spacer} />
          <ChipSelect options={CONSECUTIVE_OPTIONS} value={netIncomeConsecutive} onChange={setNetIncomeConsecutive} />

          <Text style={[styles.label, styles.labelSpaced]}>매출 지속상승</Text>
          <ChipSelect options={PERIOD_OPTIONS} value={revenuePeriod} onChange={setRevenuePeriod} />
          <View style={styles.spacer} />
          <ChipSelect options={CONSECUTIVE_OPTIONS} value={revenueConsecutive} onChange={setRevenueConsecutive} />
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
  labelSpaced: {
    marginTop: 16,
  },
  spacer: {
    height: 8,
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
