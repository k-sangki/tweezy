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

    ma50 = average(closes, 50)
    ma150 = average(closes, 150)
    ma200 = average(closes, 200)
    ma200_prior = average(closes[:-20], 200)
    if None in (ma50, ma150, ma200, ma200_prior):
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

    ma_aligned = current > ma50 > ma150 > ma200
    trend_template = bool(
        ma_aligned
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
        "maAligned": ma_aligned,
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


def index_uptrend(index_closes: Sequence[float], window: int = 60) -> bool | None:
    """Market filter: is the index above its `window`-day moving average?"""
    moving_average = average(index_closes, window)
    if moving_average is None or not index_closes:
        return None
    return bool(index_closes[-1] > moving_average)
