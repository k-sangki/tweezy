import { matchesPreset } from './presets';
import type {
  GrowthStreakFilter,
  ProfitTurnaroundMode,
  ScreenerFilter,
  ShortInterestDropFilter,
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
    if (filter.excludeQuarterlyNetLoss && isLatestPeriodLoss(stock.quarterlyNetIncome)) {
      return false;
    }
    if (filter.excludeQuarterlyOperatingLoss && isLatestPeriodLoss(stock.quarterlyOperatingProfit)) {
      return false;
    }
    if (filter.excludePriceAtOrBelow != null && stock.price <= filter.excludePriceAtOrBelow) {
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
