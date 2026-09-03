import type { Stock } from '../types';

export type DisclosureCorpClass = 'Y' | 'K' | 'N' | 'E';

export interface Disclosure {
  corpClass: DisclosureCorpClass;
  corpCode: string;
  corpName: string;
  stockCode: string | null;
  reportName: string;
  receiptNo: string;
  filerName: string;
  receivedDate: string;
  remarks: string;
}

export interface DisclosureQuery {
  corpCode?: string;
  beginDate?: string;
  endDate?: string;
  finalReportOnly?: boolean;
  pageNo?: number;
  pageCount?: number;
}

export interface DisclosureSearchResult {
  items: Disclosure[];
  totalCount: number;
  totalPages: number;
}

export interface MarketFeedPayload {
  /** ISO date (YYYY-MM-DD) of the trading day this snapshot's regular-session prices/changes reflect. */
  date: string;
  updatedAt: string;
  source: string;
  /** Per-market: index above its 60-day average. null when it couldn't be judged. */
  marketUptrend?: Record<string, boolean | null>;
  items: Stock[];
}
