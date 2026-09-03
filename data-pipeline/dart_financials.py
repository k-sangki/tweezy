"""Quarterly/annual net income, revenue and operating profit via OpenDART.

Two endpoints, deliberately mixed:

* ``fnlttMultiAcnt.json`` (다중회사 주요계정) takes up to 100 corp_codes per
  call and returns CFS and OFS together, so the whole universe costs ~160
  requests instead of ~20,000. Its downside is that it publishes only the 16
  주요계정, where net income is 당기순이익 총액 - including non-controlling
  interests.
* ``fnlttSinglAcntAll.json`` (단일회사 전체 재무제표) costs one call per
  company per report but exposes the full IFRS taxonomy, so net income can be
  taken as 지배기업소유주지분, which is what 네이버/토스 show and what a
  retail screener's 흑자/적자 judgement should agree with.

Measured on a 100-company sample: 매출액 and 영업이익 agree exactly between
the two, while 당기순이익 differs for 5 of 8 companies and flipped sign for
one (00100939: single -2.69e9 vs multi +9.26e8). So the collector runs the
cheap batch API over everything and then upgrades a priority tier (by market
cap) with the single API; `src` on each stored report records which won.

Caching is per (corp_code, year, report_code), not per company-period. A
filing doesn't change once made, so when a new quarter opens only the one new
report per company has to be fetched - the previous scheme keyed the whole
cache on the current quarter and threw away all five reports every time the
period rolled over.

Field semantics: OpenDART's own guide says thstrm_amount on a quarterly/
half-year report's income-statement account is a "[3-month]" standalone
figure, not year-to-date; thstrm_add_amount is the year-to-date cumulative.
Verified against real Samsung Electronics filings (both FY2025 and FY2026,
revenue and net income) by checking the arithmetic identity
Q1 + Q2(thstrm) = Half's thstrm_add_amount, and Q1+Q2+Q3 = Q3's
thstrm_add_amount, and all 4 quarters summing to the annual total - matched
exactly across the board, including for the half-year (11012) report despite
its account label saying "반기순이익" (half-year profit), which turned out to
just be inherited XBRL taxonomy boilerplate. (An earlier version of this
module wrongly "corrected" Q2 by subtracting Q1 from the half-year
thstrm_amount, based on a magnitude gut-check rather than this identity check
- that was the actual bug.) An annual report's thstrm/frmtrm/bfefrmtrm
amounts are 3 consecutive fiscal years in one call, so 2 annual calls 2 years
apart cover 5 years with one year of overlap.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from collections.abc import Callable, Iterable
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

CACHE_SCHEMA_VERSION = 2
# Filings are immutable once made, so the report store has no period-based
# invalidation. The long TTL exists only so a restatement (정정공시) eventually
# gets picked up rather than being cached forever.
DEFAULT_MAX_AGE_DAYS = 400

# fnlttMultiAcnt accepts at most 100 corp_codes per request (status 021 beyond).
MULTI_BATCH_SIZE = 100

# DART tolerates the batch pass at full speed but starts dropping connections
# partway through the per-company pass, so requests are spaced and retried.
REQUEST_DELAY_SECONDS = 0.25
BACKOFF_BASE_SECONDS = 1.0
MAX_ATTEMPTS = 4

KINDS = ("revenue", "profit", "operating_profit")

# (account_id fragments, account_nm fragments, statement divisions) for the
# single-company API, which exposes the full IFRS taxonomy.
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

# The multi-company API carries no account_id and only the 16 주요계정, so it
# is matched on account_nm alone. 이자수익 is the revenue line for banks, which
# file no 매출액.
MULTI_ACCOUNT_NAMES: dict[str, tuple[str, ...]] = {
    "revenue": ("매출액", "영업수익", "이자수익"),
    "profit": ("당기순이익(손실)", "당기순이익"),
    "operating_profit": ("영업이익", "영업이익(손실)"),
}

# Stored per report per kind. Short keys because this file holds ~16k reports.
AMOUNT_FIELDS = {
    "t": "thstrm_amount",
    "ta": "thstrm_add_amount",
    "f": "frmtrm_amount",
    "fa": "frmtrm_add_amount",
    "bf": "bfefrmtrm_amount",
}

class DailyLimitReached(RuntimeError):
    """OpenDART's per-key daily request quota is exhausted (status 020).

    Not fatal: collection stops, whatever was gathered is kept and cached,
    and the next run resumes from the cache to fetch only what's missing.
    """


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


def find_multi_account(rows: list[dict[str, Any]], kind: str) -> dict[str, Any] | None:
    """Pick one 주요계정 row, preferring 연결(CFS) over 별도(OFS)."""
    names = MULTI_ACCOUNT_NAMES[kind]
    for fs_div in ("CFS", "OFS"):
        scoped = [row for row in rows if row.get("fs_div") == fs_div and row.get("sj_div") == "IS"]
        for name in names:
            match = next((row for row in scoped if str(row.get("account_nm", "")).strip() == name), None)
            if match:
                return match
    return None


def extract_report(rows: list[dict[str, Any]], finder: Callable[[list, str], dict | None]) -> dict[str, Any]:
    """Reduce one report's rows to the handful of amounts the screener needs."""
    extracted: dict[str, Any] = {}
    for kind in KINDS:
        account = finder(rows, kind)
        if account is None:
            continue
        amounts = {
            short: parse_amount(account.get(field))
            for short, field in AMOUNT_FIELDS.items()
        }
        if any(value is not None for value in amounts.values()):
            extracted[kind] = amounts
    return extracted


