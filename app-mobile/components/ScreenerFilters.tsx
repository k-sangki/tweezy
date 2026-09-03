import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  INVESTOR_PRESETS,
  PRESET_INFO,
  type ConsecutiveCount,
  type GrowthPeriodType,
  type InvestorPreset,
  type Market,
  type ProfitTurnaroundMode,
  type ScreenerFilter,
  type TechnicalPattern,
  DRAWDOWN_WINDOWS,
  type CapitalImpairmentLevel,
  type DrawdownWindow,
  type TrendDirection,
  type TrendWindow,
} from '@tweezy/core';
import { useTheme, radius, spacing, type Palette } from '../lib/theme';
import { useScreener } from '../lib/ScreenerContext';
import { Checkbox } from './Checkbox';
import { FilterGroup } from './FilterGroup';
import { FilterRow } from './FilterRow';
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

const DIVIDEND_YIELD_OPTIONS = [0, 1, 2, 3, 4, 5].map((n) => ({ label: `${n}%`, value: n }));

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

const MARKET_CAP_OPTIONS = [1000, 2000, 3000, 4000, 5000].map((eok) => ({
  label: `${eok.toLocaleString('ko-KR')}억`,
  value: eok * 100_000_000,
}));

const PRICE_FLOOR_OPTIONS = Array.from({ length: 10 }, (_, i) => (i + 1) * 1000).map((won) => ({
  label: `${won.toLocaleString('ko-KR')}원`,
  value: won,
}));

const TECHNICAL_PATTERNS: { key: TechnicalPattern; label: string; note: string }[] = [
  { key: 'breakoutImminent', label: '전고점 돌파 임박', note: '52주 고점의 90% 이상, 아직 신고가는 아님' },
  { key: 'breakoutDone', label: '전고점 돌파 완료', note: '오늘 52주 신고가를 경신' },
  { key: 'volumeDryUp', label: '거래량 마름', note: '10일 평균 거래량이 50일 평균의 70% 이하' },
  { key: 'boxRange', label: '박스권 갇힘', note: '최근 20일 고저 폭 15% 이내에서 횡보' },
];

const RS_RATING_OPTIONS = [70, 80, 90].map((n) => ({ label: String(n), value: n }));

const TRADING_VALUE_OPTIONS = [1, 3, 5, 10, 30].map((eok) => ({
  label: `${eok}억`,
  value: eok * 100_000_000,
}));

const DRAWDOWN_WINDOW_OPTIONS: { label: string; value: DrawdownWindow }[] =
  DRAWDOWN_WINDOWS.map((n) => ({ label: `${n}일`, value: n }));

const DRAWDOWN_PCT_OPTIONS = [5, 10, 20, 30].map((n) => ({ label: `${n}%`, value: n }));

const IMPAIRMENT_OPTIONS: { label: string; value: CapitalImpairmentLevel }[] = [
  { label: '자본금까지 까먹음', value: 'partial' },
  { label: '자본이 마이너스', value: 'full' },
];

// Absolute 비중 thresholds don't work here: the market's p90 is about 1.2% and
// its maximum about 10%, so "5% 이상" would match a dozen stocks and "10% 이상"
// essentially one. Percentiles keep the filter meaningful as shorting activity
// drifts over time.
const SHORT_PERCENTILE_OPTIONS = [
  { label: '상위 20%', value: 80 },
  { label: '상위 10%', value: 90 },
  { label: '상위 5%', value: 95 },
  { label: '상위 3%', value: 97 },
];

const TREND_DIRECTION_OPTIONS: { label: string; value: TrendDirection }[] = [
  { label: '늘어남', value: 'rising' },
  { label: '줄어듦', value: 'falling' },
  { label: '둘 다', value: 'either' },
];

// A calendar month is ~20 trading days, so "20일" and "1개월" would be the same
// filter; the longer windows are labelled by month instead.
const TREND_WINDOW_OPTIONS: { label: string; value: TrendWindow }[] = [
  { label: '3일', value: 3 },
  { label: '5일', value: 5 },
  { label: '10일', value: 10 },
  { label: '1개월', value: 20 },
  { label: '2개월', value: 40 },
  { label: '3개월', value: 60 },
];

