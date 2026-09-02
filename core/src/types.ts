export type Market = 'KOSPI' | 'KOSDAQ';

export interface Stock {
  ticker: string;
  name: string;
  market: Market;
  price: number;
  marketCap: number;
  per: number | null;
  pbr: number | null;
  dividendYield: number | null;
  /** OpenDART 8-digit corp_code, when known. Needed to query disclosures for this stock. */
  corpCode?: string | null;
  /**
   * Standalone-period net income / revenue, most recent first. Quarterly
   * arrays hold up to the last 5 quarters (index 4 = same quarter one
   * year ago); annual arrays hold up to the last 5 fiscal years. A gap
   * (period with no filed data) is `null`, not omitted, so index position
   * stays meaningful.
   */
  quarterlyNetIncome?: (number | null)[];
  quarterlyRevenue?: (number | null)[];
  annualNetIncome?: (number | null)[];
  annualRevenue?: (number | null)[];
  /**
   * Daily net-buy volume by investor type and daily short-interest
   * balance (shares), most recent trading day first, up to ~60 days.
   */
  institutionalNetBuy?: (number | null)[];
  foreignNetBuy?: (number | null)[];
  pensionNetBuy?: (number | null)[];
  shortInterestBalance?: (number | null)[];
}

/** 'qoq' = 직전 분기 대비 흑자전환, 'yoy' = 전년 동기 대비 흑자전환 */
export type ProfitTurnaroundMode = 'qoq' | 'yoy';

export type GrowthPeriodType = 'quarterly' | 'annual';

export interface GrowthStreakFilter {
  period: GrowthPeriodType;
  /** Number of consecutive period-over-period increases required. */
  consecutive: 1 | 2 | 3 | 4;
}

export interface ShortInterestDropFilter {
  /** Compare today's balance against this many trading days ago. */
  daysAgo: number;
  minDropPct: 5 | 10 | 20;
}

export interface ScreenerFilter {
  markets?: Market[];
  minMarketCap?: number;
  maxMarketCap?: number;
  minPbr?: number;
  maxPbr?: number;
  minDividendYield?: number;
  profitTurnaround?: ProfitTurnaroundMode;
  netIncomeStreak?: GrowthStreakFilter;
  revenueStreak?: GrowthStreakFilter;
  /** Net buying (sum > 0) over the last N trading days. Presence of a value = filter active. */
  institutionalNetBuyDays?: number;
  foreignNetBuyDays?: number;
  pensionNetBuyDays?: number;
  shortInterestDrop?: ShortInterestDropFilter;
}
