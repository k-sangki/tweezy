#!/usr/bin/env python3
"""Collect a same-day KRX quote snapshot for the Tweezy screener.

KRX has no public REST API for quotes, so this reuses the technique
k-sangki/rs-screener (scripts/collect_kr.py) uses: the `pykrx` package,
which drives KRX's own market-data endpoints. Unlike rs-screener this
script does not compute RS/SEPA/CANSLIM scores - it only collects a
single-day quote snapshot (price, market cap, PER/PBR/dividend yield),
matching core/src/types.ts's Stock shape so app-mobile can consume it
via core's StaticFeedMarketDataProvider with no further mapping.

If DART_API_KEY is set, each item is also tagged with its OpenDART
corp_code (via corpCode.xml, same approach as rs-screener's
scripts/dart_engine.py::download_corp_codes) so the app can look up
disclosures for a stock through core's DartClient without needing to
parse DART's corp-code XML itself.

Because this reaches into KRX's internal endpoints (not a documented,
stable API), run it as a periodic batch job - not from inside the app.

Requires KRX_ID/KRX_PW env vars (a free KRX member login) - pykrx now
logs in with these before it will serve even basic snapshot data. See
data-pipeline/README.md. A local `.env` file (repo root or here) is
picked up automatically via python-dotenv - never commit it, it's
gitignored already. Use --limit for a quick local test against a
handful of tickers instead of the full ~2,700.
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import time
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import pandas as pd
from dotenv import load_dotenv
from pykrx import stock

import dart_financials
import market_flow

load_dotenv()  # picks up KRX_ID/KRX_PW/DART_API_KEY from a local .env, if present - never committed (see .gitignore)

SEOUL = ZoneInfo("Asia/Seoul")
MIN_CLOSE = 100
LOGGER = logging.getLogger("collect_quotes")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/kr-quotes.json")
    parser.add_argument("--dart-api-key", default=None, help="defaults to $DART_API_KEY")
    parser.add_argument("--financials-cache", default=".cache/dart_financials.json")
    parser.add_argument("--skip-financials", action="store_true", help="skip quarterly/annual profit+revenue collection")
    parser.add_argument("--skip-flow", action="store_true", help="skip 수급/공매도 daily history collection")
    parser.add_argument("--flow-days", type=int, default=60, help="trading days of 수급/공매도 history to collect")
    parser.add_argument("--limit", type=int, default=None, help="only process the first N eligible tickers (for quick local testing)")
    return parser.parse_args()


def first_column(frame: pd.DataFrame, *names: str) -> pd.Series:
    for name in names:
        if name in frame.columns:
            return frame[name]
    raise KeyError(f"missing columns {names}; received {list(frame.columns)}")


def latest_snapshot(now: datetime) -> tuple[str, pd.DataFrame]:
    """Walk backward from today to find the most recent KRX trading day."""
    for offset in range(0, 12):
        date = (now - timedelta(days=offset)).strftime("%Y%m%d")
        frame = stock.get_market_cap_by_ticker(date, market="ALL")
        if frame is not None and not frame.empty:
            return date, frame
    raise RuntimeError("최근 KRX 거래일을 찾지 못했습니다.")


def market_of(ticker: str, kospi: set[str], kosdaq: set[str]) -> str | None:
    if ticker in kospi:
        return "KOSPI"
    if ticker in kosdaq:
        return "KOSDAQ"
    return None


def download_corp_codes(api_key: str, timeout: int = 40, retries: int = 3) -> dict[str, str]:
    """stock ticker -> OpenDART corp_code, via https://opendart.fss.or.kr/api/corpCode.xml"""
    import requests

    response = None
    for attempt in range(retries):
        try:
            response = requests.get(
                "https://opendart.fss.or.kr/api/corpCode.xml",
                params={"crtfc_key": api_key},
                timeout=timeout,
            )
            response.raise_for_status()
            break
        except requests.RequestException as error:
            if attempt == retries - 1:
                raise
            LOGGER.warning("corpCode.xml 요청 실패 (%s/%s), 재시도: %s", attempt + 1, retries, error)
            time.sleep(5.0 * (attempt + 1))
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        xml = archive.read(archive.namelist()[0])
    root = ElementTree.fromstring(xml)

    stock_map: dict[str, str] = {}
    for node in root.findall("list"):
        corp_code = (node.findtext("corp_code") or "").strip()
        stock_code = (node.findtext("stock_code") or "").strip()
        if corp_code and stock_code:
            stock_map[stock_code] = corp_code
    return stock_map