# --------------------------------------------------------------------------
# Period arithmetic
# --------------------------------------------------------------------------

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


def _prior_quarter(year: int, quarter: int) -> tuple[int, int]:
    return (year - 1, 4) if quarter == 1 else (year, quarter - 1)


def _last_n_quarters(year: int, quarter: int, n: int) -> list[tuple[int, int]]:
    sequence = [(year, quarter)]
    for _ in range(n - 1):
        sequence.append(_prior_quarter(*sequence[-1]))
    return sequence


ReportRef = tuple[int, str]
# One way to compute a standalone quarter: terms of (report, field, sign).
Recipe = list[tuple[ReportRef, str, int]]


def _quarter_recipes(year: int, quarter: int) -> list[Recipe]:
    """Ways to compute a standalone quarter, best first.

    The second recipe for Q1-Q3 reads the *comparative* columns of the
    following year's report. That matters because the following year's report
    is usually already being fetched for a more recent quarter, so the oldest
    quarter in the window comes for free instead of costing another call.
    """
    if quarter == 1:
        return [
            [((year, REPORT_Q1), "t", 1)],
            [((year + 1, REPORT_Q1), "fa", 1)],
        ]
    if quarter == 2:
        return [
            [((year, REPORT_HALF), "t", 1)],
            [((year + 1, REPORT_HALF), "fa", 1), ((year + 1, REPORT_Q1), "fa", -1)],
        ]
    if quarter == 3:
        return [
            [((year, REPORT_Q3), "t", 1)],
            [((year + 1, REPORT_Q3), "fa", 1), ((year + 1, REPORT_HALF), "fa", -1)],
        ]
    # Q4 is never filed on its own: full year minus the 9-month cumulative.
    return [[((year, REPORT_ANNUAL), "t", 1), ((year, REPORT_Q3), "ta", -1)]]


