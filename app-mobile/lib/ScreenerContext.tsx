import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyFilters,
  DEFAULT_MARKET_FEED_URL,
  StaticFeedMarketDataProvider,
  type ScreenerFilter,
  type Stock,
} from '@tweezy/core';
import { sampleStocks } from './sampleStocks';

interface ScreenerContextValue {
  stocks: Stock[];
  filteredStocks: Stock[];
  filter: ScreenerFilter;
  setFilter: (filter: ScreenerFilter) => void;
  isLiveData: boolean;
  isLoading: boolean;
  /** ISO date (YYYY-MM-DD) of the trading day the live feed's prices/changes reflect. Null until live data loads. */
  feedDate: string | null;
  /** Per-market: index above its 60-day average. Drives O'Neil's M leg, so it explains an empty result. */
  marketUptrend: Record<string, boolean | null> | null;
}

const ScreenerContext = createContext<ScreenerContextValue | null>(null);

const marketDataProvider = new StaticFeedMarketDataProvider({ feedUrl: DEFAULT_MARKET_FEED_URL });

export function ScreenerProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<ScreenerFilter>({});
  const [stocks, setStocks] = useState<Stock[]>(sampleStocks);
  const [isLiveData, setIsLiveData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feedDate, setFeedDate] = useState<string | null>(null);
  const [marketUptrend, setMarketUptrend] = useState<Record<string, boolean | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    marketDataProvider
      .getSnapshot()
      .then(({ stocks: liveStocks, date, marketUptrend: uptrend }) => {
        if (cancelled || liveStocks.length === 0) return;
        setStocks(liveStocks);
        setFeedDate(date);
        setMarketUptrend(uptrend ?? null);
        setIsLiveData(true);
      })
      .catch((error: unknown) => {
        // data/kr-quotes.json isn't published yet (or unreachable) - keep sample data.
        console.error('[ScreenerProvider] live feed fetch failed, using sample data:', error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredStocks = useMemo(() => applyFilters(stocks, filter), [stocks, filter]);

  const value = useMemo(
    () => ({ stocks, filteredStocks, filter, setFilter, isLiveData, isLoading, feedDate, marketUptrend }),
    [stocks, filteredStocks, filter, isLiveData, isLoading, feedDate, marketUptrend],
  );

  return <ScreenerContext.Provider value={value}>{children}</ScreenerContext.Provider>;
}

export function useScreener(): ScreenerContextValue {
  const context = useContext(ScreenerContext);
  if (!context) {
    throw new Error('useScreener must be used within a ScreenerProvider');
  }
  return context;
}
