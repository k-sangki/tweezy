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
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import pandas as pd
from pykrx import stock

SEOUL = ZoneInfo("Asia/Seoul")
MIN_CLOSE = 100
LOGGER = logging.getLogger("collect_quotes")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/kr-quotes.json")
    parser.add_argument("--dart-api-key", default=None, help="defaults to $DART_API_KEY")
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


def download_corp_codes(api_key: str, timeout: int = 40) -> dict[str, str]:
    """stock ticker -> OpenDART corp_code, via https://opendart.fss.or.kr/api/corpCode.xml"""
    import requests

    response = requests.get(
        "https://opendart.fss.or.kr/api/corpCode.xml",
        params={"crtfc_key": api_key},
        timeout=timeout,
    )
    response.raise_for_status()
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
    close = first_column(cap_frame, "종가", "Close").astype(float)
    market_cap = first_column(cap_frame, "시가총액", "Market Cap").astype(float)

    kospi = set(stock.get_market_ticker_list(date, market="KOSPI"))
    kosdaq = set(stock.get_market_ticker_list(date, market="KOSDAQ"))
    names = stock.get_market_ticker_and_name(date, market="ALL")
    fundamentals = collect_fundamentals(date)

    dart_api_key = args.dart_api_key or os.environ.get("DART_API_KEY", "").strip()
    corp_codes: dict[str, str] = {}
    if dart_api_key:
        LOGGER.info("OpenDART corp_code 매핑 다운로드 중")
        corp_codes = download_corp_codes(dart_api_key)
    else:
        LOGGER.warning("DART_API_KEY가 없어 corpCode 매핑을 건너뜁니다.")

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

        items.append(
            {
                "ticker": ticker,
                "name": str(names.get(ticker, ticker)),
                "market": market,
                "price": int(round(price)),
                "marketCap": int(market_cap.get(ticker, 0)),
                "per": per,
                "pbr": pbr,
                "dividendYield": dividend_yield,
                "corpCode": corp_codes.get(ticker),
            }
        )

    items.sort(key=lambda item: -item["marketCap"])

    payload = {
        "updatedAt": f"{datetime.strptime(date, '%Y%m%d').strftime('%Y-%m-%d')} {now.strftime('%H:%M')} KST",
        "source": "KRX adjusted OHLCV/fundamentals via pykrx" + (" · OpenDART corp_code" if corp_codes else ""),
        "items": items,
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    LOGGER.info("%s개 종목을 %s에 저장했습니다.", len(items), output)


if __name__ == "__main__":
    main()
