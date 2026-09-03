export type Market = 'KOSPI' | 'KOSDAQ';

export interface Stock {
  ticker: string;
  name: string;
  market: Market;
  price: number;
  /** Regular-session change vs the prior close, percent. See MarketFeedPayload.date for which session this reflects. */
  changePct: number | null;
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
  quarterlyOperatingProfit?: (number | null)[];
  annualNetIncome?: (number | null)[];
  annualRevenue?: (number | null)[];
  annualOperatingProfit?: (number | null)[];
  /**
   * Fiscal-year-end balance sheet snapshots, newest first. No quarterly
   * equivalent exists - a balance sheet is a point in time, not a period.
   * `annualCash` comes only from the full-taxonomy fetch, so it is present
   * for the precise tier and absent for the rest.
   */
  annualTotalLiabilities?: (number | null)[];
  annualTotalEquity?: (number | null)[];
  annualCurrentAssets?: (number | null)[];
  annualCurrentLiabilities?: (number | null)[];
  annualNonCurrentAssets?: (number | null)[];
  annualNonCurrentLiabilities?: (number | null)[];
  annualCapitalStock?: (number | null)[];
  annualCash?: (number | null)[];
  /** 이자비용. Full-taxonomy only, so present for the precise tier alone. */
  annualInterestExpense?: (number | null)[];
  /**
   * Joel Greenblatt's magic-formula standing: the summed rank of earnings
   * yield and return on capital across the market, as a 1-99 percentile where
   * 99 is best. Cross-sectional, so the collector computes it.
   */
  magicFormulaRank?: number | null;
  /**
   * Daily net-buy volume by investor type and daily short-interest
   * balance (shares), most recent trading day first, up to ~60 days.
   */
  institutionalNetBuy?: (number | null)[];
  foreignNetBuy?: (number | null)[];
  pensionNetBuy?: (number | null)[];
  shortInterestBalance?: (number | null)[];
  /**
   * Short-interest balance as a percent of listed shares, as KRX publishes it
   * (비중), plus its 0-99 rank across the universe. The absolute number is
   * small - the whole market's p90 is about 1.2% and its maximum about 10% -
   * so the percentile is what makes a threshold meaningful across time.
   */
  shortInterestRatio?: number | null;
  shortInterestPercentile?: number | null;
  /** KRX listed share count - stands in for float, which KRX doesn't publish. */
  listedShares?: number | null;
  /**
   * Price/volume metrics derived from a year of daily OHLCV by the collector.
   * `rsRating` is the IBD-style 0-99 percentile of a 63/126/189/252-day
   * weighted return; `trendScore` is Minervini's 8-point trend template.
   */
  rsRating?: number | null;
  trendScore?: number | null;
  trendTemplate?: boolean;
  maAligned?: boolean;
  vcp?: boolean;
  newHigh52?: boolean;
  high52Pct?: number | null;
  volumeDryUp?: boolean;
  boxBreakout?: boolean;
  boxRange?: boolean;
  volumeRatio50?: number | null;
  /**
   * Mean daily 거래대금 (KRW) over the last 20 sessions, approximated as
   * 종가 x 거래량 - the adjusted OHLCV feed carries no 거래대금 column.
   */
  avgTradingValue?: number | null;
  /** Percent price change over the last 20 / 60 / 120 trading days. */
  priceChange20d?: number | null;
  priceChange60d?: number | null;
  priceChange120d?: number | null;
  /**
   * Whether this stock's own index was above its 60-day average at collection
   * time. null when the index couldn't be judged - distinct from a measured
   * downtrend, which is `false`.
   */
  marketUptrend?: boolean | null;
}

/** 'qoq' = 직전 분기 대비 흑자전환, 'yoy' = 전년 동기 대비 흑자전환 */
export type ProfitTurnaroundMode = 'qoq' | 'yoy';

export type GrowthPeriodType = 'quarterly' | 'annual';

export type ConsecutiveCount = 1 | 2 | 3 | 4 | 5;

export interface GrowthStreakFilter {
  period: GrowthPeriodType;
  /** Number of consecutive period-over-period increases required. */
  consecutive: ConsecutiveCount;
}

export interface ShortInterestDropFilter {
  /** Compare today's balance against this many trading days ago. */
  daysAgo: 1 | 2 | 3 | 4 | 5;
  minDropPct: 5 | 10 | 15 | 20;
}

/**
 * Trading days a trend is measured over. A calendar month is about 20 trading
 * days, so "20일" and "1개월" would be the same filter - the longer windows are
 * labelled by month instead.
 */
export type TrendWindow = 3 | 5 | 10 | 20 | 40 | 60;

/** 'either' is the 둘다 toggle: a material move in either direction. */
export type TrendDirection = 'rising' | 'falling' | 'either';

export interface ShortInterestTrendFilter {
  direction: TrendDirection;
  days: TrendWindow;
}

export type InvestorPreset = 'buffett' | 'lynch' | 'oneil' | 'graham' | 'minervini' | 'greenblatt';

export type TechnicalPattern = 'breakoutImminent' | 'breakoutDone' | 'volumeDryUp' | 'boxRange';

/**
 * 'full' drops only 완전자본잠식 (자본총계 <= 0); 'partial' also drops
 * 부분자본잠식 (자본총계 < 자본금), which is the earlier warning.
 */
export type CapitalImpairmentLevel = 'full' | 'partial';

/** Trading days a drawdown is measured over. */
export type DrawdownWindow = 20 | 60 | 120;

export interface DrawdownFilter {
  days: DrawdownWindow;
  /** Minimum fall, as a positive percent: 30 means "down 30% or more". */
  minDropPct: number;
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
  /** Net buying every day for the last N consecutive trading days (1-10). Presence of a value = filter active. */
  institutionalNetBuyDays?: number;
  foreignNetBuyDays?: number;
  pensionNetBuyDays?: number;
  shortInterestDrop?: ShortInterestDropFilter;
  /** Keep only stocks in the top (100 - this) percent by short-interest ratio. */
  minShortInterestPercentile?: number;
  shortInterestTrend?: ShortInterestTrendFilter;
  /**
   * Drop stocks whose most recent quarter was a loss. Unknown financials are
   * kept, not dropped - an exclusion can't be justified without the data.
   */
  excludeQuarterlyNetLoss?: boolean;
  excludeQuarterlyOperatingLoss?: boolean;
  /**
   * Drop stocks failing a financial-health check. Like the loss exclusions,
   * a company whose data can't be judged is kept rather than dropped.
   */
  excludeCapitalImpairment?: CapitalImpairmentLevel;
  /** Drop stocks whose 영업이익 hasn't covered 이자비용 for 3 straight years. */
  excludeWeakInterestCoverage?: boolean;
  /** Drop stocks trading at or below this price (KRW). */
  excludePriceAtOrBelow?: number;
  /** Drop stocks whose 20-day average 거래대금 is below this (KRW). */
  minAvgTradingValue?: number;
  /** Keep only stocks that have fallen at least this much over the window. */
  drawdown?: DrawdownFilter;
  /** IBD-style relative strength floor (0-99). */
  minRsRating?: number;
  /** Price/volume patterns a stock must show (all selected must hold). */
  technicalPatterns?: TechnicalPattern[];
  /** Legendary-investor presets. Multiple stack (a stock must satisfy every selected preset). */
  presets?: InvestorPreset[];
}
