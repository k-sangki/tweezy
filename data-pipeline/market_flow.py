"""Daily investor net-buy volume (기관/외국인/연기금) and short-interest
balance history, per ticker, via pykrx's bulk (all-tickers-per-call)
endpoints - not the per-company DART financials pattern.

`get_market_net_purchases_of_equities_by_ticker` and
`get_shorting_balance_by_ticker` each return every ticker for ONE
market on ONE date in a single call, so building N days of history
costs N x markets (x investors, for net-buy) calls - not N x tickers.
Trading-day dates come from `get_previous_business_days`, which itself
is one lightweight call (KRX OHLCV history of a single reference
ticker used as a calendar), not a per-day probe.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

import pandas as pd
from pykrx import stock

LOGGER = logging.getLogger("market_flow")

MARKETS = ("KOSPI", "KOSDAQ")
INVESTORS = {
    "institutionalNetBuy": "기관합계",
    "foreignNetBuy": "외국인",
    "pensionNetBuy": "연기금",
}

# Rapid-fire single-day requests get rate-limited by KRX (observed: bulk
# "Expecting value" JSON-decode failures partway through a run). A small
# delay between calls keeps this reliable; retrying once after a longer
# pause recovers from a transient block.
REQUEST_DELAY_SECONDS = 0.3
RETRY_DELAY_SECONDS = 5.0


def _throttled_call(fn, *args, **kwargs):
    time.sleep(REQUEST_DELAY_SECONDS)
    frame = fn(*args, **kwargs)
    if frame is None or frame.empty:
        # Could be genuinely no data, or a rate-limited empty response - a
        # single retry after a longer pause disambiguates cheaply enough.
        time.sleep(RETRY_DELAY_SECONDS)
        frame = fn(*args, **kwargs)
    return frame


def recent_trading_days(end_date: str, count: int) -> list[str]:
    """Last `count` trading days as of (and including) end_date, oldest first."""
    end = datetime.strptime(end_date, "%Y%m%d")
    start = end - timedelta(days=int(count * 1.6) + 10)  # generous padding for weekends/holidays
    days = stock.get_previous_business_days(fromdate=start.strftime("%Y%m%d"), todate=end_date)
    return [day.strftime("%Y%m%d") for day in days[-count:]]


def _net_buy_column(frame: pd.DataFrame) -> pd.Series | None:
    for name in ("순매수거래량", "Net Purchase Volume"):
        if name in frame.columns:
            return frame[name]
    return None


def collect_net_buy_history(trading_days: list[str], field_key: str, investor: str) -> dict[str, list[float | None]]:
    """ticker -> daily net-buy volume, most recent trading day first."""
    by_ticker: dict[str, list[float | None]] = {}
    for day in reversed(trading_days):  # newest first, matches our most-recent-first arrays
        for market in MARKETS:
            try:
                frame = _throttled_call(
                    stock.get_market_net_purchases_of_equities_by_ticker, day, day, market, investor
                )
            except Exception as error:  # noqa: BLE001 - one bad day/market shouldn't abort the run
                LOGGER.warning("%s %s %s 순매수 조회 실패: %s", day, market, investor, error)
                continue
            column = _net_buy_column(frame) if frame is not None and not frame.empty else None
            if column is None:
                continue
            for ticker, value in column.items():
                by_ticker.setdefault(str(ticker), []).append(float(value))
    return by_ticker


def latest_short_interest_date(date: str, max_lookback_days: int = 10) -> str | None:
    """공매도 잔고는 며칠(관측상 2거래일 이상) 지연 공시되므로, 시세 스냅샷과
    같은 날짜를 가정하지 않고 실제로 데이터가 있는 최신일을 따로 찾는다."""
    end = datetime.strptime(date, "%Y%m%d")
    start = end - timedelta(days=max_lookback_days * 2 + 5)
    candidates = stock.get_previous_business_days(fromdate=start.strftime("%Y%m%d"), todate=date)
    for day in reversed(candidates[-max_lookback_days:]):
        day_str = day.strftime("%Y%m%d")
        frame = _throttled_call(stock.get_shorting_balance_by_ticker, day_str, market="KOSPI")
        if frame is not None and not frame.empty:
            return day_str
    return None


def collect_short_interest_history(date: str, days: int) -> dict[str, list[float | None]]:
    """ticker -> daily short-interest balance (shares), most recent AVAILABLE trading day first."""
    anchor = latest_short_interest_date(date)
    if anchor is None:
        LOGGER.warning("공매도잔고 데이터를 찾지 못했습니다 (최근 %s일 이내 없음)", 10)
        return {}
    if anchor != date:
        LOGGER.info("공매도잔고 지연 공시 감지 - 기준일을 %s -> %s로 조정", date, anchor)

    trading_days = recent_trading_days(anchor, days)
    by_ticker: dict[str, list[float | None]] = {}
    for day in reversed(trading_days):
        for market in MARKETS:
            try:
                frame = _throttled_call(stock.get_shorting_balance_by_ticker, day, market=market)
            except Exception as error:  # noqa: BLE001
                LOGGER.warning("%s %s 공매도잔고 조회 실패: %s", day, market, error)
                continue
            if frame is None or frame.empty or "공매도잔고" not in frame.columns:
                continue
            for ticker, value in frame["공매도잔고"].items():
                by_ticker.setdefault(str(ticker), []).append(float(value))
    return by_ticker


def collect_flow_and_short_interest(date: str, days: int = 60) -> dict[str, dict[str, list[float | None]]]:
    """Merge net-buy (x3 investor types) and short-interest history per ticker."""
    trading_days = recent_trading_days(date, days)
    LOGGER.info("수급 이력 수집: 최근 %s거래일 (%s ~ %s)", len(trading_days), trading_days[0], trading_days[-1])

    per_field: dict[str, dict[str, list[float | None]]] = {}
    for field_key, investor in INVESTORS.items():
        LOGGER.info("%s(%s) 수집 중", field_key, investor)
        per_field[field_key] = collect_net_buy_history(trading_days, field_key, investor)

    LOGGER.info("shortInterestBalance 수집 중")
    per_field["shortInterestBalance"] = collect_short_interest_history(date, days)

    merged: dict[str, dict[str, list[float | None]]] = {}
    for field_key, by_ticker in per_field.items():
        for ticker, series in by_ticker.items():
            merged.setdefault(ticker, {})[field_key] = series
    return merged
