import { matchesPreset } from './presets';
import type {
  CapitalImpairmentLevel,
  DrawdownFilter,
  GrowthStreakFilter,
  ProfitTurnaroundMode,
  ScreenerFilter,
  ShortInterestDropFilter,
  ShortInterestTrendFilter,
  Stock,
  TechnicalPattern,
} from './types';

/** A stock is "approaching" its high once it's within 10% of it, but hasn't printed a new one. */
const BREAKOUT_IMMINENT_MIN_PCT = 90;

export function matchesTechnicalPattern(stock: Stock, pattern: TechnicalPattern): boolean {
  switch (pattern) {
    case 'breakoutImminent':
      return !stock.newHigh52 && stock.high52Pct != null && stock.high52Pct >= BREAKOUT_IMMINENT_MIN_PCT;
    case 'breakoutDone':
      return stock.newHigh52 === true;
    case 'volumeDryUp':
      return stock.volumeDryUp === true;
    case 'boxRange':
      return stock.boxRange === true;
    case 'maAlignedShort':
      return stock.maAlignedShort === true;
    case 'maAlignedLong':
      return stock.maAlignedLong === true;
  }
}

/** 'yoy' compares against the same quarter one year ago (index 4 in a most-recent-first quarterly series). */
const YOY_QUARTER_OFFSET = 4;

export function hasIncreasingStreak(series: (number | null)[] | undefined, consecutive: number): boolean {
  if (!series) return false;
  const needed = consecutive + 1;
  if (series.length < needed) return false;
  for (let i = 0; i < consecutive; i++) {
    const newer = series[i];
    const older = series[i + 1];
    if (newer == null || older == null || newer <= older) return false;
  }
  return true;
}

export function isProfitTurnaround(
  quarterlyNetIncome: (number | null)[] | undefined,
  mode: ProfitTurnaroundMode,
): boolean {
  if (!quarterlyNetIncome) return false;
  const latest = quarterlyNetIncome[0];
  if (latest == null || latest <= 0) return false;
  const compareIndex = mode === 'qoq' ? 1 : YOY_QUARTER_OFFSET;
  const compare = quarterlyNetIncome[compareIndex];
  return compare != null && compare <= 0;
}

/**
 * YoY growth (%) of the most recent standalone quarter vs the same quarter a
 * year earlier. A non-positive base makes a percentage meaningless (and would
 * flip the sign for a loss-to-profit swing), so that reads as unknown, same
 * as everywhere else in this codebase that computes a YoY percent.
 */
export function quarterlyYoyGrowthPct(series: (number | null)[] | undefined): number | null {
  if (!series) return null;
  const latest = series[0];
  const prior = series[YOY_QUARTER_OFFSET];
  if (latest == null || prior == null || prior <= 0) return null;
  return (latest / prior - 1) * 100;
}

function seriesFor(stock: Stock, streak: GrowthStreakFilter, kind: 'netIncome' | 'revenue'): (number | null)[] | undefined {
  const quarterly = kind === 'netIncome' ? stock.quarterlyNetIncome : stock.quarterlyRevenue;
  const annual = kind === 'netIncome' ? stock.annualNetIncome : stock.annualRevenue;
  return streak.period === 'quarterly' ? quarterly : annual;
}

/** True if every one of the last `days` trading days had positive net buying. */
export function hasConsecutiveNetBuy(series: (number | null)[] | undefined, days: number): boolean {
  if (!series || days <= 0 || series.length < days) return false;
  for (let i = 0; i < days; i++) {
    const value = series[i];
    if (value == null || value <= 0) return false;
  }
  return true;
}

/**
 * True only when the most recent period is a confirmed loss. An unknown value
 * returns false so an exclusion filter doesn't drop names it can't judge.
 */
export function isLatestPeriodLoss(series: (number | null)[] | undefined): boolean {
  const latest = series?.[0];
  return latest != null && latest < 0;
}