interface FiltersState {
  markets: Market[];
  dividend: { on: boolean; value: number };
  turnaround: { on: boolean; value: ProfitTurnaroundMode };
  netIncome: { on: boolean; period: GrowthPeriodType; consecutive: ConsecutiveCount };
  revenue: { on: boolean; period: GrowthPeriodType; consecutive: ConsecutiveCount };
  institutional: { on: boolean; days: number };
  foreign: { on: boolean; days: number };
  pension: { on: boolean; days: number };
  shortInterest: { on: boolean; daysAgo: 1 | 2 | 3 | 4 | 5; minDropPct: 5 | 10 | 15 | 20 };
  shortLevel: { on: boolean; percentile: number };
  shortTrend: { on: boolean; direction: TrendDirection; days: TrendWindow };
  marketCap: { on: boolean; value: number };
  tradingValue: { on: boolean; value: number };
  drawdown: { on: boolean; days: DrawdownWindow; minDropPct: number };
  netLoss: { on: boolean };
  operatingLoss: { on: boolean };
  impairment: { on: boolean; level: CapitalImpairmentLevel };
  interestCoverage: { on: boolean };
  priceFloor: { on: boolean; value: number };
  rsRating: { on: boolean; value: number };
  patterns: TechnicalPattern[];
  presets: InvestorPreset[];
}

const INITIAL_STATE: FiltersState = {
  markets: [],
  dividend: { on: false, value: 1 },
  turnaround: { on: false, value: 'yoy' },
  netIncome: { on: false, period: 'quarterly', consecutive: 2 },
  revenue: { on: false, period: 'quarterly', consecutive: 2 },
  institutional: { on: false, days: 5 },
  foreign: { on: false, days: 5 },
  pension: { on: false, days: 5 },
  shortInterest: { on: false, daysAgo: 5, minDropPct: 10 },
  shortLevel: { on: false, percentile: 90 },
  shortTrend: { on: false, direction: 'falling', days: 20 },
  marketCap: { on: false, value: 300_000_000_000 },
  tradingValue: { on: false, value: 100_000_000 },
  drawdown: { on: false, days: 3, minDropPct: 10 },
  netLoss: { on: true },
  operatingLoss: { on: true },
  impairment: { on: false, level: 'partial' },
  interestCoverage: { on: false },
  priceFloor: { on: false, value: 5000 },
  rsRating: { on: false, value: 80 },
  patterns: [],
  presets: [],
};

type RowKey =
  | 'dividend'
  | 'turnaround'
  | 'netIncome'
  | 'revenue'
  | 'institutional'
  | 'foreign'
  | 'pension'
  | 'shortInterest'
  | 'shortLevel'
  | 'shortTrend'
  | 'marketCap'
  | 'tradingValue'
  | 'drawdown'
  | 'netLoss'
  | 'operatingLoss'
  | 'impairment'
  | 'interestCoverage'
  | 'priceFloor'
  | 'rsRating';

const GROUP_ROWS: Record<string, RowKey[]> = {
  valuation: ['dividend'],
  fundamental: ['turnaround', 'netIncome', 'revenue'],
  flow: ['institutional', 'foreign', 'pension'],
  short: ['shortLevel', 'shortTrend', 'shortInterest'],
  loss: ['netLoss', 'operatingLoss'],
  health: ['impairment', 'interestCoverage'],
};

const AVAILABLE_PRESETS = INVESTOR_PRESETS.filter((preset) => PRESET_INFO[preset].available);

