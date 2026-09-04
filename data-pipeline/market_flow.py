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
from bisect import bisect_left
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from datetime import datetime, timedelta
from typing import Any

import pandas as pd
from pykrx import stock

LOGGER = logging.getLogger("market_flow")

MARKETS = ("KOSPI", "KOSDAQ")

# The deepest net-buy filter is O'Neil's 20-day institutional check, so there's
# no point paying for more; the short-interest trend filter reaches 3 months
# (~60 trading days) and needs one extra day to fit a line across it.
NET_BUY_DAYS = 25
SHORT_INTEREST_DAYS = 65
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

# pykrx builds its own requests.Session and calls session.get/post with no
# timeout= at all (confirmed by reading pykrx.website.comm.webio.Get/Post), so
# a connection KRX drops silently rather than resets can hang forever - not
# for REQUEST_DELAY_SECONDS, for the rest of the job's runtime. Observed: a
# 2+ hour stall on collect_quotes.py with zero progress after DART finished,
# on a run started right after confirming KRX itself was reachable - i.e. not
# a sustained block, one bad connection with nothing to time it out. Every
# pykrx call in this module is run in its own throwaway thread so a hang can
# be bounded instead of taking the whole collector down with it; the thread
# itself can't be killed (Python has no safe thread-kill) so it's abandoned,
# not joined.
REQUEST_TIMEOUT_SECONDS = 20.0
# Defense in depth beneath the per-call timeout: bounds the worst case where
# many calls in a row each burn the full per-call timeout before giving up.
BUDGET_SECONDS = 1200.0


def _call_with_timeout(fn, *args, timeout: float = REQUEST_TIMEOUT_SECONDS, **kwargs):
    # Since Python 3.11, concurrent.futures.TimeoutError IS builtins.TimeoutError
    # (same class object) - so if fn itself ever raises a TimeoutError, this
    # branch relabels it with the generic message below rather than passing its
    # original text through. Harmless: callers only care that this raised.
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(fn, *args, **kwargs)
    try:
        return future.result(timeout=timeout)
    except FutureTimeoutError:
        raise TimeoutError(f"{getattr(fn, '__name__', fn)} 응답 없음 ({timeout:.0f}초 초과)") from None
    finally:
        executor.shutdown(wait=False)  # don't block on the possibly-stuck worker


def _throttled_call(fn, *args, **kwargs):
    time.sleep(REQUEST_DELAY_SECONDS)
    frame = _call_with_timeout(fn, *args, **kwargs)
    if frame is None or frame.empty:
        # Could be genuinely no data, or a rate-limited empty response - a
        # single retry after a longer pause disambiguates cheaply enough.
        time.sleep(RETRY_DELAY_SECONDS)
        frame = _call_with_timeout(fn, *args, **kwargs)
    return frame


def recent_trading_days(end_date: str, count: int) -> list[str]:
    """Last `count` trading days as of (and including) end_date, oldest first.

    Empty (rather than raising) when even this single calendar lookup can't be
    made to respond - every caller already treats an empty trading-day list as
    "nothing to collect this run" instead of a hard failure.
    """
    end = datetime.strptime(end_date, "%Y%m%d")
    start = end - timedelta(days=int(count * 1.6) + 10)  # generous padding for weekends/holidays
    try:
        days = _call_with_timeout(
            stock.get_previous_business_days, fromdate=start.strftime("%Y%m%d"), todate=end_date
        )
    except Exception as error:  # noqa: BLE001
        LOGGER.warning("거래일 캘린더 조회 실패: %s", error)
        return []
    return [day.strftime("%Y%m%d") for day in days[-count:]]


def _net_buy_column(frame: pd.DataFrame) -> pd.Series | None:
    for name in ("순매수거래량", "Net Purchase Volume"):
        if name in frame.columns:
            return frame[name]
    return None


def collect_net_buy_history(trading_days: list[str], field_key: str, investor: str) -> dict[str, list[float | None]]:
    """ticker -> daily net-buy volume, most recent trading day first.

    Values are written at the index of their trading day, never appended: a
    ticker that is missing on some day (halted, newly listed) - or a whole day
    whose fetch failed - leaves a null in place rather than shifting every
    older value up a slot. Without this, index i stops meaning "i trading days
    ago" and every filter that compares positions silently reads wrong dates.
    """
    days_newest_first = list(reversed(trading_days))
    by_ticker: dict[str, list[float | None]] = {}
    deadline = time.monotonic() + BUDGET_SECONDS
    for index, day in enumerate(days_newest_first):
        if time.monotonic() > deadline:
            LOGGER.warning(
                "%s(%s) 수집 제한시간(%s초) 초과 - %s/%s일까지만 반영합니다.",
                field_key, investor, int(BUDGET_SECONDS), index, len(days_newest_first),
            )
            break
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
                series = by_ticker.setdefault(str(ticker), [None] * len(days_newest_first))
                series[index] = float(value)
    return by_ticker


