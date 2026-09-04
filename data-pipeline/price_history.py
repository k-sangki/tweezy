"""Daily OHLCV history per ticker, cached incrementally.

This is the one genuinely per-ticker collection in the pipeline (~2,700 calls),
so it keeps a pickle cache and only fetches the missing tail on later runs -
the same approach k-sangki/rs-screener uses in scripts/collect_kr.py.

Adjusted prices route through Naver inside pykrx rather than KRX, so this is
throttled separately from market_flow's KRX calls.
"""

from __future__ import annotations

import logging
import pickle
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from pykrx import stock

LOGGER = logging.getLogger("price_history")

# A year of trading days plus room for the 200-day average's 20-day lookback.
KEEP_SESSIONS = 320
REQUEST_DELAY_SECONDS = 0.15
MAX_WORKERS = 4
# Enough for a cold ~2,700-ticker build (~9 minutes observed) with headroom,
# but bounded so a hung KRX connection can't pin the job.
BUDGET_SECONDS = 1500.0


def load_cache(path: Path) -> dict[str, pd.DataFrame]:
    if not path.exists():
        return {}
    try:
        with path.open("rb") as handle:
            cached = pickle.load(handle)  # trusted, written by this pipeline only
        return cached if isinstance(cached, dict) else {}
    except Exception as error:  # noqa: BLE001 - a corrupt cache should just be rebuilt
        LOGGER.warning("가격 이력 캐시를 읽지 못해 다시 수집합니다: %s", error)
        return {}


def save_cache(path: Path, histories: dict[str, pd.DataFrame]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        pickle.dump(histories, handle, protocol=pickle.HIGHEST_PROTOCOL)


def fetch_history(ticker: str, start: str, end: str, cached: pd.DataFrame | None) -> tuple[str, pd.DataFrame]:
    """Fetch only the sessions missing from `cached`, then merge and trim."""
    fetch_start = start
    if cached is not None and not cached.empty:
        last = pd.Timestamp(cached.index.max())
        if last.strftime("%Y%m%d") >= end:
            return ticker, cached
        fetch_start = (last + pd.Timedelta(days=1)).strftime("%Y%m%d")

    fresh = None
    for attempt in range(3):
        try:
            time.sleep(REQUEST_DELAY_SECONDS)
            fresh = stock.get_market_ohlcv_by_date(fetch_start, end, ticker, adjusted=True)
            break
        except Exception as error:  # noqa: BLE001
            if attempt == 2:
                LOGGER.warning("%s 가격 이력 수집 실패: %s", ticker, error)
                return ticker, cached if cached is not None else pd.DataFrame()
            time.sleep(1.5 * (attempt + 1))

    if fresh is None or fresh.empty:
        return ticker, cached if cached is not None else pd.DataFrame()

    combined = pd.concat([cached, fresh]) if cached is not None and not cached.empty else fresh
    combined = combined[~combined.index.duplicated(keep="last")].sort_index().tail(KEEP_SESSIONS)
    return ticker, combined


def collect_histories(
    tickers: list[str],
    date: str,
    cache_path: Path,
    lookback_days: int = 520,
    budget_seconds: float = BUDGET_SECONDS,
) -> dict[str, pd.DataFrame]:
    histories = load_cache(cache_path)
    start = (datetime.strptime(date, "%Y%m%d") - timedelta(days=lookback_days)).strftime("%Y%m%d")
    LOGGER.info("가격 이력 수집: %s개 종목 (%s~%s), 캐시 %s개", len(tickers), start, date, len(histories))

    # pykrx exposes no request timeout, so a KRX session that stops answering
    # (an expired login, a throttled IP) hangs a worker indefinitely - observed
    # locally as 264 stragglers pinning the run for three hours. The whole step
    # gets a wall-clock budget instead; whatever is missing keeps its cached
    # history and is retried next run.
    completed = 0
    # Not `with ThreadPoolExecutor(...) as executor:` - the context manager's
    # __exit__ unconditionally calls shutdown(wait=True), which re-joins every
    # thread in self._threads including ones still genuinely stuck in a
    # pykrx call, silently undoing the wait=False below and blocking anyway.
    # Confirmed by reading Executor.__exit__ and ThreadPoolExecutor.shutdown.
    executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
    try:
        futures = {
            executor.submit(fetch_history, ticker, start, date, histories.get(ticker)): ticker
            for ticker in tickers
        }
        try:
            for future in as_completed(futures, timeout=budget_seconds):
                ticker, frame = future.result()
                completed += 1
                if frame is not None and not frame.empty:
                    histories[ticker] = frame
                if completed % 500 == 0:
                    LOGGER.info("가격 이력 %s/%s 완료", completed, len(futures))
                    save_cache(cache_path, histories)
        except TimeoutError:
            LOGGER.warning(
                "가격 이력 수집 제한시간(%s초) 초과 - %s/%s개만 갱신하고 진행합니다.",
                int(budget_seconds), completed, len(futures),
            )
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    histories = {ticker: frame for ticker, frame in histories.items() if ticker in set(tickers)}
    save_cache(cache_path, histories)
    return histories


def series_of(frame: pd.DataFrame) -> tuple[list[float], list[float], list[float], list[float]] | None:
    """(closes, highs, lows, volumes) from a pykrx OHLCV frame."""
    columns = {"종가": "close", "고가": "high", "저가": "low", "거래량": "volume"}
    if frame is None or frame.empty or not all(column in frame.columns for column in columns):
        return None
    return (
        frame["종가"].astype(float).tolist(),
        frame["고가"].astype(float).tolist(),
        frame["저가"].astype(float).tolist(),
        frame["거래량"].astype(float).tolist(),
    )


def index_closes(date: str, index_ticker: str, lookback_days: int = 200) -> list[float]:
    """Closing series for a KRX index (1001 = KOSPI, 2001 = KOSDAQ)."""
    start = (datetime.strptime(date, "%Y%m%d") - timedelta(days=lookback_days)).strftime("%Y%m%d")
    try:
        frame = stock.get_index_ohlcv_by_date(start, date, index_ticker)
    except Exception as error:  # noqa: BLE001
        LOGGER.warning("지수 %s 수집 실패: %s", index_ticker, error)
        return []
    if frame is None or frame.empty or "종가" not in frame.columns:
        return []
    return frame["종가"].astype(float).tolist()