/**
 * A trend has to be more than one day's noise, so the window is fitted with a
 * least-squares line rather than compared end-to-end, and the fitted change
 * across the window must be at least this share of the window's average
 * balance. Without the floor a flat series still has a tiny non-zero slope and
 * every stock would land in one direction or the other. 20% is the 증감률
 * threshold the project's filter spec calls for.
 */
const MIN_TREND_CHANGE_RATIO = 0.2;

/**
 * True when the balance is consistently rising/falling over the last `days`
 * trading days. `series` is most-recent-first.
 */
export function hasShortInterestTrend(
  series: (number | null)[] | undefined,
  { direction, days }: ShortInterestTrendFilter,
): boolean {
  if (!series || series.length < days) return false;
  // Oldest-first, so a positive slope means the balance grew over time.
  const window: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const value = series[i];
    if (value == null) return false;
    window.push(value);
  }

  const n = window.length;
  const meanX = (n - 1) / 2;
  const mean = window.reduce((sum, value) => sum + value, 0) / n;
  if (mean <= 0) return false;

  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (i - meanX) * (window[i] - mean);
    variance += (i - meanX) ** 2;
  }
  if (variance === 0) return false;

  const fittedChange = (covariance / variance) * (n - 1);
  if (Math.abs(fittedChange) < mean * MIN_TREND_CHANGE_RATIO) return false;
  if (direction === 'either') return true;
  return direction === 'rising' ? fittedChange > 0 : fittedChange < 0;
}

/**
 * 자본잠식: equity has been eaten into the paid-in capital ('partial'), or
 * wiped out entirely ('full'). Null when it can't be judged, so an exclusion
 * doesn't drop companies whose balance sheet we don't have.
 */
export function capitalImpairment(stock: Stock): CapitalImpairmentLevel | null {
  const equity = stock.annualTotalEquity?.[0];
  if (equity == null) return null;
  if (equity <= 0) return 'full';
  const capital = stock.annualCapitalStock?.[0];
  if (capital == null || capital <= 0) return null;
  return equity < capital ? 'partial' : null;
}

/** 이자보상배율 = 영업이익 / 이자비용, for the fiscal year at `offset`. */
export function interestCoverage(stock: Stock, offset = 0): number | null {
  const operating = stock.annualOperatingProfit?.[offset];
  const interest = stock.annualInterestExpense?.[offset];
  if (operating == null || interest == null || interest <= 0) return null;
  return operating / interest;
}

/**
 * The 좀비기업 test: operating profit failed to cover interest three years
 * running. Requires all three years - two bad years and one unknown is not a
 * confirmed three-year streak.
 */
export function hasWeakInterestCoverage(stock: Stock): boolean {
  for (let offset = 0; offset < 3; offset++) {
    const coverage = interestCoverage(stock, offset);
    if (coverage == null || coverage >= 1) return false;
  }
  return true;
}

/**
 * True when the stock has fallen at least `minDropPct` over the window.
 * An unknown change is not a match: a drawdown screen has to see the fall.
 */
export function hasDrawdown(stock: Stock, { days, minDropPct }: DrawdownFilter): boolean {
  const change = stock.priceChanges?.[String(days)];
  return change != null && change <= -minDropPct;
}

export function hasShortInterestDrop(
  series: (number | null)[] | undefined,
  { daysAgo, minDropPct }: ShortInterestDropFilter,
): boolean {
  if (!series) return false;
  const current = series[0];
  const past = series[daysAgo];
  if (current == null || past == null || past <= 0) return false;
  const dropPct = (1 - current / past) * 100;
  return dropPct >= minDropPct;
}