def collect_fundamentals(date: str) -> pd.DataFrame:
    return pd.concat(
        [
            stock.get_market_fundamental_by_ticker(date, market="KOSPI"),
            stock.get_market_fundamental_by_ticker(date, market="KOSDAQ"),
        ]
    )


def main() -> None:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    now = datetime.now(SEOUL)

    date, cap_frame = latest_snapshot(now)
    if args.limit is not None:
        cap_frame = cap_frame.head(args.limit)
    close = first_column(cap_frame, "종가", "Close").astype(float)
    market_cap = first_column(cap_frame, "시가총액", "Market Cap").astype(float)

    kospi = set(stock.get_market_ticker_list(date, market="KOSPI"))
    kosdaq = set(stock.get_market_ticker_list(date, market="KOSDAQ"))
    fundamentals = collect_fundamentals(date)
    change_pct = first_column(stock.get_market_ohlcv_by_ticker(date, market="ALL"), "등락률", "Change rate").astype(float)

    dart_api_key = args.dart_api_key or os.environ.get("DART_API_KEY", "").strip()
    corp_codes: dict[str, str] = {}
    financials: dict[str, dict[str, list[float | None]]] = {}
    if dart_api_key:
        LOGGER.info("OpenDART corp_code 매핑 다운로드 중")
        corp_codes = download_corp_codes(dart_api_key)

        if not args.skip_financials:
            financials_cache_path = Path(args.financials_cache)
            financials = dart_financials.load_cache(financials_cache_path, now) or {}
            corp_codes_needing_financials = [
                code for ticker, code in corp_codes.items() if ticker in market_cap.index and code not in financials
            ]
            if corp_codes_needing_financials:
                LOGGER.info("OpenDART 재무제표(순이익/매출) 수집 시작: %s개 기업", len(corp_codes_needing_financials))
                financials.update(dart_financials.collect_financials(dart_api_key, corp_codes_needing_financials, now))
                dart_financials.save_cache(financials_cache_path, now, financials)
            else:
                LOGGER.info("OpenDART 재무제표 캐시 재사용 (%s개 기업)", len(financials))
    else:
        LOGGER.warning("DART_API_KEY가 없어 corpCode 매핑 및 재무제표 수집을 건너뜁니다.")

    flow_and_short: dict[str, dict[str, list[float | None]]] = {}
    if not args.skip_flow:
        LOGGER.info("수급/공매도 이력 수집 시작 (최근 %s거래일)", args.flow_days)
        flow_and_short = market_flow.collect_flow_and_short_interest(date, days=args.flow_days)

    items: list[dict[str, Any]] = []
    for raw_ticker in cap_frame.index:
        ticker = str(raw_ticker)
        market = market_of(ticker, kospi, kosdaq)
        price = float(close.get(ticker, 0.0))
        if market is None or price < MIN_CLOSE:
            continue

        per = pbr = dividend_yield = None
        if ticker in fundamentals.index:
            row = fundamentals.loc[ticker]
            per = float(row["PER"]) or None
            pbr = float(row["PBR"]) or None
            dividend_yield = float(row["DIV"]) or None

        corp_code = corp_codes.get(ticker)
        item_financials = financials.get(corp_code) if corp_code else None

        raw_change = change_pct.get(ticker)
        change = None if raw_change is None or pd.isna(raw_change) else round(float(raw_change), 2)

        item = {
            "ticker": ticker,
            "name": str(stock.get_market_ticker_name(ticker) or ticker),
            "market": market,
            "price": int(round(price)),
            "changePct": change,
            "marketCap": int(market_cap.get(ticker, 0)),
            "per": per,
            "pbr": pbr,
            "dividendYield": dividend_yield,
            "corpCode": corp_code,
        }
        if item_financials:
            item.update(item_financials)
        if ticker in flow_and_short:
            item.update(flow_and_short[ticker])
        items.append(item)

    items.sort(key=lambda item: -item["marketCap"])

    payload = {
        "date": datetime.strptime(date, "%Y%m%d").strftime("%Y-%m-%d"),
        "updatedAt": f"{datetime.strptime(date, '%Y%m%d').strftime('%Y-%m-%d')} {now.strftime('%H:%M')} KST",
        "source": "KRX adjusted OHLCV/fundamentals via pykrx"
        + (" · OpenDART corp_code" if corp_codes else "")
        + (" · OpenDART financials" if financials else "")
        + (" · KRX flow/short-interest" if flow_and_short else ""),
        "items": items,
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    LOGGER.info("%s개 종목을 %s에 저장했습니다.", len(items), output)


if __name__ == "__main__":
    main()
