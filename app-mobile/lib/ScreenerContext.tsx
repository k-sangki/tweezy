import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { applyFilters, type ScreenerFilter, type Stock } from '@tweezy/core';
import { sampleStocks } from './sampleStocks';

interface ScreenerContextValue {
  stocks: Stock[];
  filteredStocks: Stock[];
  filter: ScreenerFilter;
  setFilter: (filter: ScreenerFilter) => void;
}

const ScreenerContext = createContext<ScreenerContextValue | null>(null);

export function ScreenerProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<ScreenerFilter>({});
  const stocks = sampleStocks;
  const filteredStocks = useMemo(() => applyFilters(stocks, filter), [stocks, filter]);

  const value = useMemo(
    () => ({ stocks, filteredStocks, filter, setFilter }),
    [stocks, filteredStocks, filter],
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