def latest_short_interest_date(date: str, max_lookback_days: int = 10) -> str | None:
    """공매도 잔고는 며칠(관측상 2거래일 이상) 지연 공시되므로, 시세 스냅샷과
    같은 날짜를 가정하지 않고 실제로 데이터가 있는 최신일을 따로 찾는다."""
    end = datetime.strptime(date, "%Y%m%d")
    start = end - timedelta(days=max_lookback_days * 2 + 5)
    try:
        candidates = _call_with_timeout(
            stock.get_previous_business_days, fromdate=start.strftime("%Y%m%d"), todate=date
        )
    except Exception as error:  # noqa: BLE001
        LOGGER.warning("거래일 캘린더 조회 실패: %s", error)
        return None
    for day in reversed(candidates[-max_lookback_days:]):
        day_str = day.strftime("%Y%m%d")
        try:
            frame = _throttled_call(stock.get_shorting_balance_by_ticker, day_str, market="KOSPI")
        except Exception as error:  # noqa: BLE001 - one bad day shouldn't abort the search
            LOGGER.warning("%s 공매도잔고 존재 여부 확인 실패: %s", day_str, error)
            continue
        if frame is not None and not frame.empty:
            return day_str
    return None


def collect_short_interest_history(date: str, days: int) -> tuple[dict[str, list[float | None]], dict[str, float]]:
    """(balance history most-recent-first, latest 비중 by ticker).

    KRX publishes 비중 (balance as a percent of listed shares) on the same call
    as the balance, so the ratio costs nothing extra and is the exchange's own
    figure rather than one we recompute.
    """
    anchor = latest_short_interest_date(date)
    if anchor is None:
        LOGGER.warning("공매도잔고 데이터를 찾지 못했습니다 (최근 %s일 이내 없음)", 10)
        return {}, {}
    if anchor != date:
        LOGGER.info("공매도잔고 지연 공시 감지 - 기준일을 %s -> %s로 조정", date, anchor)

    trading_days = recent_trading_days(anchor, days)
    days_newest_first = list(reversed(trading_days))
    by_ticker: dict[str, list[float | None]] = {}
    latest_ratio: dict[str, float] = {}
    deadline = time.monotonic() + BUDGET_SECONDS
    for index, day in enumerate(days_newest_first):
        if time.monotonic() > deadline:
            LOGGER.warning(
                "공매도잔고 수집 제한시간(%s초) 초과 - %s/%s일까지만 반영합니다.",
                int(BUDGET_SECONDS), index, len(days_newest_first),
            )
            break
        for market in MARKETS:
            try:
                frame = _throttled_call(stock.get_shorting_balance_by_ticker, day, market=market)
            except Exception as error:  # noqa: BLE001
                LOGGER.warning("%s %s 공매도잔고 조회 실패: %s", day, market, error)
                continue
            if frame is None or frame.empty or "공매도잔고" not in frame.columns:
                continue
            # Written by index, not appended - see collect_net_buy_history.
            for ticker, value in frame["공매도잔고"].items():
                series = by_ticker.setdefault(str(ticker), [None] * len(days_newest_first))
                series[index] = float(value)
            if index == 0 and "비중" in frame.columns:
                for ticker, value in frame["비중"].items():
                    latest_ratio[str(ticker)] = round(float(value), 3)
    return by_ticker, latest_ratio


def short_interest_percentiles(ratios: dict[str, float]) -> dict[str, int]:
    """0-99 rank of each ticker's 비중 across the whole universe.

    The absolute ratio is tiny and its level drifts with how active shorting is
    market-wide, so a fixed "N% 이상" threshold selects wildly different numbers
    of stocks at different times; a percentile always selects the same share.
    Ties get the same score, which matters here because ~38% of the market sits
    at exactly 0.
    """
    if not ratios:
        return {}
    ordered = sorted(ratios.values())
    count = len(ordered)
    return {
        ticker: min(99, max(0, int(100 * bisect_left(ordered, value) / count)))
        for ticker, value in ratios.items()
    }


def collect_flow_and_short_interest(
    date: str,
    net_buy_days: int = NET_BUY_DAYS,
    short_interest_days: int = SHORT_INTEREST_DAYS,
) -> dict[str, dict[str, Any]]:
    """Merge net-buy (x3 investor types) and short-interest history per ticker.

    The two histories are collected over different windows because they're used
    for different things: the deepest net-buy filter looks back 20 days, while
    the short-interest trend filter reaches a full 3 months.
    """
    trading_days = recent_trading_days(date, net_buy_days)
    if not trading_days:
        LOGGER.warning("거래일 캘린더를 가져오지 못해 수급/공매도 수집을 건너뜁니다.")
        return {}
    LOGGER.info("수급 이력 수집: 최근 %s거래일 (%s ~ %s)", len(trading_days), trading_days[0], trading_days[-1])

    per_field: dict[str, dict[str, list[float | None]]] = {}
    for field_key, investor in INVESTORS.items():
        LOGGER.info("%s(%s) 수집 중", field_key, investor)
        per_field[field_key] = collect_net_buy_history(trading_days, field_key, investor)

    LOGGER.info("shortInterestBalance 수집 중 (최근 %s거래일)", short_interest_days)
    balances, ratios = collect_short_interest_history(date, short_interest_days)
    per_field["shortInterestBalance"] = balances

    merged: dict[str, dict[str, Any]] = {}
    for field_key, by_ticker in per_field.items():
        for ticker, series in by_ticker.items():
            merged.setdefault(ticker, {})[field_key] = series

    percentiles = short_interest_percentiles(ratios)
    LOGGER.info("공매도 잔고 비중 산출: %s개 종목", len(ratios))
    for ticker, ratio in ratios.items():
        entry = merged.setdefault(ticker, {})
        entry["shortInterestRatio"] = ratio
        entry["shortInterestPercentile"] = percentiles.get(ticker)
    return merged
