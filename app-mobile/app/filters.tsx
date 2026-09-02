import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  GrowthPeriodType,
  GrowthStreakFilter,
  Market,
  ProfitTurnaroundMode,
  ScreenerFilter,
  ShortInterestDropFilter,
} from '@tweezy/core';
import { FilterGroup } from '../components/FilterGroup';
import { RadioGroup } from '../components/RadioGroup';
import { Select } from '../components/Select';
import { colors, radius, spacing } from '../lib/theme';
import { useScreener } from '../lib/ScreenerContext';

const ALL_MARKETS: Market[] = ['KOSPI', 'KOSDAQ'];

const TURNAROUND_OPTIONS: { label: string; value: ProfitTurnaroundMode | undefined }[] = [
  { label: '전체', value: undefined },
  { label: '직전분기 대비 흑자전환', value: 'qoq' },
  { label: '전년동기 대비 흑자전환', value: 'yoy' },
];

const PERIOD_OPTIONS: { label: string; value: GrowthPeriodType }[] = [
  { label: '분기', value: 'quarterly' },
  { label: '연간', value: 'annual' },
];

const CONSECUTIVE_OPTIONS: { label: string; value: 0 | 1 | 2 | 3 | 4 }[] = [
  { label: '전체', value: 0 },
  { label: '1회 이상 연속 증가', value: 1 },
  { label: '2회 이상 연속 증가', value: 2 },
  { label: '3회 이상 연속 증가', value: 3 },
  { label: '4회 이상 연속 증가', value: 4 },
];

const DROP_PCT_OPTIONS: { label: string; value: 5 | 10 | 20 | undefined }[] = [
  { label: '전체', value: undefined },
  { label: '5% 이상 감소', value: 5 },
  { label: '10% 이상 감소', value: 10 },
  { label: '20% 이상 감소', value: 20 },
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

function toShortInterestDropFilter(
  daysAgoText: string,
  minDropPct: 5 | 10 | 20 | undefined,
): ShortInterestDropFilter | undefined {
  const daysAgo = parseInputNumber(daysAgoText);
  return daysAgo == null || minDropPct == null ? undefined : { daysAgo, minDropPct };
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
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
  const [institutionalDaysText, setInstitutionalDaysText] = useState(
    toInputText(filter.institutionalNetBuyDays),
  );
  const [foreignDaysText, setForeignDaysText] = useState(toInputText(filter.foreignNetBuyDays));
  const [pensionDaysText, setPensionDaysText] = useState(toInputText(filter.pensionNetBuyDays));
  const [shortDaysAgoText, setShortDaysAgoText] = useState(
    toInputText(filter.shortInterestDrop?.daysAgo),
  );
  const [shortMinDropPct, setShortMinDropPct] = useState(filter.shortInterestDrop?.minDropPct);

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
      institutionalNetBuyDays: parseInputNumber(institutionalDaysText),
      foreignNetBuyDays: parseInputNumber(foreignDaysText),
      pensionNetBuyDays: parseInputNumber(pensionDaysText),
      shortInterestDrop: toShortInterestDropFilter(shortDaysAgoText, shortMinDropPct),
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
    setInstitutionalDaysText('');
    setForeignDaysText('');
    setPensionDaysText('');
    setShortDaysAgoText('');
    setShortMinDropPct(undefined);
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
          <FilterRow label="배당수익률(%) 이상">
            <TextInput
              style={styles.rowInput}
              keyboardType="numeric"
              placeholder="예: 1"
              placeholderTextColor={colors.textMuted}
              value={minDividendYieldText}
              onChangeText={setMinDividendYieldText}
            />
          </FilterRow>
        </FilterGroup>

        <FilterGroup title="펀더멘털">
          <Select label="최근 분기 흑자전환" options={TURNAROUND_OPTIONS} value={profitTurnaround} onChange={setProfitTurnaround} />
          <View style={styles.divider} />
          <Text style={styles.subLabel}>순이익 지속상승</Text>
          <RadioGroup options={PERIOD_OPTIONS} value={netIncomePeriod} onChange={setNetIncomePeriod} />
          <Select label="조건" options={CONSECUTIVE_OPTIONS} value={netIncomeConsecutive} onChange={setNetIncomeConsecutive} />
          <View style={styles.divider} />
          <Text style={styles.subLabel}>매출 지속상승</Text>
          <RadioGroup options={PERIOD_OPTIONS} value={revenuePeriod} onChange={setRevenuePeriod} />
          <Select label="조건" options={CONSECUTIVE_OPTIONS} value={revenueConsecutive} onChange={setRevenueConsecutive} />
        </FilterGroup>

        <FilterGroup title="수급">
          <FilterRow label="기관 순매수 (최근 N거래일)">
            <TextInput
              style={styles.rowInput}
              keyboardType="numeric"
              placeholder="예: 20"
              placeholderTextColor={colors.textMuted}
              value={institutionalDaysText}
              onChangeText={setInstitutionalDaysText}
            />
          </FilterRow>
          <FilterRow label="외인 순매수 (최근 N거래일)">
            <TextInput
              style={styles.rowInput}
              keyboardType="numeric"
              placeholder="예: 20"
              placeholderTextColor={colors.textMuted}
              value={foreignDaysText}
              onChangeText={setForeignDaysText}
            />
          </FilterRow>
          <FilterRow label="연기금 순매수 (최근 N거래일)">
            <TextInput
              style={styles.rowInput}
              keyboardType="numeric"
              placeholder="예: 20"
              placeholderTextColor={colors.textMuted}
              value={pensionDaysText}
              onChangeText={setPensionDaysText}
            />
          </FilterRow>
          <Text style={styles.hint}>순매수 합이 0보다 큰 종목을 찾습니다.</Text>
        </FilterGroup>

        <FilterGroup title="공매도">
          <FilterRow label="N거래일 전 대비">
            <TextInput
              style={styles.rowInput}
              keyboardType="numeric"
              placeholder="예: 20"
              placeholderTextColor={colors.textMuted}
              value={shortDaysAgoText}
              onChangeText={setShortDaysAgoText}
            />
          </FilterRow>
          <Select label="공매도 잔고 급감" options={DROP_PCT_OPTIONS} value={shortMinDropPct} onChange={setShortMinDropPct} />
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
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.accent,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  rowInput: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '600',
    textAlign: 'right',
    minWidth: 60,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    paddingBottom: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: colors.surfaceMuted,
  },
  resetButtonText: {
    color: colors.text,
    fontWeight: '700',
  },
  applyButton: {
    backgroundColor: colors.accent,
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
