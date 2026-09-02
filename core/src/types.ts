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
}

export interface ScreenerFilter {
  markets?: Market[];
  minMarketCap?: number;
  maxMarketCap?: number;
  minPbr?: number;
  maxPbr?: number;
  minDividendYield?: number;
}
