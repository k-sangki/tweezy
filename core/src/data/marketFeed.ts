import type { Stock } from '../types';
import type { MarketFeedPayload } from './types';

/** Published by .github/workflows/update-market-feed.yml on every collector run. */
export const DEFAULT_MARKET_FEED_URL =
  'https://raw.githubusercontent.com/k-sangki/tweezy/main/data/kr-quotes.json';

export interface MarketSnapshot {
  /** ISO date (YYYY-MM-DD) of the trading day this snapshot's regular-session prices/changes reflect. */
  date: string;
  stocks: Stock[];
  /** Per-market: index above its 60-day average. null when it couldn't be judged. */
  marketUptrend?: Record<string, boolean | null>;
}

export interface MarketDataProvider {
  getSnapshot(): Promise<MarketSnapshot>;
}

export interface StaticFeedProviderOptions {
  /** URL of a JSON payload shaped like MarketFeedPayload, published by a periodic collector job. */
  feedUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Reads a periodically-refreshed quote snapshot from a static JSON feed,
 * rather than calling KRX directly from the client. See data-pipeline/
 * for the collector job that produces this feed.
 */
export class StaticFeedMarketDataProvider implements MarketDataProvider {
  private readonly feedUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: StaticFeedProviderOptions) {
    this.feedUrl = options.feedUrl;
    // Bind: an unbound `fetch` reference throws "Illegal invocation" in
    // browsers when called without `window` as `this`.
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async getSnapshot(): Promise<MarketSnapshot> {
    const response = await this.fetchImpl(this.feedUrl);
    if (!response.ok) {
      throw new Error(`시세 피드를 불러오지 못했습니다: ${response.status}`);
    }
    const payload = (await response.json()) as MarketFeedPayload;
    return { date: payload.date, stocks: payload.items, marketUptrend: payload.marketUptrend };
  }
}
