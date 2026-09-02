import type { Stock } from '@tweezy/core';

// Placeholder until app/_layout.tsx is wired to core's StaticFeedMarketDataProvider
// (see core/src/data/marketFeed.ts) once data/kr-quotes.json exists on main.
// corpCode is left null here (not guessed) - the real feed fills it in from
// OpenDART's corpCode.xml via data-pipeline/collect_quotes.py.
export const sampleStocks: Stock[] = [
  {
    ticker: '005930',
    name: '삼성전자',
    market: 'KOSPI',
    price: 71500,
    changePct: null,
    marketCap: 426_000_000_000_000,
    per: 12.4,
    pbr: 1.3,
    dividendYield: 2.1,
    corpCode: null,
  },
  {
    ticker: '035420',
    name: 'NAVER',
    market: 'KOSPI',
    price: 198000,
    changePct: null,
    marketCap: 32_000_000_000_000,
    per: 21.8,
    pbr: 2.0,
    dividendYield: 0.6,
    corpCode: null,
  },
  {
    ticker: '247540',
    name: '에코프로비엠',
    market: 'KOSDAQ',
    price: 152000,
    changePct: null,
    marketCap: 14_500_000_000_000,
    per: 45.2,
    pbr: 5.1,
    dividendYield: null,
    corpCode: null,
  },
];
