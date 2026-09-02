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
}

const ScreenerContext = createContext<ScreenerContextValue | null>(null);

const marketDataProvider = new StaticFeedMarketDataProvider({ feedUrl: DEFAULT_MARKET_FEED_URL });

export function ScreenerProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<ScreenerFilter>({});
  const [stocks, setStocks] = useState<Stock[]>(sampleStocks);
  const [isLiveData, setIsLiveData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    marketDataProvider
      .getStocks()
      .then((liveStocks) => {
        if (cancelled || liveStocks.length === 0) return;
        setStocks(liveStocks);
        setIsLiveData(true);
      })
      .catch(() => {
        // data/kr-quotes.json isn't published yet (or unreachable) - keep sample data.
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
    () => ({ stocks, filteredStocks, filter, setFilter, isLiveData, isLoading }),
    [stocks, filteredStocks, filter, isLiveData, isLoading],
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