def plan(year: int, quarter: int) -> tuple[list[ReportRef], dict[tuple[int, int], Recipe], list[ReportRef]]:
    """(reports to fetch, recipe per quarter, the two annual reports).

    Quarters are planned newest-first with their primary recipe; the oldest is
    then satisfied from reports already in the set when possible.
    """
    quarters = _last_n_quarters(year, quarter, 5)
    reports: set[ReportRef] = set()
    recipes: dict[tuple[int, int], Recipe] = {}

    for period in quarters[:-1]:
        recipe = _quarter_recipes(*period)[0]
        recipes[period] = recipe
        reports.update(ref for ref, _, _ in recipe)

    # The annual report for the most recent fully reported fiscal year carries
    # 3 years in one row; one more, 2 years back, extends the series to 5.
    latest_complete_year = year if quarter == 4 else year - 1
    annuals: list[ReportRef] = [
        (latest_complete_year, REPORT_ANNUAL),
        (latest_complete_year - 2, REPORT_ANNUAL),
    ]
    reports.update(annuals)

    oldest = quarters[-1]
    for recipe in _quarter_recipes(*oldest):
        if all(ref in reports for ref, _, _ in recipe):
            recipes[oldest] = recipe
            break
    else:
        recipe = _quarter_recipes(*oldest)[0]
        recipes[oldest] = recipe
        reports.update(ref for ref, _, _ in recipe)

    return sorted(reports), recipes, annuals


# --------------------------------------------------------------------------
# Derivation from the report store
# --------------------------------------------------------------------------

CorpReports = dict[str, dict[str, Any]]  # "year|report_code" -> extracted


def _store_key(year: int, report_code: str) -> str:
    return f"{year}|{report_code}"


def _amount(corp_reports: CorpReports, ref: ReportRef, kind: str, field: str) -> float | None:
    report = corp_reports.get(_store_key(*ref))
    if not report:
        return None
    return (report.get(kind) or {}).get(field)


def _apply(corp_reports: CorpReports, recipe: Recipe, kind: str) -> float | None:
    total = 0.0
    for ref, field, sign in recipe:
        value = _amount(corp_reports, ref, kind, field)
        if value is None:
            return None
        total += sign * value
    return total


def derive_series(corp_reports: CorpReports, now: datetime) -> dict[str, list[float | None]]:
    """The six series the screener consumes, from cached report amounts.

    A series with no values at all is omitted rather than emitted as five
    nulls: for the ~2,000 listed companies OpenDART has nothing for, that
    would be pure payload weight, and the screener already treats an absent
    series and an all-null one the same way.
    """
    year, quarter = latest_quarter(now)
    quarters = _last_n_quarters(year, quarter, 5)
    _, recipes, annuals = plan(year, quarter)
    first, second = annuals

    series: dict[str, list[float | None]] = {}
    for kind, quarterly_key, annual_key in (
        ("profit", "quarterlyNetIncome", "annualNetIncome"),
        ("revenue", "quarterlyRevenue", "annualRevenue"),
        ("operating_profit", "quarterlyOperatingProfit", "annualOperatingProfit"),
    ):
        series[quarterly_key] = [_apply(corp_reports, recipes[period], kind) for period in quarters]
        series[annual_key] = [
            _amount(corp_reports, first, kind, "t"),
            _amount(corp_reports, first, kind, "f"),
            _amount(corp_reports, first, kind, "bf"),
            _amount(corp_reports, second, kind, "f"),
            _amount(corp_reports, second, kind, "bf"),
        ]
    return {key: values for key, values in series.items() if any(v is not None for v in values)}


# --------------------------------------------------------------------------
# Report store persistence
# --------------------------------------------------------------------------

def load_reports(path: Path, now: datetime, max_age_days: int = DEFAULT_MAX_AGE_DAYS) -> dict[str, CorpReports]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("schemaVersion") != CACHE_SCHEMA_VERSION:
            LOGGER.info("재무 캐시 스키마가 바뀌어 새로 수집합니다.")
            return {}
        fetched_at = datetime.fromisoformat(payload["fetchedAt"])
        if fetched_at.tzinfo is None and now.tzinfo is not None:
            fetched_at = fetched_at.replace(tzinfo=now.tzinfo)
        if now - fetched_at > timedelta(days=max_age_days):
            return {}
        reports = payload.get("reports")
        return reports if isinstance(reports, dict) else {}
    except (KeyError, TypeError, ValueError, OSError, json.JSONDecodeError):
        return {}


