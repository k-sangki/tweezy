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
import price_history
import rs_engine

load_dotenv()  # picks up KRX_ID/KRX_PW/DART_API_KEY from a local .env, if present - never committed (see .gitignore)

SEOUL = ZoneInfo("Asia/Seoul")
MIN_CLOSE = 100
LOGGER = logging.getLogger("collect_quotes")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/kr-quotes.json")
    parser.add_argument("--dart-api-key", default=None, help="defaults to $DART_API_KEY")
    parser.add_argument("--financials-cache", default=".cache/dart_reports.json")
    parser.add_argument("--skip-financials", action="store_true", help="skip quarterly/annual profit+revenue collection")
    parser.add_argument(
        "--precise-financials-min-cap",
        type=float,
        default=300_000_000_000,
        help=(
            "market cap (KRW) above which financials are re-fetched with OpenDART's "
            "single-company API, so net income is 지배주주지분 rather than 총액. "
            "0 applies it to every company (slow, quota-heavy)."
        ),
    )
    parser.add_argument("--skip-flow", action="store_true", help="skip 수급/공매도 daily history collection")
    parser.add_argument("--skip-technicals", action="store_true", help="skip price-history/RS/technical pattern collection")
    parser.add_argument("--price-cache", default=".cache/kr_price_history.pkl")
    parser.add_argument(
        "--net-buy-days",
        type=int,
        default=market_flow.NET_BUY_DAYS,
        help="trading days of 기관/외인/연기금 순매수 history (deepest filter looks back 20)",
    )
    parser.add_argument(
        "--short-interest-days",
        type=int,
        default=market_flow.SHORT_INTEREST_DAYS,
        help="trading days of 공매도 잔고 history (the 3-month trend filter needs ~60)",
    )
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


