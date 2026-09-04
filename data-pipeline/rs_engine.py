"""IBD-style RS rating and price/volume pattern detection.

Ported from k-sangki/rs-screener's scripts/rs_engine.py (weighted_return,
percentile_scores, average, trend_template_score, has_recent_pocket_pivot)
and the derived-metric block of its scripts/collect_kr.py (trend template,
VCP, box breakout, 52-week position). Kept as plain sequences so it can be
unit-tested without pandas or any network access.

RS rating follows IBD's shape: a 63/126/189/252-trading-day weighted price
return, converted to a 0-99 percentile across the eligible universe.
"""

from __future__ import annotations

from bisect import bisect_left
from math import floor
from statistics import fmean
from typing import Iterable, Mapping, Sequence

# 12/6/3-month style weighting: the most recent quarter counts double.
RETURN_WINDOWS = ((63, 0.40), (126, 0.20), (189, 0.20), (252, 0.20))

TRADING_DAYS_PER_YEAR = 252


def weighted_return(closes: Sequence[float]) -> float | None:
    """63/126/189/252-day weighted price performance, or None without a full year."""
    if len(closes) < TRADING_DAYS_PER_YEAR + 1 or closes[-1] <= 0:
        return None
    current = float(closes[-1])
    score = 0.0
    for window, weight in RETURN_WINDOWS:
        base = float(closes[-(window + 1)])
        if base <= 0:
            return None
        score += ((current / base) - 1.0) * weight
    return score


def percentile_scores(raw_scores: Mapping[str, float]) -> dict[str, int]:
    """Map raw values to 1-99 percentile scores; ties receive the same score.

    IBD publishes the rating on a 1-99 scale, so the weakest stock scores 1
    rather than 0. Callers rank within one market at a time - the score is
    meant to say how a stock did against its peers, and KOSPI and KOSDAQ are
    different peer groups.
    """
    if not raw_scores:
        return {}
    ordered = sorted(raw_scores.values())
    count = len(ordered)
    return {
        ticker: min(99, max(1, floor(100 * bisect_left(ordered, value) / count)))
        for ticker, value in raw_scores.items()
    }


def average(values: Iterable[float], window: int) -> float | None:
    data = list(values)
    if len(data) < window:
        return None
    return fmean(float(value) for value in data[-window:])


def trend_template_score(
    current: float,
    ma50: float,
    ma150: float,
    ma200: float,
    ma200_prior: float,
    low52: float,
    high52: float,
    rs: int,
) -> int:
    """Minervini's 8-point trend template, as an auditable 0-8 count."""
    checks = (
        current > ma150,
        current > ma200,
        ma150 > ma200,
        ma200 > ma200_prior,
        ma50 > ma150 and ma50 > ma200,
        current > ma50,
        current >= low52 * 1.30 and current >= high52 * 0.75,
        rs >= 70,
    )
    return sum(checks)


def price_metrics(
    closes: Sequence[float],
    highs: Sequence[float],
    lows: Sequence[float],
    volumes: Sequence[float],
) -> dict[str, float | bool | None] | None:
    """Derived price/volume metrics for one ticker, or None without enough history."""
    if len(closes) < TRADING_DAYS_PER_YEAR + 1:
        return None
    if not (len(closes) == len(highs) == len(lows) == len(volumes)):
        return None

    ma10 = average(closes, 10)
    ma20 = average(closes, 20)
    ma50 = average(closes, 50)
    ma150 = average(closes, 150)
    ma200 = average(closes, 200)
    ma200_prior = average(closes[:-20], 200)
    if None in (ma10, ma20, ma50, ma150, ma200, ma200_prior):
        return None

    current = float(closes[-1])
    low52 = min(closes[-TRADING_DAYS_PER_YEAR:])
    high52 = max(highs[-TRADING_DAYS_PER_YEAR:])
    if high52 <= 0:
        return None

    avg_volume10 = average(volumes, 10)
    avg_volume50 = average(volumes, 50)

    # Volatility contraction: the last 10 sessions' range is materially tighter
    # than the 30 before them, on drying volume.
    recent_low = min(closes[-10:])
    recent_range = (max(closes[-10:]) / recent_low - 1) if recent_low > 0 else None
    prior_slice = closes[-40:-10]
    prior_low = min(prior_slice) if prior_slice else 0
    prior_range = (max(prior_slice) / prior_low - 1) if prior_low > 0 else None

    # 20-session box, excluding today so a breakout is measured against it.
    box_high = max(highs[-21:-1])
    box_low = min(lows[-21:-1])
    box_tight = box_low > 0 and (box_high / box_low - 1) <= 0.15

    # Two separate alignments: short-term (10/20/50일, pullback/momentum reads)
    # and long-term (50/150/200일, Minervini's trend-template leg). They are
    # independent signals, not a spectrum - a stock can hold one without the
    # other, e.g. consolidating short-term inside an intact long-term uptrend.
    ma_aligned_short = current > ma10 > ma20 > ma50
    ma_aligned_long = current > ma50 > ma150 > ma200
    trend_template = bool(
        ma_aligned_long
        and ma200 > ma200_prior
        and current >= low52 * 1.30
        and current >= high52 * 0.75
    )
    volume_dry_up = bool(avg_volume10 and avg_volume50 and avg_volume10 <= avg_volume50 * 0.70)

    return {
        "ma50": ma50,
        "ma150": ma150,
        "ma200": ma200,
        "ma200Prior": ma200_prior,
        "low52": low52,
        "high52": high52,
        "high52Pct": round(current / high52 * 100, 2),
        # Excludes today, so this is a genuine new high rather than "still the high".
        "newHigh52": bool(current >= max(highs[-TRADING_DAYS_PER_YEAR:-1])),
        "maAlignedShort": ma_aligned_short,
        "maAlignedLong": ma_aligned_long,
        "trendTemplateBase": trend_template,
        "volumeDryUp": volume_dry_up,
        "boxBreakout": bool(box_tight and current >= box_high),
        "boxRange": bool(box_tight and current < box_high),
        "vcp": bool(
            trend_template
            and recent_range is not None
            and prior_range
            and recent_range <= prior_range * 0.70
            and avg_volume10
            and avg_volume50
            and avg_volume10 < avg_volume50 * 0.80
        ),
        "volumeRatio50": round(float(volumes[-1]) / avg_volume50, 2) if avg_volume50 else None,
    }


def period_return_pct(closes: Sequence[float], window: int) -> float | None:
    """Percent change over the last `window` trading days, or None without them."""
    if len(closes) < window + 1:
        return None
    base = float(closes[-(window + 1)])
    if base <= 0:
        return None
    return round((float(closes[-1]) / base - 1) * 100, 2)


def average_trading_value(
    closes: Sequence[float], volumes: Sequence[float], window: int
) -> float | None:
    """Mean daily 거래대금 over the last `window` sessions, approximated as
    종가 x 거래량.

    pykrx's adjusted OHLCV carries no 거래대금 column, and this proxy is well
    inside the precision a liquidity floor needs - the filter separates stocks
    trading a few million won a day from ones trading hundreds of millions,
    not values a few percent apart.
    """
    if len(closes) < window or len(volumes) < window:
        return None
    values = [float(c) * float(v) for c, v in zip(closes[-window:], volumes[-window:])]
    if not values:
        return None
    return round(fmean(values), 0)


def index_uptrend(index_closes: Sequence[float], window: int = 60) -> bool | None:
    """Market filter: is the index above its `window`-day moving average?"""
    moving_average = average(index_closes, window)
    if moving_average is None or not index_closes:
        return None
    return bool(index_closes[-1] > moving_average)
