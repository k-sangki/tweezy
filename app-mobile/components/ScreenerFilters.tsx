import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type {
  ConsecutiveCount,
  GrowthPeriodType,
  Market,
  ProfitTurnaroundMode,
  ScreenerFilter,
} from '@tweezy/core';
import { colors, spacing } from '../lib/theme';
import { useScreener } from '../lib/ScreenerContext';
import { FilterGroup } from './FilterGroup';
import { RadioGroup } from './RadioGroup';
import { Select } from './Select';

const ALL_MARKETS: Market[] = ['KOSPI', 'KOSDAQ'];

const TURNAROUND_OPTIONS: { label: string; value: ProfitTurnaroundMode }[] = [
  { label: '직전분기 대비', value: 'qoq' },
  { label: '전년동기 대비', value: 'yoy' },
];

const PERIOD_OPTIONS: { label: string; value: GrowthPeriodType }[] = [
  { label: '분기', value: 'quarterly' },
  { label: '연간', value: 'annual' },
];

const CONSECUTIVE_OPTIONS: { label: string; value: ConsecutiveCount }[] = [1, 2, 3, 4, 5].map((n) => ({
  label: String(n),
  value: n as ConsecutiveCount,
}));

const DIVIDEND_YIELD_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ label: `${n}%`, value: n }));

const NET_BUY_DAYS_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({
  label: String(n),
  value: n,
}));

const SHORT_DAYS_AGO_OPTIONS: { label: string; value: 1 | 2 | 3 | 4 | 5 }[] = [1, 2, 3, 4, 5].map((n) => ({
  label: String(n),
  value: n as 1 | 2 | 3 | 4 | 5,
}));

const SHORT_DROP_PCT_OPTIONS: { label: string; value: 5 | 10 | 15 | 20 }[] = [5, 10, 15, 20].map((n) => ({
  label: `${n}%`,
  value: n as 5 | 10 | 15 | 20,
}));