export function applyFilters(stocks: Stock[], filter: ScreenerFilter): Stock[] {
  return stocks.filter((stock) => {
    if (filter.markets && !filter.markets.includes(stock.market)) return false;
    if (filter.minMarketCap != null && stock.marketCap < filter.minMarketCap) return false;
    if (filter.maxMarketCap != null && stock.marketCap > filter.maxMarketCap) return false;
    if (filter.minPbr != null && (stock.pbr == null || stock.pbr < filter.minPbr)) return false;
    if (filter.maxPbr != null && (stock.pbr == null || stock.pbr > filter.maxPbr)) return false;
    // A 0% floor is not a constraint - it must not drop names just because
    // their yield is unknown, or "0% 이상" would silently exclude every
    // non-dividend-payer.
    if (
      filter.minDividendYield != null &&
      filter.minDividendYield > 0 &&
      (stock.dividendYield == null || stock.dividendYield < filter.minDividendYield)
    ) {
      return false;
    }
    if (filter.profitTurnaround && !isProfitTurnaround(stock.quarterlyNetIncome, filter.profitTurnaround)) {
      return false;
    }
    if (filter.netIncomeStreak && !hasIncreasingStreak(seriesFor(stock, filter.netIncomeStreak, 'netIncome'), filter.netIncomeStreak.consecutive)) {
      return false;
    }
    if (filter.revenueStreak && !hasIncreasingStreak(seriesFor(stock, filter.revenueStreak, 'revenue'), filter.revenueStreak.consecutive)) {
      return false;
    }
    if (filter.minRevenueGrowthYoY != null) {
      const growth = quarterlyYoyGrowthPct(stock.quarterlyRevenue);
      if (growth == null || growth < filter.minRevenueGrowthYoY) return false;
    }
    if (filter.minDilutedEpsGrowthYoY != null) {
      const growth = quarterlyYoyGrowthPct(stock.quarterlyDilutedEps);
      if (growth == null || growth < filter.minDilutedEpsGrowthYoY) return false;
    }
    if (filter.institutionalNetBuyDays != null && !hasConsecutiveNetBuy(stock.institutionalNetBuy, filter.institutionalNetBuyDays)) {
      return false;
    }
    if (filter.foreignNetBuyDays != null && !hasConsecutiveNetBuy(stock.foreignNetBuy, filter.foreignNetBuyDays)) {
      return false;
    }
    if (filter.pensionNetBuyDays != null && !hasConsecutiveNetBuy(stock.pensionNetBuy, filter.pensionNetBuyDays)) {
      return false;
    }
    if (filter.shortInterestDrop && !hasShortInterestDrop(stock.shortInterestBalance, filter.shortInterestDrop)) {
      return false;
    }
    if (
      filter.minShortInterestPercentile != null &&
      (stock.shortInterestPercentile == null ||
        stock.shortInterestPercentile < filter.minShortInterestPercentile)
    ) {
      return false;
    }
    if (filter.shortInterestTrend && !hasShortInterestTrend(stock.shortInterestBalance, filter.shortInterestTrend)) {
      return false;
    }
    if (filter.excludeQuarterlyNetLoss && isLatestPeriodLoss(stock.quarterlyNetIncome)) {
      return false;
    }
    if (filter.excludeQuarterlyOperatingLoss && isLatestPeriodLoss(stock.quarterlyOperatingProfit)) {
      return false;
    }
    if (filter.excludeCapitalImpairment) {
      const level = capitalImpairment(stock);
      // 'partial' is the looser screen: it drops both levels.
      if (level === 'full' || (level === 'partial' && filter.excludeCapitalImpairment === 'partial')) {
        return false;
      }
    }
    if (filter.excludeWeakInterestCoverage && hasWeakInterestCoverage(stock)) {
      return false;
    }
    if (filter.excludePriceAtOrBelow != null && stock.price <= filter.excludePriceAtOrBelow) {
      return false;
    }
    if (
      filter.minAvgTradingValue != null &&
      (stock.avgTradingValue == null || stock.avgTradingValue < filter.minAvgTradingValue)
    ) {
      return false;
    }
    if (filter.drawdown && !hasDrawdown(stock, filter.drawdown)) {
      return false;
    }
    if (filter.minRsRating != null && (stock.rsRating == null || stock.rsRating < filter.minRsRating)) {
      return false;
    }
    if (filter.technicalPatterns?.some((pattern) => !matchesTechnicalPattern(stock, pattern))) {
      return false;
    }
    if (filter.presets?.some((preset) => !matchesPreset(stock, preset))) {
      return false;
    }
    return true;
  });
}