export function ScreenerFilters() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { setFilter, marketUptrend } = useScreener();
  // O'Neil's M leg vetoes every name while the index is below its 60-day
  // average, so say that outright rather than leaving a bare "0 종목".
  const marketDowntrend =
    marketUptrend != null && Object.values(marketUptrend).every((state) => state === false);
  const [state, setState] = useState<FiltersState>(INITIAL_STATE);
  const [infoPreset, setInfoPreset] = useState<InvestorPreset | null>(null);

  useEffect(() => {
    const next: ScreenerFilter = {
      markets: state.markets.length > 0 ? state.markets : undefined,
      minDividendYield: state.dividend.on ? state.dividend.value : undefined,
      profitTurnaround: state.turnaround.on ? state.turnaround.value : undefined,
      netIncomeStreak: state.netIncome.on
        ? { period: state.netIncome.period, consecutive: state.netIncome.consecutive }
        : undefined,
      revenueStreak: state.revenue.on
        ? { period: state.revenue.period, consecutive: state.revenue.consecutive }
        : undefined,
      institutionalNetBuyDays: state.institutional.on ? state.institutional.days : undefined,
      foreignNetBuyDays: state.foreign.on ? state.foreign.days : undefined,
      pensionNetBuyDays: state.pension.on ? state.pension.days : undefined,
      shortInterestDrop: state.shortInterest.on
        ? { daysAgo: state.shortInterest.daysAgo, minDropPct: state.shortInterest.minDropPct }
        : undefined,
      minShortInterestPercentile: state.shortLevel.on ? state.shortLevel.percentile : undefined,
      shortInterestTrend: state.shortTrend.on
        ? { direction: state.shortTrend.direction, days: state.shortTrend.days }
        : undefined,
      minMarketCap: state.marketCap.on ? state.marketCap.value : undefined,
      minAvgTradingValue: state.tradingValue.on ? state.tradingValue.value : undefined,
      drawdown: state.drawdown.on
        ? { days: state.drawdown.days, minDropPct: state.drawdown.minDropPct }
        : undefined,
      excludeQuarterlyNetLoss: state.netLoss.on || undefined,
      excludeQuarterlyOperatingLoss: state.operatingLoss.on || undefined,
      excludeCapitalImpairment: state.impairment.on ? state.impairment.level : undefined,
      excludeWeakInterestCoverage: state.interestCoverage.on || undefined,
      excludePriceAtOrBelow: state.priceFloor.on ? state.priceFloor.value : undefined,
      minRsRating: state.rsRating.on ? state.rsRating.value : undefined,
      technicalPatterns: state.patterns.length > 0 ? state.patterns : undefined,
      presets: state.presets.length > 0 ? state.presets : undefined,
    };
    setFilter(next);
  }, [state, setFilter]);

  const patch = <K extends keyof FiltersState>(key: K, value: Partial<FiltersState[K]>) =>
    setState((current) => ({ ...current, [key]: { ...(current[key] as object), ...value } }));

  const setRow = (key: RowKey, on: boolean) =>
    setState((current) => ({ ...current, [key]: { ...current[key], on } }) as FiltersState);

  const groupChecked = (group: keyof typeof GROUP_ROWS) =>
    GROUP_ROWS[group].every((row) => state[row].on);
  const groupIndeterminate = (group: keyof typeof GROUP_ROWS) =>
    !groupChecked(group) && GROUP_ROWS[group].some((row) => state[row].on);
  const toggleGroup = (group: keyof typeof GROUP_ROWS, checked: boolean) =>
    setState((current) => {
      const updates: Record<string, unknown> = {};
      for (const row of GROUP_ROWS[group]) {
        updates[row] = { ...current[row], on: checked };
      }
      return { ...current, ...updates } as FiltersState;
    });

  const toggleMarket = (market: Market) =>
    setState((current) => ({
      ...current,
      markets: current.markets.includes(market)
        ? current.markets.filter((item) => item !== market)
        : [...current.markets, market],
    }));

  const togglePattern = (pattern: TechnicalPattern) =>
    setState((current) => ({
      ...current,
      patterns: current.patterns.includes(pattern)
        ? current.patterns.filter((item) => item !== pattern)
        : [...current.patterns, pattern],
    }));

  const togglePreset = (preset: InvestorPreset) =>
    setState((current) => ({
      ...current,
      presets: current.presets.includes(preset)
        ? current.presets.filter((item) => item !== preset)
        : [...current.presets, preset],
    }));

  return (
    <View style={styles.container}>
      <FilterGroup title="시장" defaultExpanded>
        <View style={styles.chipRow}>
          {ALL_MARKETS.map((market) => {
            const selected = state.markets.includes(market);
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

      <FilterGroup
        title="배당"
        checked={groupChecked('valuation')}
        indeterminate={groupIndeterminate('valuation')}
        onCheckedChange={(checked) => toggleGroup('valuation', checked)}
      >
        <FilterRow
          label="배당수익률"
          checked={state.dividend.on}
          onCheckedChange={(on) => setRow('dividend', on)}
        >
          <Select
            compact
            label="배당수익률"
            options={DIVIDEND_YIELD_OPTIONS}
            value={state.dividend.value}
            onChange={(value) => patch('dividend', { value, on: true })}
          />
          <Text style={styles.rowText}>이상</Text>
        </FilterRow>
      </FilterGroup>

      <FilterGroup
        title="시가총액"
        checked={state.marketCap.on}
        onCheckedChange={(on) => setRow('marketCap', on)}
        titleControls={
          <>
            <Select
              compact
              label="시가총액 기준"
              options={MARKET_CAP_OPTIONS}
              value={state.marketCap.value}
              onChange={(value) => patch('marketCap', { value, on: true })}
            />
            <Text style={styles.titleTail}>이상</Text>
          </>
        }
      />

      <FilterGroup
        title="하루 거래대금"
        note="너무 안 팔리는 종목 거르기"
        checked={state.tradingValue.on}
        onCheckedChange={(on) => setRow('tradingValue', on)}
        titleControls={
          <>
            <Select
              compact
              label="하루 평균 거래대금 기준"
              options={TRADING_VALUE_OPTIONS}
              value={state.tradingValue.value}
              onChange={(value) => patch('tradingValue', { value, on: true })}
            />
            <Text style={styles.titleTail}>이상</Text>
          </>
        }
      />

      <FilterGroup
        title="많이 떨어진 종목"
        note="짧게 급락한 종목을 찾을 때"
        checked={state.drawdown.on}
        onCheckedChange={(on) => setRow('drawdown', on)}
        titleControls={
          <>
            <Select
              compact
              label="하락을 볼 기간"
              options={DRAWDOWN_WINDOW_OPTIONS}
              value={state.drawdown.days}
              onChange={(days) => patch('drawdown', { days, on: true })}
            />
            <Select
              compact
              label="하락률"
              options={DRAWDOWN_PCT_OPTIONS}
              value={state.drawdown.minDropPct}
              onChange={(minDropPct) => patch('drawdown', { minDropPct, on: true })}
            />
            <Text style={styles.titleTail}>하락</Text>
          </>
        }
      />

      <FilterGroup
        title="최근 분기 적자 기업 제외"
        checked={groupChecked('loss')}
        indeterminate={groupIndeterminate('loss')}
        onCheckedChange={(checked) => toggleGroup('loss', checked)}
      >
        <FilterRow
          label="최종적으로 손해 (순이익 적자)"
          checked={state.netLoss.on}
          onCheckedChange={(on) => setRow('netLoss', on)}
        />
        <FilterRow
          label="본업에서 손해 (영업이익 적자)"
          checked={state.operatingLoss.on}
          onCheckedChange={(on) => setRow('operatingLoss', on)}
        />
        <Text style={styles.groupHint}>재무 데이터가 없는 종목은 제외하지 않습니다.</Text>
      </FilterGroup>

      <FilterGroup
        title="재정이 위험한 기업 제외"
        checked={groupChecked('health')}
        indeterminate={groupIndeterminate('health')}
        onCheckedChange={(checked) => toggleGroup('health', checked)}
      >
        <FilterRow
          label="자본잠식"
          checked={state.impairment.on}
          onCheckedChange={(on) => setRow('impairment', on)}
        >
          <Select
            compact
            label="어디까지 제외할지"
            options={IMPAIRMENT_OPTIONS}
            value={state.impairment.level}
            onChange={(level) => patch('impairment', { level, on: true })}
          />
        </FilterRow>
        <FilterRow
          label="번 돈으로 이자도 못 갚음"
          note="영업이익 < 이자비용이 3년 연속 (이자보상배율 1 미만)"
          checked={state.interestCoverage.on}
          onCheckedChange={(on) => setRow('interestCoverage', on)}
        />
        <FilterRow
          label="감사의견 비적정"
          checked={false}
          onCheckedChange={() => {}}
          unavailable
          note="데이터 준비 중 - 감사의견은 OpenDART 재무 API에 없어 별도 수집이 필요합니다"
        />
        <Text style={styles.groupHint}>
          재무 데이터가 없는 종목은 제외하지 않습니다. 이자비용은 시가총액 3,000억 이상 종목만 수집됩니다.
        </Text>
      </FilterGroup>

      <FilterGroup
        title="너무 싼 주식 제외"
        checked={state.priceFloor.on}
        onCheckedChange={(on) => setRow('priceFloor', on)}
        titleControls={
          <>
            <Select
              compact
              label="제외할 주가 기준"
              options={PRICE_FLOOR_OPTIONS}
              value={state.priceFloor.value}
              onChange={(value) => patch('priceFloor', { value, on: true })}
            />
            <Text style={styles.titleTail}>이하</Text>
          </>
        }
      />

      <FilterGroup
        title="기업 기초체력"
        checked={groupChecked('fundamental')}
        indeterminate={groupIndeterminate('fundamental')}
        onCheckedChange={(checked) => toggleGroup('fundamental', checked)}
      >
        <FilterRow
          label="최근 분기"
          checked={state.turnaround.on}
          onCheckedChange={(on) => setRow('turnaround', on)}
        >
          <Select
            compact
            label="최근 분기 흑자전환"
            options={TURNAROUND_OPTIONS}
            value={state.turnaround.value}
            onChange={(value) => patch('turnaround', { value, on: true })}
          />
          <Text style={styles.rowText}>흑자전환</Text>
        </FilterRow>
        <FilterRow
          label="순이익 지속상승"
          checked={state.netIncome.on}
          onCheckedChange={(on) => setRow('netIncome', on)}
        >
          <RadioGroup
            compact
            options={PERIOD_OPTIONS}
            value={state.netIncome.period}
            onChange={(period) => patch('netIncome', { period, on: true })}
          />
          <Text style={styles.rowText}>연속</Text>
          <Select
            compact
            label="순이익 연속 상승 횟수"
            options={CONSECUTIVE_OPTIONS}
            value={state.netIncome.consecutive}
            onChange={(consecutive) => patch('netIncome', { consecutive, on: true })}
          />
        </FilterRow>
        <FilterRow
          label="매출 지속상승"
          checked={state.revenue.on}
          onCheckedChange={(on) => setRow('revenue', on)}
        >
          <RadioGroup
            compact
            options={PERIOD_OPTIONS}
            value={state.revenue.period}
            onChange={(period) => patch('revenue', { period, on: true })}
          />
          <Text style={styles.rowText}>연속</Text>
          <Select
            compact
            label="매출 연속 상승 횟수"
            options={CONSECUTIVE_OPTIONS}
            value={state.revenue.consecutive}
            onChange={(consecutive) => patch('revenue', { consecutive, on: true })}
          />
        </FilterRow>
      </FilterGroup>

      <FilterGroup
        title="수급"
        checked={groupChecked('flow')}
        indeterminate={groupIndeterminate('flow')}
        onCheckedChange={(checked) => toggleGroup('flow', checked)}
      >
        {([
          ['institutional', '기관'],
          ['foreign', '외인'],
          ['pension', '연기금'],
        ] as const).map(([key, label]) => (
          <FilterRow
            key={key}
            label={`${label} 연속 순매수 최근`}
            checked={state[key].on}
            onCheckedChange={(on) => setRow(key, on)}
          >
            <Select
              compact
              label={`${label} 연속 순매수 거래일`}
              options={NET_BUY_DAYS_OPTIONS}
              value={state[key].days}
              onChange={(days) => patch(key, { days, on: true })}
            />
            <Text style={styles.rowText}>거래일</Text>
          </FilterRow>
        ))}
      </FilterGroup>

      <FilterGroup
        title="공매도"
        checked={groupChecked('short')}
        indeterminate={groupIndeterminate('short')}
        onCheckedChange={(checked) => toggleGroup('short', checked)}
      >
        <FilterRow
          label="공매도가 많이 쌓인 종목"
          note="상장주식 수 대비 잔고 비중이 전체 종목 중 상위권"
          checked={state.shortLevel.on}
          onCheckedChange={(on) => setRow('shortLevel', on)}
        >
          <Select
            compact
            label="공매도 잔고 비중 상위"
            options={SHORT_PERCENTILE_OPTIONS}
            value={state.shortLevel.percentile}
            onChange={(percentile) => patch('shortLevel', { percentile, on: true })}
          />
        </FilterRow>
        <FilterRow
          label="공매도 잔고 추세"
          note="기간 동안 잔고가 20% 이상 꾸준히 움직인 종목만"
          checked={state.shortTrend.on}
          onCheckedChange={(on) => setRow('shortTrend', on)}
        >
          <Select
            compact
            label="추세를 볼 기간"
            options={TREND_WINDOW_OPTIONS}
            value={state.shortTrend.days}
            onChange={(days) => patch('shortTrend', { days, on: true })}
          />
          <Text style={styles.rowText}>동안</Text>
          <RadioGroup
            compact
            options={TREND_DIRECTION_OPTIONS}
            value={state.shortTrend.direction}
            onChange={(direction) => patch('shortTrend', { direction, on: true })}
          />
        </FilterRow>
        <FilterRow
          label="공매도 세력이 발 빼는 중"
          checked={state.shortInterest.on}
          onCheckedChange={(on) => setRow('shortInterest', on)}
        >
          <Select
            compact
            label="며칠 전과 비교할지"
            options={SHORT_DAYS_AGO_OPTIONS}
            value={state.shortInterest.daysAgo}
            onChange={(daysAgo) => patch('shortInterest', { daysAgo, on: true })}
          />
          <Text style={styles.rowText}>거래일 전대비</Text>
          <Select
            compact
            label="감소율"
            options={SHORT_DROP_PCT_OPTIONS}
            value={state.shortInterest.minDropPct}
            onChange={(minDropPct) => patch('shortInterest', { minDropPct, on: true })}
          />
        </FilterRow>
      </FilterGroup>

      <FilterGroup
        title="투자 대가 프리셋"
        checked={AVAILABLE_PRESETS.every((preset) => state.presets.includes(preset))}
        indeterminate={state.presets.length > 0 && state.presets.length < AVAILABLE_PRESETS.length}
        onCheckedChange={(checked) =>
          setState((current) => ({ ...current, presets: checked ? [...AVAILABLE_PRESETS] : [] }))
        }
      >
        <Text style={styles.groupHint}>여러 명을 함께 선택하면 조건이 모두 겹치는 종목만 남습니다.</Text>
        {INVESTOR_PRESETS.map((preset) => {
          const info = PRESET_INFO[preset];
          const pending = info.criteria.filter((criterion) => !criterion.applied).length;
          return (
            <FilterRow
              key={preset}
              label={info.name}
              checked={state.presets.includes(preset)}
              onCheckedChange={() => togglePreset(preset)}
              unavailable={!info.available}
              note={
                !info.available
                  ? '데이터 준비 중 - 재무제표 항목이 더 수집되면 활성화됩니다'
                  : preset === 'oneil' && marketDowntrend
                    ? '지수가 60일선 아래입니다 (M 조건) - 지금은 결과가 나오지 않습니다'
                    : pending > 0
                      ? `일부 기준만 적용 중 (${pending}개 기준은 데이터 준비 중)`
                      : undefined
              }
            >
              <Text style={styles.tagline}>{info.tagline}</Text>
              <Pressable onPress={() => setInfoPreset(preset)} hitSlop={8}>
                <Text style={styles.infoMark}>!</Text>
              </Pressable>
            </FilterRow>
          );
        })}
      </FilterGroup>

      <FilterGroup
        title="IBD 상대강도"
        checked={state.rsRating.on}
        onCheckedChange={(on) => setRow('rsRating', on)}
        titleControls={
          <>
            <Text style={styles.titleTail}>RS</Text>
            <Select
              compact
              label="IBD RS Rating 하한"
              options={RS_RATING_OPTIONS}
              value={state.rsRating.value}
              onChange={(value) => patch('rsRating', { value, on: true })}
            />
            <Text style={styles.titleTail}>이상</Text>
          </>
        }
      />

      <FilterGroup
        title="기술적 패턴"
        checked={state.patterns.length === TECHNICAL_PATTERNS.length}
        indeterminate={state.patterns.length > 0 && state.patterns.length < TECHNICAL_PATTERNS.length}
        onCheckedChange={(checked) =>
          setState((current) => ({
            ...current,
            patterns: checked ? TECHNICAL_PATTERNS.map((pattern) => pattern.key) : [],
          }))
        }
      >
        <Text style={styles.groupHint}>여러 개를 고르면 조건을 모두 만족하는 종목만 남습니다.</Text>
        {TECHNICAL_PATTERNS.map((pattern) => (
          <FilterRow
            key={pattern.key}
            label={pattern.label}
            note={pattern.note}
            checked={state.patterns.includes(pattern.key)}
            onCheckedChange={() => togglePattern(pattern.key)}
          />
        ))}
      </FilterGroup>

      <Modal
        visible={infoPreset != null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoPreset(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setInfoPreset(null)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            {infoPreset ? <PresetInfoSheet preset={infoPreset} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function PresetInfoSheet({ preset }: { preset: InvestorPreset }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const info = PRESET_INFO[preset];
  return (
    <View>
      <Text style={styles.sheetTitle}>{info.name}</Text>
      <Text style={styles.sheetTagline}>{info.tagline}</Text>
      <Text style={styles.sheetBody}>{info.description}</Text>
      <Text style={styles.sheetSection}>스크리닝 기준</Text>
      {info.criteria.map((criterion) => (
        <View key={criterion.label} style={styles.criterionRow}>
          <Text style={[styles.criterionMark, criterion.applied ? styles.criterionOn : styles.criterionOff]}>
            {criterion.applied ? '✓' : '·'}
          </Text>
          <Text style={[styles.criterionText, !criterion.applied && styles.criterionTextOff]}>
            {criterion.label}
            {criterion.applied ? '' : ' (준비 중)'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
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
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    color: colors.textMuted,
    fontWeight: '600',
    overflow: 'hidden',
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    color: colors.accent,
  },
  rowText: {
    fontSize: 14,
    color: colors.text,
  },
  titleTail: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  tagline: {
    fontSize: 12,
    color: colors.textMuted,
  },
  infoMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
  groupHint: {
    fontSize: 12,
    color: colors.textMuted,
    paddingBottom: spacing.xs,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  sheetTagline: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
    marginTop: 2,
  },
  sheetBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    marginTop: spacing.md,
  },
  sheetSection: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  criterionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 3,
  },
  criterionMark: {
    fontSize: 13,
    fontWeight: '700',
    width: 12,
  },
  criterionOn: {
    color: colors.accent,
  },
  criterionOff: {
    color: colors.textMuted,
  },
  criterionText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  criterionTextOff: {
    color: colors.textMuted,
  },
});