export function ScreenerFilters() {
  const { setFilter } = useScreener();

  const [markets, setMarkets] = useState<Market[]>([]);

  const [valuationEnabled, setValuationEnabled] = useState(false);
  const [minDividendYield, setMinDividendYield] = useState(1);

  const [fundamentalEnabled, setFundamentalEnabled] = useState(false);
  const [profitTurnaround, setProfitTurnaround] = useState<ProfitTurnaroundMode>('yoy');
  const [netIncomePeriod, setNetIncomePeriod] = useState<GrowthPeriodType>('quarterly');
  const [netIncomeConsecutive, setNetIncomeConsecutive] = useState<ConsecutiveCount>(2);
  const [revenuePeriod, setRevenuePeriod] = useState<GrowthPeriodType>('quarterly');
  const [revenueConsecutive, setRevenueConsecutive] = useState<ConsecutiveCount>(2);

  const [flowEnabled, setFlowEnabled] = useState(false);
  const [institutionalDays, setInstitutionalDays] = useState(5);
  const [foreignDays, setForeignDays] = useState(5);
  const [pensionDays, setPensionDays] = useState(5);

  const [shortEnabled, setShortEnabled] = useState(false);
  const [shortDaysAgo, setShortDaysAgo] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [shortMinDropPct, setShortMinDropPct] = useState<5 | 10 | 15 | 20>(10);

  useEffect(() => {
    const next: ScreenerFilter = {
      markets: markets.length > 0 ? markets : undefined,
      minDividendYield: valuationEnabled ? minDividendYield : undefined,
      profitTurnaround: fundamentalEnabled ? profitTurnaround : undefined,
      netIncomeStreak: fundamentalEnabled ? { period: netIncomePeriod, consecutive: netIncomeConsecutive } : undefined,
      revenueStreak: fundamentalEnabled ? { period: revenuePeriod, consecutive: revenueConsecutive } : undefined,
      institutionalNetBuyDays: flowEnabled ? institutionalDays : undefined,
      foreignNetBuyDays: flowEnabled ? foreignDays : undefined,
      pensionNetBuyDays: flowEnabled ? pensionDays : undefined,
      shortInterestDrop: shortEnabled ? { daysAgo: shortDaysAgo, minDropPct: shortMinDropPct } : undefined,
    };
    setFilter(next);
  }, [
    markets,
    valuationEnabled,
    minDividendYield,
    fundamentalEnabled,
    profitTurnaround,
    netIncomePeriod,
    netIncomeConsecutive,
    revenuePeriod,
    revenueConsecutive,
    flowEnabled,
    institutionalDays,
    foreignDays,
    pensionDays,
    shortEnabled,
    shortDaysAgo,
    shortMinDropPct,
    setFilter,
  ]);

  const toggleMarket = (market: Market) => {
    setMarkets((current) =>
      current.includes(market) ? current.filter((item) => item !== market) : [...current, market],
    );
  };

  return (
    <View style={styles.container}>
      <FilterGroup title="시장" defaultExpanded>
        <View style={styles.chipRow}>
          {ALL_MARKETS.map((market) => {
            const selected = markets.includes(market);
            return (
              <Text
                key={market}
                onPress={() => toggleMarket(market)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                {market}
              </Text>
            );
          })}
        </View>
      </FilterGroup>

      <FilterGroup title="밸류에이션" checked={valuationEnabled} onCheckedChange={setValuationEnabled}>
        <View style={styles.inlineRow}>
          <Text style={styles.rowText}>배당수익률</Text>
          <Select compact label="배당수익률" options={DIVIDEND_YIELD_OPTIONS} value={minDividendYield} onChange={setMinDividendYield} />
          <Text style={styles.rowText}>이상</Text>
        </View>
      </FilterGroup>

      <FilterGroup title="펀더멘털" checked={fundamentalEnabled} onCheckedChange={setFundamentalEnabled}>
        <View style={styles.inlineRow}>
          <Text style={styles.rowText}>최근 분기</Text>
          <Select compact label="최근 분기 흑자전환" options={TURNAROUND_OPTIONS} value={profitTurnaround} onChange={setProfitTurnaround} />
          <Text style={styles.rowText}>흑자전환</Text>
        </View>
        <View style={styles.inlineRow}>
          <Text style={styles.rowText}>순이익 지속상승</Text>
          <RadioGroup compact options={PERIOD_OPTIONS} value={netIncomePeriod} onChange={setNetIncomePeriod} />
          <Text style={styles.rowText}>연속</Text>
          <Select compact label="순이익 연속 상승 횟수" options={CONSECUTIVE_OPTIONS} value={netIncomeConsecutive} onChange={setNetIncomeConsecutive} />
        </View>
        <View style={styles.inlineRow}>
          <Text style={styles.rowText}>매출 지속상승</Text>
          <RadioGroup compact options={PERIOD_OPTIONS} value={revenuePeriod} onChange={setRevenuePeriod} />
          <Text style={styles.rowText}>연속</Text>
          <Select compact label="매출 연속 상승 횟수" options={CONSECUTIVE_OPTIONS} value={revenueConsecutive} onChange={setRevenueConsecutive} />
        </View>
      </FilterGroup>

      <FilterGroup title="수급" checked={flowEnabled} onCheckedChange={setFlowEnabled}>
        <View style={styles.inlineRow}>
          <Text style={styles.rowText}>기관 연속 순매수 최근</Text>
          <Select compact label="기관 연속 순매수 거래일" options={NET_BUY_DAYS_OPTIONS} value={institutionalDays} onChange={setInstitutionalDays} />
          <Text style={styles.rowText}>거래일</Text>
        </View>
        <View style={styles.inlineRow}>
          <Text style={styles.rowText}>외인 연속 순매수 최근</Text>
          <Select compact label="외인 연속 순매수 거래일" options={NET_BUY_DAYS_OPTIONS} value={foreignDays} onChange={setForeignDays} />
          <Text style={styles.rowText}>거래일</Text>
        </View>
        <View style={styles.inlineRow}>
          <Text style={styles.rowText}>연기금 연속 순매수 최근</Text>
          <Select compact label="연기금 연속 순매수 거래일" options={NET_BUY_DAYS_OPTIONS} value={pensionDays} onChange={setPensionDays} />
          <Text style={styles.rowText}>거래일</Text>
        </View>
      </FilterGroup>

      <FilterGroup title="공매도" checked={shortEnabled} onCheckedChange={setShortEnabled}>
        <View style={styles.inlineRow}>
          <Text style={styles.rowText}>공매도 잔고 감소</Text>
          <Select compact label="며칠 전과 비교할지" options={SHORT_DAYS_AGO_OPTIONS} value={shortDaysAgo} onChange={setShortDaysAgo} />
          <Text style={styles.rowText}>거래일 전대비</Text>
          <Select compact label="감소율" options={SHORT_DROP_PCT_OPTIONS} value={shortMinDropPct} onChange={setShortMinDropPct} />
        </View>
      </FilterGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    color: colors.textMuted,
    fontWeight: '600',
    overflow: 'hidden',
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    color: colors.accent,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
  },
  rowText: {
    fontSize: 14,
    color: colors.text,
  },
});
