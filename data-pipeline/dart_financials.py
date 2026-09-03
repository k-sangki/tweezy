"""Quarterly/annual net income and revenue series via OpenDART's
단일회사 전체 재무제표 API (fnlttSinglAcntAll.json).

Account-matching approach (parse_amount, _account_score, find_account)
is adapted from k-sangki/rs-screener's scripts/dart_engine.py, which
already solved matching "매출액"/"당기순이익" across IFRS taxonomy
variants (연결/별도, account_id vs account_nm). This module only needs
two of its account kinds ("revenue", "profit"), not the full financial
metrics rs-screener computes.

Field semantics: OpenDART's own guide says thstrm_amount on a quarterly/
half-year report's income-statement account is a "[3-month]" standalone
figure, not year-to-date; thstrm_add_amount is the year-to-date
cumulative. Verified against real Samsung Electronics filings (both
FY2025 and FY2026, revenue and net income) by checking the arithmetic
identity Q1 + Q2(thstrm) = Half's thstrm_add_amount, and
Q1+Q2+Q3 = Q3's thstrm_add_amount, and all 4 quarters summing to the
annual total - matched exactly across the board, including for the
half-year (11012) report despite its account label saying "반기순이익"
(half-year profit), which turned out to just be inherited XBRL taxonomy
boilerplate, not a semantic description of thstrm_amount for that
report. (An earlier version of this module wrongly "corrected" Q2 by
subtracting Q1 from the half-year thstrm_amount, based on a magnitude
gut-check rather than this identity check - that was the actual bug.)
So: Q1/Q2/Q3 standalone = that report's thstrm_amount, directly. Q4
standalone = Annual report's thstrm_amount minus Q3 report's
thstrm_add_amount (9-month cumulative, same year). An annual report's
thstrm/frmtrm/bfefrmtrm amounts are 3 consecutive fiscal years in one
call, so 2 annual calls 2 years apart cover 5 years with one year of
overlap.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger("dart_financials")

DART_BASE = "https://opendart.fss.or.kr/api"
REPORT_Q1 = "11013"
REPORT_HALF = "11012"
REPORT_Q3 = "11014"
REPORT_ANNUAL = "11011"
CACHE_SCHEMA_VERSION = 1

ACCOUNT_DEFINITIONS: dict[str, tuple[tuple[str, ...], tuple[str, ...], set[str]]] = {
    "revenue": (
        ("Revenue", "OperatingRevenue"),
        ("수익(매출액)", "매출액", "영업수익"),
        {"IS", "CIS"},
    ),
    "profit": (
        ("ProfitLossAttributableToOwnersOfParent", "ProfitLoss"),
        ("지배기업소유주지분순이익", "당기순이익", "반기순이익", "분기순이익"),
        {"IS", "CIS"},
    ),
    "operating_profit": (
        ("ProfitLossFromOperatingActivities", "OperatingIncomeLoss"),
        ("영업이익", "영업손익"),
        {"IS", "CIS"},
    ),
}

# Every key collect_one() produces. Used to spot cache entries written before a
# new field existed, so they get topped up instead of skipped on resume.
EXPECTED_KEYS = (
    "quarterlyNetIncome",
    "quarterlyRevenue",
    "quarterlyOperatingProfit",
    "annualNetIncome",
    "annualRevenue",
    "annualOperatingProfit",
)


def needs_collection(cached: dict[str, list[float | None]] | None) -> bool:
    return cached is None or any(key not in cached for key in EXPECTED_KEYS)


def parse_amount(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text or text in {"-", "null"}:
        return None
    negative = text.startswith("(") and text.endswith(")")
    if negative:
        text = text[1:-1]
    try:
        number = float(text)
        return -number if negative else number
    except ValueError:
        return None


def _account_score(row: dict[str, Any], ids: tuple[str, ...], names: tuple[str, ...]) -> int:
    account_id = str(row.get("account_id", "")).lower()
    account_nm = re.sub(r"\s", "", str(row.get("account_nm", ""))).lower()
    for index, candidate in enumerate(ids):
        if candidate.lower() in account_id:
            return 100 - index
    for index, candidate in enumerate(names):
        if candidate.lower() in account_nm:
            return 50 - index
    return -1


def find_account(rows: list[dict[str, Any]], kind: str) -> dict[str, Any] | None:
    ids, names, statements = ACCOUNT_DEFINITIONS[kind]
    candidates = [row for row in rows if row.get("sj_div") in statements]
    ranked = sorted(candidates, key=lambda row: _account_score(row, ids, names), reverse=True)
    return ranked[0] if ranked and _account_score(ranked[0], ids, names) >= 0 else None


def latest_quarter(now: datetime) -> tuple[int, int]:
    """(year, quarter 1-4) of the most recently filed standalone quarter."""
    marker = (now.month, now.day)
    if marker >= (11, 15):
        return now.year, 3
    if marker >= (8, 15):
        return now.year, 2
    if marker >= (5, 16):
        return now.year, 1
    return now.year - 1, 4


class DailyLimitReached(RuntimeError):
    """OpenDART's per-key daily request quota is exhausted (status 020).

    Not fatal: collection stops, whatever was gathered is kept and cached,
    and the next run resumes from the cache to fetch only what's missing.
    """


def _prior_quarter(year: int, quarter: int) -> tuple[int, int]:
    return (year - 1, 4) if quarter == 1 else (year, quarter - 1)


def _last_n_quarters(year: int, quarter: int, n: int) -> list[tuple[int, int]]:
    sequence = [(year, quarter)]
    for _ in range(n - 1):
        sequence.append(_prior_quarter(*sequence[-1]))
    return sequence


class DartFinancialsClient:
    def __init__(self, api_key: str, timeout: int = 30):
        self.api_key = api_key
        self.timeout = timeout
        self._report_cache: dict[tuple[str, int, str], list[dict[str, Any]]] = {}

    def _request_statement(self, corp_code: str, year: int, report_code: str) -> list[dict[str, Any]]:
        import requests

        cache_key = (corp_code, year, report_code)
        if cache_key in self._report_cache:
            return self._report_cache[cache_key]

        params = {"crtfc_key": self.api_key, "corp_code": corp_code, "bsns_year": str(year), "reprt_code": report_code}
        rows: list[dict[str, Any]] = []
        for fs_div in ("CFS", "OFS"):
            params["fs_div"] = fs_div
            for attempt in range(2):
                try:
                    response = requests.get(f"{DART_BASE}/fnlttSinglAcntAll.json", params=params, timeout=self.timeout)
                    response.raise_for_status()
                    payload = response.json()
                    status = payload.get("status")
                    if status == "000":
                        rows = payload.get("list") or []
                        break
                    if status == "013":
                        break
                    if status == "020":
                        raise DailyLimitReached("OpenDART 일일 요청 한도를 초과했습니다.")
                    raise RuntimeError(f"OpenDART 오류 {status}: {payload.get('message', '')}")
                except (requests.RequestException, ValueError):
                    if attempt:
                        raise
                    time.sleep(1.0)
            if rows:
                break

        self._report_cache[cache_key] = rows
        return rows

    def _report_thstrm_amount(self, corp_code: str, year: int, report_code: str, kind: str) -> float | None:
        rows = self._request_statement(corp_code, year, report_code)
        account = find_account(rows, kind)
        return parse_amount(account.get("thstrm_amount")) if account else None

    def _standalone_quarter_amount(self, corp_code: str, year: int, quarter: int, kind: str) -> float | None:
        if quarter in (1, 2, 3):
            report_code = {1: REPORT_Q1, 2: REPORT_HALF, 3: REPORT_Q3}[quarter]
            return self._report_thstrm_amount(corp_code, year, report_code, kind)

        # quarter == 4: annual thstrm_amount (full year) minus Q3 thstrm_add_amount (9-month cumulative)
        annual_rows = self._request_statement(corp_code, year, REPORT_ANNUAL)
        annual_account = find_account(annual_rows, kind)
        annual_amount = parse_amount(annual_account.get("thstrm_amount")) if annual_account else None
        if annual_amount is None:
            return None

        q3_rows = self._request_statement(corp_code, year, REPORT_Q3)
        q3_account = find_account(q3_rows, kind)
        nine_month_cumulative = parse_amount(q3_account.get("thstrm_add_amount")) if q3_account else None
        if nine_month_cumulative is None:
            return None
        return annual_amount - nine_month_cumulative

    def _annual_series(self, corp_code: str, latest_complete_year: int, kind: str) -> list[float | None]:
        """Last 5 fiscal years, most recent first, via 2 annual-report calls."""
        first_rows = self._request_statement(corp_code, latest_complete_year, REPORT_ANNUAL)
        first_account = find_account(first_rows, kind)
        year0 = parse_amount(first_account.get("thstrm_amount")) if first_account else None
        year1 = parse_amount(first_account.get("frmtrm_amount")) if first_account else None
        year2 = parse_amount(first_account.get("bfefrmtrm_amount")) if first_account else None

        second_rows = self._request_statement(corp_code, latest_complete_year - 2, REPORT_ANNUAL)
        second_account = find_account(second_rows, kind)
        year3 = parse_amount(second_account.get("frmtrm_amount")) if second_account else None
        year4 = parse_amount(second_account.get("bfefrmtrm_amount")) if second_account else None

        return [year0, year1, year2, year3, year4]

    def collect_one(self, corp_code: str, now: datetime) -> dict[str, list[float | None]]:
        year, quarter = latest_quarter(now)
        quarters = _last_n_quarters(year, quarter, 5)

        # Each account is pulled from reports already fetched for this company
        # (_request_statement memoises per report), so adding a kind costs no
        # extra API calls - only more parsing of the same rows.
        result: dict[str, list[float | None]] = {}
        for kind, key in (
            ("profit", "quarterlyNetIncome"),
            ("revenue", "quarterlyRevenue"),
            ("operating_profit", "quarterlyOperatingProfit"),
        ):
            result[key] = [self._standalone_quarter_amount(corp_code, qy, qq, kind) for qy, qq in quarters]

        # Annual series covers fiscal years already fully reported - the year
        # before the latest quarter's year if that quarter isn't Q4 (annual
        # report for the current year doesn't exist yet), otherwise that year.
        latest_complete_year = year if quarter == 4 else year - 1
        for kind, key in (
            ("profit", "annualNetIncome"),
            ("revenue", "annualRevenue"),
            ("operating_profit", "annualOperatingProfit"),
        ):
            result[key] = self._annual_series(corp_code, latest_complete_year, kind)

        return result


def _period_key(now: datetime) -> str:
    """Cache stays valid until a new reporting period opens, not on a rolling age.

    Filings only change quarterly, and a full collection can take more than one
    day because of the daily request quota - an age-based TTL would throw away a
    nearly-complete cache and restart the same treadmill.
    """
    year, quarter = latest_quarter(now)
    return f"{year}Q{quarter}"


def load_cache(path: Path, now: datetime, max_age_days: int = 120) -> dict[str, dict[str, list[float | None]]] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        fetched_at = datetime.fromisoformat(payload["fetchedAt"])
        if fetched_at.tzinfo is None and now.tzinfo is not None:
            fetched_at = fetched_at.replace(tzinfo=now.tzinfo)
        stale = payload.get("period") != _period_key(now) or now - fetched_at > timedelta(days=max_age_days)
        if payload.get("schemaVersion") != CACHE_SCHEMA_VERSION or stale:
            return None
        financials = payload.get("financials")
        return financials if isinstance(financials, dict) else None
    except (KeyError, TypeError, ValueError, OSError, json.JSONDecodeError):
        return None


def save_cache(path: Path, now: datetime, financials: dict[str, dict[str, list[float | None]]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": CACHE_SCHEMA_VERSION,
        "period": _period_key(now),
        "fetchedAt": now.isoformat(),
        "financials": financials,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def collect_financials(
    api_key: str,
    corp_codes: list[str],
    now: datetime,
    workers: int = 4,
    on_progress: Callable[[dict[str, dict[str, list[float | None]]]], None] | None = None,
    progress_every: int = 200,
) -> tuple[dict[str, dict[str, list[float | None]]], bool]:
    """Returns (collected, daily_limit_reached).

    Hitting OpenDART's daily quota stops collection but is not an error: the
    partial result is returned (and checkpointed via `on_progress`) so the feed
    still publishes and the next run resumes with only the missing companies.
    """
    client = DartFinancialsClient(api_key)
    results: dict[str, dict[str, list[float | None]]] = {}
    limit_reached = threading.Event()

    def collect_one(corp_code: str) -> tuple[str, dict[str, list[float | None]] | None]:
        if limit_reached.is_set():
            return corp_code, None
        try:
            return corp_code, client.collect_one(corp_code, now)
        except DailyLimitReached:
            limit_reached.set()
            return corp_code, None
        except RuntimeError as error:
            LOGGER.warning("%s 재무 수집 실패: %s", corp_code, error)
            return corp_code, None

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(collect_one, code): code for code in corp_codes}
        for index, future in enumerate(as_completed(futures), start=1):
            corp_code, financials = future.result()
            if financials:
                results[corp_code] = financials
            if on_progress and index % progress_every == 0:
                on_progress(results)
            if index % 100 == 0:
                LOGGER.info("DART 재무 %s/%s 완료", index, len(futures))

    if limit_reached.is_set():
        LOGGER.warning("OpenDART 일일 한도 도달 - %s개 기업까지 수집하고 중단합니다.", len(results))

    return results, limit_reached.is_set()