def load_corp_codes_cache(path: Path) -> dict[str, str]:
    """corp_code identifiers are stable, so a plain cache with no TTL is enough -
    it keeps cached financials usable on days when DART's quota is already spent."""
    if not path.exists():
        return {}
    try:
        cached = json.loads(path.read_text(encoding="utf-8"))
        return cached if isinstance(cached, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_corp_codes_cache(path: Path, corp_codes: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(corp_codes, separators=(",", ":")), encoding="utf-8")


def _dart_error_status(content: bytes) -> str | None:
    """Pull <status> out of an OpenDART XML error body, if that's what this is."""
    try:
        return ElementTree.fromstring(content).findtext("status")
    except ElementTree.ParseError:
        return None


def download_corp_codes(api_key: str, timeout: int = 40, retries: int = 3) -> dict[str, str]:
    """stock ticker -> OpenDART corp_code, via https://opendart.fss.or.kr/api/corpCode.xml

    Raises DailyLimitReached when the API key's daily quota is spent, so the
    caller can publish the feed without DART-derived fields instead of failing.
    """
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
    try:
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            xml = archive.read(archive.namelist()[0])
    except zipfile.BadZipFile:
        # A spent daily quota (or another API-level error) comes back as an XML
        # error body with HTTP 200, not a zip.
        status = _dart_error_status(response.content)
        if status == "020":
            raise dart_financials.DailyLimitReached("OpenDART 일일 요청 한도를 초과했습니다.") from None
        raise RuntimeError(f"corpCode.xml 응답을 읽지 못했습니다 (status={status})") from None
    root = ElementTree.fromstring(xml)

    stock_map: dict[str, str] = {}
    for node in root.findall("list"):
        corp_code = (node.findtext("corp_code") or "").strip()
        stock_code = (node.findtext("stock_code") or "").strip()
        if corp_code and stock_code:
            stock_map[stock_code] = corp_code
    return stock_map


def collect_technicals(
    tickers: list[str],
    date: str,
    cache_path: Path,
    ticker_market: dict[str, str],
) -> tuple[dict[str, dict[str, Any]], dict[str, bool | None]]:
    """RS ratings and price/volume patterns for every ticker with a year of history.

    RS is a cross-sectional percentile, so raw weighted returns are collected for
    the whole universe first, then ranked - a single stock's rating depends on
    everyone else's. Ranking happens within KOSPI and within KOSDAQ separately:
    the two indexes move differently enough that a combined ranking would hand
    most of the high ratings to whichever market happened to be running, which
    is exactly what the rating is supposed to control for.
    """
    histories = price_history.collect_histories(tickers, date, cache_path)

    series_by_ticker: dict[str, tuple[list[float], list[float], list[float], list[float]]] = {}
    raw_returns: dict[str, float] = {}
    for ticker in tickers:
        series = price_history.series_of(histories.get(ticker))
        if series is None:
            continue
        weighted = rs_engine.weighted_return(series[0])
        if weighted is None:
            continue
        series_by_ticker[ticker] = series
        raw_returns[ticker] = weighted

    ratings: dict[str, int] = {}
    for market in ("KOSPI", "KOSDAQ"):
        peers = {
            ticker: value
            for ticker, value in raw_returns.items()
            if ticker_market.get(ticker) == market
        }
        ratings.update(rs_engine.percentile_scores(peers))
        LOGGER.info("RS 백분위 산출 (%s): %s개 종목", market, len(peers))
    # Left as None when the index fetch fails or is too short - coercing that to
    # False would be indistinguishable from a measured downtrend, and would
    # silently veto every CAN SLIM match on the strength of missing data.
    market_uptrend: dict[str, bool | None] = {
        "KOSPI": rs_engine.index_uptrend(price_history.index_closes(date, "1001")),
        "KOSDAQ": rs_engine.index_uptrend(price_history.index_closes(date, "2001")),
    }
    for name, state in market_uptrend.items():
        if state is None:
            LOGGER.warning("%s 지수 추세를 판정하지 못했습니다 - marketUptrend를 null로 둡니다.", name)
    LOGGER.info(
        "RS 산출 완료: %s개 종목 (시장 추세 KOSPI=%s, KOSDAQ=%s)",
        len(ratings),
        market_uptrend["KOSPI"],
        market_uptrend["KOSDAQ"],
    )

    result: dict[str, dict[str, Any]] = {}
    for ticker, (closes, highs, lows, volumes) in series_by_ticker.items():
        metrics = rs_engine.price_metrics(closes, highs, lows, volumes)
        if metrics is None:
            continue
        rating = ratings.get(ticker, 0)
        score = rs_engine.trend_template_score(
            closes[-1],
            float(metrics["ma50"]),
            float(metrics["ma150"]),
            float(metrics["ma200"]),
            float(metrics["ma200Prior"]),
            float(metrics["low52"]),
            float(metrics["high52"]),
            rating,
        )
        result[ticker] = {
            "rsRating": rating,
            "trendScore": score,
            "trendTemplate": bool(metrics["trendTemplateBase"]),
            "maAligned": bool(metrics["maAligned"]),
            "vcp": bool(metrics["vcp"]),
            "newHigh52": bool(metrics["newHigh52"]),
            "high52Pct": metrics["high52Pct"],
            "volumeDryUp": bool(metrics["volumeDryUp"]),
            "boxBreakout": bool(metrics["boxBreakout"]),
            "boxRange": bool(metrics["boxRange"]),
            "volumeRatio50": metrics["volumeRatio50"],
            "marketUptrend": market_uptrend.get(ticker_market.get(ticker, "")),
        }
    return result, market_uptrend


def magic_formula_ranks(
    financials: dict[str, dict[str, list[float | None]]],
    corp_codes: dict[str, str],
    market_cap: pd.Series,
) -> dict[str, int]:
    """Greenblatt's magic formula as a 1-99 percentile per ticker (99 = best).

    이익수익률 = EBIT / EV, 투하자본이익률 = EBIT / (순운전자본 + 순고정자산).
    Both are ranked across the market and the two ranks are summed, which is
    the whole method - so it can only be computed here, with every company in
    hand, not per-stock in the client.

    EV subtracts cash where the full-taxonomy fetch supplied it; for companies
    covered only by 주요계정 (which stops at 유동자산) cash is treated as zero,
    which understates earnings yield rather than overstating it.
    """
    def newest(series: list[float | None] | None) -> float | None:
        return series[0] if series else None

    earnings_yield: dict[str, float] = {}
    return_on_capital: dict[str, float] = {}
    for ticker, corp_code in corp_codes.items():
        entry = financials.get(corp_code)
        if not entry or ticker not in market_cap.index:
            continue
        ebit = newest(entry.get("annualOperatingProfit"))
        liabilities = newest(entry.get("annualTotalLiabilities"))
        current_assets = newest(entry.get("annualCurrentAssets"))
        current_liabilities = newest(entry.get("annualCurrentLiabilities"))
        noncurrent_assets = newest(entry.get("annualNonCurrentAssets"))
        if None in (ebit, liabilities, current_assets, current_liabilities, noncurrent_assets):
            continue
        cash = newest(entry.get("annualCash")) or 0.0

        enterprise_value = float(market_cap.get(ticker, 0.0)) + liabilities - cash
        invested_capital = (current_assets - current_liabilities) + noncurrent_assets
        # Negative capital or a negative EV makes both ratios meaningless.
        if enterprise_value <= 0 or invested_capital <= 0 or ebit <= 0:
            continue
        earnings_yield[ticker] = ebit / enterprise_value
        return_on_capital[ticker] = ebit / invested_capital

    shared = set(earnings_yield) & set(return_on_capital)
    if not shared:
        return {}
    yield_rank = rs_engine.percentile_scores({t: earnings_yield[t] for t in shared})
    capital_rank = rs_engine.percentile_scores({t: return_on_capital[t] for t in shared})
    combined = {ticker: yield_rank[ticker] + capital_rank[ticker] for ticker in shared}
    LOGGER.info("마법공식 순위 산출: %s개 종목", len(combined))
    return rs_engine.percentile_scores({t: float(v) for t, v in combined.items()})


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
    # O'Neil's S factor wants float; KRX gives listed shares, which is the
    # closest thing available here (labelled as such in the UI).
    listed_shares = first_column(cap_frame, "상장주식수", "Listed shares").astype("int64")

    kospi = set(stock.get_market_ticker_list(date, market="KOSPI"))
    kosdaq = set(stock.get_market_ticker_list(date, market="KOSDAQ"))
    fundamentals = collect_fundamentals(date)
    change_pct = first_column(stock.get_market_ohlcv_by_ticker(date, market="ALL"), "등락률", "Change rate").astype(float)
    # One bulk call for every 종목명. get_market_ticker_name is per-ticker, so
    # using it in the item loop cost ~2,700 sequential requests (~20 minutes).
    ticker_names = first_column(
        stock.get_market_price_change_by_ticker(date, date, market="ALL"), "종목명", "Name"
    )

    dart_api_key = args.dart_api_key or os.environ.get("DART_API_KEY", "").strip()
    corp_codes: dict[str, str] = {}
    financials: dict[str, dict[str, list[float | None]]] = {}
    dart_unavailable = False
    if dart_api_key:
        corp_codes_cache_path = Path(args.financials_cache).with_name("dart_corp_codes.json")
        LOGGER.info("OpenDART corp_code 매핑 다운로드 중")
        try:
            corp_codes = download_corp_codes(dart_api_key)
            save_corp_codes_cache(corp_codes_cache_path, corp_codes)
        except Exception as error:  # noqa: BLE001
            # DART being unavailable - a spent quota, but also a refused or
            # dropped connection when it throttles the whole IP - must not sink
            # a run whose 시세/수급/기술적 지표 don't depend on it. Fall back to
            # the cached mapping and publish everything else.
            dart_unavailable = True
            corp_codes = load_corp_codes_cache(corp_codes_cache_path)
            LOGGER.warning(
                "OpenDART corp_code 매핑을 받지 못해 캐시 %s개로 진행하고 신규 재무 수집은 건너뜁니다: %s",
                len(corp_codes),
                error,
            )

        if corp_codes and not args.skip_financials:
            reports_cache_path = Path(args.financials_cache)
            report_store = dart_financials.load_reports(reports_cache_path, now)
            listed = {
                code: ticker for ticker, code in corp_codes.items() if ticker in market_cap.index
            }
            # Reports are cached per (company, year, report), so a new quarter
            # costs one report per company rather than a full re-collection.
            wanted_codes = sorted(listed)
            # 지배주주지분 순이익은 단일회사 API에서만 나오고 기업당 호출이라
            # 비싸다. 화면에서 실제로 걸러질 가능성이 높은 중형주 이상에만 적용.
            precise_codes = sorted(
                code
                for code, ticker in listed.items()
                if float(market_cap.get(ticker, 0.0)) >= args.precise_financials_min_cap
            )

            if dart_unavailable:
                LOGGER.info(
                    "OpenDART에 접근할 수 없어 신규 재무 수집은 건너뜁니다 (캐시된 기업 %s개 사용).",
                    len(report_store),
                )
                financials = {
                    code: dart_financials.derive_series(report_store.get(code, {}), now)
                    for code in wanted_codes
                }
            else:
                LOGGER.info(
                    "OpenDART 재무제표 수집: 전체 %s개 기업 (그중 %s개는 지배주주지분 순이익으로 보정)",
                    len(wanted_codes),
                    len(precise_codes),
                )

                def checkpoint(partial: dict[str, dict[str, Any]]) -> None:
                    dart_financials.save_reports(reports_cache_path, now, partial)

                financials, limit_reached = dart_financials.collect_financials(
                    dart_api_key,
                    wanted_codes,
                    now,
                    reports=report_store,
                    priority_codes=precise_codes,
                    on_progress=checkpoint,
                )
                dart_financials.save_reports(reports_cache_path, now, report_store)
                if limit_reached:
                    LOGGER.warning(
                        "OpenDART 일일 한도 도달 - 수집된 보고서까지만 반영합니다. 남은 부분은 다음 실행 때 이어서 수집합니다."
                    )
    else:
        LOGGER.warning("DART_API_KEY가 없어 corpCode 매핑 및 재무제표 수집을 건너뜁니다.")

    magic_ranks = magic_formula_ranks(financials, corp_codes, market_cap) if financials else {}

    flow_and_short: dict[str, dict[str, list[float | None]]] = {}
    if not args.skip_flow:
        LOGGER.info(
            "수급/공매도 이력 수집 시작 (순매수 %s거래일, 공매도 잔고 %s거래일)",
            args.net_buy_days,
            args.short_interest_days,
        )
        flow_and_short = market_flow.collect_flow_and_short_interest(
            date,
            net_buy_days=args.net_buy_days,
            short_interest_days=args.short_interest_days,
        )

    eligible = [
        str(raw)
        for raw in cap_frame.index
        if market_of(str(raw), kospi, kosdaq) is not None and float(close.get(str(raw), 0.0)) >= MIN_CLOSE
    ]

    ticker_market = {ticker: market_of(ticker, kospi, kosdaq) or "" for ticker in eligible}
    technicals: dict[str, dict[str, Any]] = {}
    market_uptrend: dict[str, bool | None] = {}
    if not args.skip_technicals:
        LOGGER.info("가격 이력/RS/기술적 지표 수집 시작: %s개 종목", len(eligible))
        technicals, market_uptrend = collect_technicals(eligible, date, Path(args.price_cache), ticker_market)

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
            # KRX reports 0 for PER/PBR when the ratio isn't meaningful (no
            # earnings, etc.), so 0 there really is "no value". A 0 dividend
            # yield is different: it's a fact about a company that pays nothing,
            # and collapsing it to null wrongly drops those names from a
            # "배당수익률 0% 이상" screen.
            per = float(row["PER"]) or None
            pbr = float(row["PBR"]) or None
            dividend_yield = float(row["DIV"])

        corp_code = corp_codes.get(ticker)
        item_financials = financials.get(corp_code) if corp_code else None

        raw_change = change_pct.get(ticker)
        change = None if raw_change is None or pd.isna(raw_change) else round(float(raw_change), 2)

        item = {
            "ticker": ticker,
            "name": str(ticker_names.get(ticker) or ticker),
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
        if ticker in technicals:
            item.update(technicals[ticker])
        if ticker in listed_shares.index:
            item["listedShares"] = int(listed_shares.get(ticker, 0)) or None
        if ticker in magic_ranks:
            item["magicFormulaRank"] = magic_ranks[ticker]
        items.append(item)

    items.sort(key=lambda item: -item["marketCap"])

    payload = {
        "date": datetime.strptime(date, "%Y%m%d").strftime("%Y-%m-%d"),
        "updatedAt": f"{datetime.strptime(date, '%Y%m%d').strftime('%Y-%m-%d')} {now.strftime('%H:%M')} KST",
        "source": "KRX adjusted OHLCV/fundamentals via pykrx"
        + (" · OpenDART corp_code" if corp_codes else "")
        + (" · OpenDART financials" if financials else "")
        + (" · KRX flow/short-interest" if flow_and_short else "")
        + (" · RS/technicals" if technicals else ""),
        "marketUptrend": market_uptrend or None,
        "items": items,
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    LOGGER.info("%s개 종목을 %s에 저장했습니다.", len(items), output)


if __name__ == "__main__":
    main()