def save_reports(path: Path, now: datetime, reports: dict[str, CorpReports]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": CACHE_SCHEMA_VERSION,
        "fetchedAt": now.isoformat(),
        "reports": reports,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# --------------------------------------------------------------------------
# Fetching
# --------------------------------------------------------------------------

def _get(url: str, params: dict[str, str], timeout: int) -> dict[str, Any]:
    """One OpenDART call, with backoff.

    DART throttles a sustained burst by closing the connection rather than
    returning a status, so a single 1-second retry wasn't enough: the second
    failure escaped as a bare RequestException and took the whole collection
    down with it. Failures are raised as RuntimeError so callers can drop one
    report and keep going.
    """
    import requests

    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            time.sleep(REQUEST_DELAY_SECONDS)
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as error:
            last_error = error
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(BACKOFF_BASE_SECONDS * (2 ** attempt))
    raise RuntimeError(f"요청 실패 ({MAX_ATTEMPTS}회 시도): {last_error}")


def _check_status(payload: dict[str, Any]) -> str:
    status = str(payload.get("status", ""))
    if status == "020":
        raise DailyLimitReached("OpenDART 일일 요청 한도를 초과했습니다.")
    return status


def fetch_multi(api_key: str, corp_codes: list[str], year: int, report_code: str, timeout: int = 60) -> dict[str, dict[str, Any]]:
    """One batched call. Returns {corp_code: extracted}; absent companies simply
    didn't file this report, which is normal and not an error."""
    payload = _get(
        f"{DART_BASE}/fnlttMultiAcnt.json",
        {
            "crtfc_key": api_key,
            "corp_code": ",".join(corp_codes),
            "bsns_year": str(year),
            "reprt_code": report_code,
        },
        timeout,
    )
    status = _check_status(payload)
    if status not in {"000", "013"}:
        raise RuntimeError(f"OpenDART 오류 {status}: {payload.get('message', '')}")

    rows_by_corp: dict[str, list[dict[str, Any]]] = {}
    for row in payload.get("list") or []:
        rows_by_corp.setdefault(str(row.get("corp_code")), []).append(row)

    result: dict[str, dict[str, Any]] = {}
    for corp_code, rows in rows_by_corp.items():
        extracted = extract_report(rows, find_multi_account)
        if extracted:
            extracted["src"] = "m"
            result[corp_code] = extracted
    return result


def fetch_single(api_key: str, corp_code: str, year: int, report_code: str, timeout: int = 30) -> dict[str, Any] | None:
    """Full-taxonomy statement for one company, so net income can be taken as
    지배기업소유주지분. CFS first, 별도-only filers fall back to OFS."""
    params = {
        "crtfc_key": api_key,
        "corp_code": corp_code,
        "bsns_year": str(year),
        "reprt_code": report_code,
    }
    for fs_div in ("CFS", "OFS"):
        payload = _get(f"{DART_BASE}/fnlttSinglAcntAll.json", {**params, "fs_div": fs_div}, timeout)
        status = _check_status(payload)
        if status == "013":
            continue
        if status != "000":
            raise RuntimeError(f"OpenDART 오류 {status}: {payload.get('message', '')}")
        extracted = extract_report(payload.get("list") or [], find_account)
        if extracted:
            extracted["src"] = "s"
            return extracted
    return None


def collect_financials(
    api_key: str,
    corp_codes: list[str],
    now: datetime,
    *,
    reports: dict[str, CorpReports] | None = None,
    priority_codes: Iterable[str] = (),
    workers: int = 4,
    on_progress: Callable[[dict[str, CorpReports]], None] | None = None,
) -> tuple[dict[str, dict[str, list[float | None]]], bool]:
    """Fill `reports` for `corp_codes`, then derive each company's series.

    Every company is covered by the batched API; `priority_codes` are then
    re-fetched with the single-company API so their net income is
    지배기업소유주지분 rather than 당기순이익 총액.

    Returns (series by corp_code, daily_limit_reached). Hitting the quota stops
    collection but is not an error: whatever was gathered is kept and the next
    run resumes with only the missing reports.
    """
    store = reports if reports is not None else {}
    needed, _, _ = plan(*latest_quarter(now))
    limit_reached = threading.Event()
    lock = threading.Lock()

    def stored(corp_code: str, ref: ReportRef) -> dict[str, Any] | None:
        return store.get(corp_code, {}).get(_store_key(*ref))

    def put(corp_code: str, ref: ReportRef, extracted: dict[str, Any] | None) -> None:
        with lock:
            store.setdefault(corp_code, {})[_store_key(*ref)] = extracted or {}

    # --- pass 1: batched, for everything not already cached -----------------
    batch_jobs: list[tuple[ReportRef, list[str]]] = []
    for ref in needed:
        pending = [code for code in corp_codes if stored(code, ref) is None]
        for start in range(0, len(pending), MULTI_BATCH_SIZE):
            batch_jobs.append((ref, pending[start:start + MULTI_BATCH_SIZE]))

    if batch_jobs:
        LOGGER.info(
            "DART 주요계정 배치 수집: %s개 요청 (보고서 %s종 × 최대 %s개 기업)",
            len(batch_jobs), len(needed), MULTI_BATCH_SIZE,
        )

    def run_batch(job: tuple[ReportRef, list[str]]) -> None:
        ref, codes = job
        if limit_reached.is_set():
            return
        try:
            found = fetch_multi(api_key, codes, *ref)
        except DailyLimitReached:
            limit_reached.set()
            return
        except Exception as error:  # noqa: BLE001 - one bad batch must not sink the run
            LOGGER.warning("배치 수집 실패 %s: %s", ref, error)
            return
        for code in codes:
            put(code, ref, found.get(code))

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(run_batch, job) for job in batch_jobs]
        for index, future in enumerate(as_completed(futures), start=1):
            future.result()
            if index % 20 == 0:
                LOGGER.info("DART 배치 %s/%s 완료", index, len(futures))
                if on_progress:
                    on_progress(store)

    # --- pass 2: single-company upgrade for the priority tier ---------------
    # A company that fails here keeps its batch-sourced figures, so failures
    # are counted and summarised rather than logged 3,000 times.
    failures: list[str] = []
    priority = [code for code in priority_codes if code in set(corp_codes)]
    upgrade_jobs = [
        (code, ref)
        for code in priority
        for ref in needed
        if (stored(code, ref) or {}).get("src") != "s"
    ]
    if upgrade_jobs and not limit_reached.is_set():
        LOGGER.info(
            "DART 전체 재무제표 보정: %s개 기업 × %s종 = %s개 요청 (지배주주지분 순이익)",
            len(priority), len(needed), len(upgrade_jobs),
        )

    def run_single(job: tuple[str, ReportRef]) -> None:
        code, ref = job
        if limit_reached.is_set():
            return
        try:
            extracted = fetch_single(api_key, code, *ref)
        except DailyLimitReached:
            limit_reached.set()
            return
        except Exception as error:  # noqa: BLE001 - one company must not sink the run
            failures.append(f"{code}/{ref[0]}-{ref[1]}: {error}")
            return
        if extracted:
            put(code, ref, extracted)

    if not limit_reached.is_set():
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(run_single, job) for job in upgrade_jobs]
            for index, future in enumerate(as_completed(futures), start=1):
                future.result()
                if index % 500 == 0:
                    LOGGER.info("DART 보정 %s/%s 완료", index, len(futures))
                    if on_progress:
                        on_progress(store)

    if failures:
        LOGGER.warning(
            "보정 %s/%s건 실패 - 해당 기업은 주요계정(당기순이익 총액) 값을 유지합니다. 예: %s",
            len(failures), len(upgrade_jobs), "; ".join(failures[:3]),
        )
    if limit_reached.is_set():
        LOGGER.warning("OpenDART 일일 한도 도달 - 수집한 만큼만 반영하고 다음 실행에서 이어갑니다.")
    if on_progress:
        on_progress(store)

    series = {code: derive_series(store.get(code, {}), now) for code in corp_codes}
    return series, limit_reached.is_set()
