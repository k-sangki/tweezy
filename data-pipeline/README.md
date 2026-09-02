# data-pipeline

Standalone Python job that produces the JSON feed `app-mobile` reads through
`core`'s `StaticFeedMarketDataProvider`. It is not part of the npm workspace
(RN/Metro can't run `pykrx`) - run it separately on a schedule (cron, GitHub
Actions, etc.) and publish the resulting file wherever `app-mobile` can fetch
it over HTTPS (e.g. GitHub Pages, a CDN bucket).

## Why a batch job instead of calling KRX from the app

KRX doesn't offer a public REST API for quotes. `pykrx` (used here, and by
[k-sangki/rs-screener](https://github.com/k-sangki/rs-screener), which this
script's KRX-snapshot handling is adapted from) works by driving the same
internal endpoints KRX's own web UI uses - undocumented, not versioned, and
liable to change. That's a reasonable trade-off for a scheduled job you
control, but not something to embed in a shipped mobile client. If you later
want live in-app quotes, look at an official brokerage API (e.g. Korea
Investment & Securities' Open API) instead of scraping KRX from the device.

OpenDART's actual public REST API (`opendart.fss.or.kr/api`) is used both
here (for the ticker → `corp_code` mapping) and directly from `core`'s
`DartClient` for live disclosure search - that endpoint itself is fine to
call from the app. The API key is a different story: `app-mobile` currently
reads it from `EXPO_PUBLIC_DART_API_KEY`, which Expo inlines into the
client bundle - anyone who decompiles the shipped app can read it. That's
an acceptable trade-off for local development (worst case is your free-tier
key's rate limit getting used up), but before shipping, move disclosure
search behind a small server-side proxy that holds `DART_API_KEY` instead.

In this repo, `.github/workflows/update-market-feed.yml` runs this on a
schedule (weekdays after KRX close) and commits `data/kr-quotes.json` back
to `main`, so `app-mobile` can read it straight from
`https://raw.githubusercontent.com/k-sangki/tweezy/main/data/kr-quotes.json`
once the workflow has run at least once. Trigger it manually from the
Actions tab (`workflow_dispatch`) instead of waiting for the schedule if
you want the file to exist sooner. Set the `DART_API_KEY` repo secret to
get `corpCode` populated; without it the workflow still runs, just without
that field.

## Required credentials

As of `pykrx>=1.2.8`, KRX now requires a logged-in session even for the
snapshot endpoints this script uses - `KRX_ID`/`KRX_PW` (a regular, free
KRX member login, not a brokerage account) are **required** env vars, or
`get_market_cap_by_ticker` fails outright. `DART_API_KEY` stays optional
(only needed for `corpCode`). All three are wired as repo secrets into
`.github/workflows/update-market-feed.yml`.

## Usage

Run from the repo root so the default output path lines up with what the
workflow and `app-mobile` expect:

```bash
pip install -r data-pipeline/requirements.txt
KRX_ID=your_krx_id KRX_PW=your_krx_password python data-pipeline/collect_quotes.py --output data/kr-quotes.json
```

Set `DART_API_KEY` (or pass `--dart-api-key`) to also tag each item with its
OpenDART `corp_code`, so the app can query disclosures for a stock via
`DartClient.searchDisclosures({ corpCode: stock.corpCode })` without parsing
DART's corp-code XML on-device. Get a free key at
https://opendart.fss.or.kr.

Output shape matches `core`'s `MarketFeedPayload`:

```json
{
  "updatedAt": "2026-09-02 18:45 KST",
  "source": "KRX adjusted OHLCV/fundamentals via pykrx · OpenDART corp_code · OpenDART financials",
  "items": [
    { "ticker": "005930", "name": "삼성전자", "market": "KOSPI", "price": 71500,
      "marketCap": 426000000000000, "per": 12.4, "pbr": 1.3, "dividendYield": 2.1,
      "corpCode": "00126380",
      "quarterlyNetIncome": [120000, 110000, 95000, 80000, 90000],
      "quarterlyRevenue": [900000, 880000, 850000, 820000, 810000],
      "annualNetIncome": [400000, 350000, 300000, 280000, 260000],
      "annualRevenue": [3400000, 3200000, 3000000, 2800000, 2600000] }
  ]
}
```

## Financial statement collection (`dart_financials.py`)

Feeds `core`'s "펀더멘털" filters (최근 분기 흑자전환, 순이익/매출 지속상승).
Fetches each company's standalone-quarter and annual net income/revenue from
OpenDART's 단일회사 전체 재무제표 API, walking back to the last 5 quarters
and last 5 fiscal years per company (see the module docstring for exactly
how a standalone Q4 and the 5-year annual series are derived from DART's
report fields - confirmed against DART's own API guide, not guessed).

This is expensive: ~6 DART report calls per company × ~2,650 companies with
a `corpCode` ≈ 16,000 calls, on top of whatever DART's daily key limit is.
`--financials-cache` (default `.cache/dart_financials.json`, 7-day TTL,
persisted across CI runs via `actions/cache` in the workflow) means this
full cost is only paid roughly once a week, not on every scheduled run.
Pass `--skip-financials` to skip this entirely (useful for a fast local
smoke test of just the quote snapshot).
