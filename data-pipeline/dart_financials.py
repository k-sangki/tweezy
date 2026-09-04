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
# DART also throttles by IP, refusing everything for a while. Once that starts,
# each remaining job would burn its full retry ladder (~7s) for nothing, so the
# pass gives up after this many consecutive failures and resumes next run.
CONSECUTIVE_FAILURE_LIMIT = 30
# Belt-and-suspenders beneath that: the failure counter only trips on a
# *consecutive* run of failures, so a request that eventually times out
# instead of failing fast (each one bounded at up to ~4*(timeout+backoff) by
# _get's own retry ladder, worst case a couple of minutes) can interleave with
# occasional real successes and never trip it, while still crawling for hours
# across thousands of jobs. Observed: a 2+ hour stall with the breaker never
# firing. This wall-clock budget covers the whole collect_financials() call,
# both passes together.
COLLECT_BUDGET_SECONDS = 1800.0

# Income-statement kinds carry a standalone quarterly series and an annual one;
# balance-sheet kinds are point-in-time, so only the annual snapshots are kept.
INCOME_KINDS = ("revenue", "profit", "operating_profit", "interest_expense")
BALANCE_KINDS = (
    "total_liabilities",
    "total_equity",
    "current_assets",
    "current_liabilities",
    "noncurrent_assets",
    "noncurrent_liabilities",
    "capital_stock",
    "cash",
)
KINDS = INCOME_KINDS + BALANCE_KINDS

# Quarters and fiscal years per series, sized by the deepest filter that reads
# each. Quarters: Lynch checks year-over-year growth in 3 of the last 4
# quarters, and each comparison needs the same quarter a year earlier, so 4
# pairs need 8 quarters. Years: "연속 5회 상승" needs 6 (N increases need N+1
# points) and Buffett's 5-year profit check fits inside that.
QUARTER_SERIES_LENGTH = 8
ANNUAL_SERIES_LENGTH = 6

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
    # Only the full-taxonomy API carries 이자비용; 주요계정 has 이자수익 but not
    # its cost side, so the interest-coverage screen is precise-tier only.
    "interest_expense": (
        ("InterestExpense", "FinanceCosts"),
        ("이자비용", "금융원가"),
        {"IS", "CIS"},
    ),
    "total_liabilities": (("Liabilities",), ("부채총계",), {"BS"}),
    "total_equity": (("Equity",), ("자본총계",), {"BS"}),
    "current_assets": (("CurrentAssets",), ("유동자산",), {"BS"}),
    "current_liabilities": (("CurrentLiabilities",), ("유동부채",), {"BS"}),
    "noncurrent_assets": (("NoncurrentAssets",), ("비유동자산",), {"BS"}),
    "noncurrent_liabilities": (("NoncurrentLiabilities",), ("비유동부채",), {"BS"}),
    "capital_stock": (("IssuedCapital", "ShareCapital"), ("자본금",), {"BS"}),
    # Only the full-taxonomy API carries cash; 주요계정 stops at 유동자산.
    "cash": (
        ("CashAndCashEquivalents",),
        ("현금및현금성자산",),
        {"BS"},
    ),
}

# The multi-company API carries no account_id and only the 16 주요계정, so it
# is matched on account_nm alone. 이자수익 is the revenue line for banks, which
# file no 매출액.
MULTI_ACCOUNT_NAMES: dict[str, tuple[str, ...]] = {
    "revenue": ("매출액", "영업수익", "이자수익"),
    "profit": ("당기순이익(손실)", "당기순이익"),
    "operating_profit": ("영업이익", "영업이익(손실)"),
    "total_liabilities": ("부채총계",),
    "total_equity": ("자본총계",),
    "current_assets": ("유동자산",),
    "current_liabilities": ("유동부채",),
    "noncurrent_assets": ("비유동자산",),
    "noncurrent_liabilities": ("비유동부채",),
    "capital_stock": ("자본금",),
    # Absent from 주요계정 - only the priority tier's full-taxonomy fetch has them.
    "cash": (),
    "interest_expense": (),
}

# Balance-sheet rows live under sj_div "BS"; the income statement is IS/CIS.
MULTI_STATEMENT_DIV = {
    kind: ("BS" if kind in BALANCE_KINDS else "IS") for kind in MULTI_ACCOUNT_NAMES
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
    if not names:
        return None
    statement = MULTI_STATEMENT_DIV[kind]
    for fs_div in ("CFS", "OFS"):
        scoped = [row for row in rows if row.get("fs_div") == fs_div and row.get("sj_div") == statement]
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
    """(reports to fetch, recipe per quarter, the three annual reports).

    Quarters are walked newest-first. Each one first tries to be satisfied
    entirely from reports already in the set - the comparative columns of a
    newer report often cover an older quarter - and only falls back to its own
    report when nothing already fetched can produce it. That greedy pass is
    what keeps SERIES_LENGTH=6 quarters down to the same handful of reports
    that 5 used to need.
    """
    quarters = _last_n_quarters(year, quarter, QUARTER_SERIES_LENGTH)
    reports: set[ReportRef] = set()
    recipes: dict[tuple[int, int], Recipe] = {}

    for period in quarters:
        candidates = _quarter_recipes(*period)
        satisfied = next(
            (r for r in candidates if all(ref in reports for ref, _, _ in r)),
            None,
        )
        recipe = satisfied or candidates[0]
        recipes[period] = recipe
        if satisfied is None:
            reports.update(ref for ref, _, _ in recipe)

    # Each annual report carries 3 fiscal years (thstrm/frmtrm/bfefrmtrm), so
    # reports 2 years apart chain with one year of overlap: each one past the
    # first adds 2 distinct years.
    latest_complete_year = year if quarter == 4 else year - 1
    annuals: list[ReportRef] = [
        (latest_complete_year - 2 * step, REPORT_ANNUAL)
        for step in range((ANNUAL_SERIES_LENGTH + 1) // 2)
    ]
    reports.update(annuals)

    # Fetch order, not just the report set: almost every filter reads index 0
    # of a series (this quarter, this fiscal year), so those reports go first.
    # A plain sorted() puts the oldest annual report first instead - harmless
    # when every report gets fetched, but under a budget cutoff it means
    # everyone's *oldest* data arrives while *no one* has this year's, which is
    # what every index-0 read actually needs. Observed in production: a run
    # that got through 3 of 8 reports left annualNetIncome[0..2] null for every
    # single company, because the 3 it completed were the three oldest annual
    # reports and the current one was never reached.
    priority: list[ReportRef] = []
    seen: set[ReportRef] = set()

    def add(ref: ReportRef) -> None:
        if ref in reports and ref not in seen:
            seen.add(ref)
            priority.append(ref)

    for ref, _, _ in recipes[quarters[0]]:  # this quarter - quarterly series index 0
        add(ref)
    if annuals:
        add(annuals[0])  # this fiscal year - annual series index 0
    for ref in sorted(reports):  # everything else, deterministic order
        add(ref)

    return priority, recipes, annuals


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
    quarters = _last_n_quarters(year, quarter, QUARTER_SERIES_LENGTH)
    _, recipes, annuals = plan(year, quarter)

    def annual_years(kind: str) -> list[float | None]:
        """Newest first. The first report gives 3 years; each later one is 2
        years back and contributes its 2 older columns, since its newest column
        repeats the previous report's oldest."""
        values = [_amount(corp_reports, annuals[0], kind, field) for field in ("t", "f", "bf")]
        for ref in annuals[1:]:
            values.extend(_amount(corp_reports, ref, kind, field) for field in ("f", "bf"))
        return values[:ANNUAL_SERIES_LENGTH]

    series: dict[str, list[float | None]] = {}
    for kind, quarterly_key, annual_key in (
        ("profit", "quarterlyNetIncome", "annualNetIncome"),
        ("revenue", "quarterlyRevenue", "annualRevenue"),
        ("operating_profit", "quarterlyOperatingProfit", "annualOperatingProfit"),
    ):
        series[quarterly_key] = [_apply(corp_reports, recipes[period], kind) for period in quarters]
        series[annual_key] = annual_years(kind)
    series["annualInterestExpense"] = annual_years("interest_expense")

    # Balance-sheet items are a snapshot at each fiscal year end, so there is no
    # standalone-quarter equivalent to derive.
    for kind, key in (
        ("total_liabilities", "annualTotalLiabilities"),
        ("total_equity", "annualTotalEquity"),
        ("current_assets", "annualCurrentAssets"),
        ("current_liabilities", "annualCurrentLiabilities"),
        ("noncurrent_assets", "annualNonCurrentAssets"),
        ("noncurrent_liabilities", "annualNonCurrentLiabilities"),
        ("capital_stock", "annualCapitalStock"),
        ("cash", "annualCash"),
    ):
        series[key] = annual_years(kind)

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
    budget_seconds: float = COLLECT_BUDGET_SECONDS,
) -> tuple[dict[str, dict[str, list[float | None]]], bool]:
    """Fill `reports` for `corp_codes`, then derive each company's series.

    Every company is covered by the batched API; `priority_codes` are then
    re-fetched with the single-company API so their net income is
    지배기업소유주지분 rather than 당기순이익 총액.

    Returns (series by corp_code, daily_limit_reached). Hitting the quota stops
    collection but is not an error: whatever was gathered is kept and the next
    run resumes with only the missing reports. Running out of `budget_seconds`
    is handled the same way - see COLLECT_BUDGET_SECONDS.
    """
    store = reports if reports is not None else {}
    needed, _, _ = plan(*latest_quarter(now))
    limit_reached = threading.Event()
    lock = threading.Lock()
    deadline = time.monotonic() + budget_seconds

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

    # Not `with ThreadPoolExecutor(...) as executor:` on either pass below -
    # the context manager's __exit__ unconditionally calls shutdown(wait=True),
    # which re-joins every thread in self._threads including ones still
    # genuinely stuck in a call, silently undoing the wait=False in `finally`
    # and blocking anyway. Confirmed by reading Executor.__exit__ and
    # ThreadPoolExecutor.shutdown. Each pass gets its own executor so pass 2
    # isn't starved by threads pass 1 abandoned.
    batch_executor = ThreadPoolExecutor(max_workers=workers)
    try:
        futures = [batch_executor.submit(run_batch, job) for job in batch_jobs]
        try:
            remaining = max(0.0, deadline - time.monotonic())
            for index, future in enumerate(as_completed(futures, timeout=remaining), start=1):
                future.result()
                if index % 20 == 0:
                    LOGGER.info("DART 배치 %s/%s 완료", index, len(futures))
                    if on_progress:
                        on_progress(store)
        except TimeoutError:
            LOGGER.warning("DART 배치 수집이 제한시간을 초과해 중단합니다 - 나머지는 다음 실행에서 이어갑니다.")
    finally:
        batch_executor.shutdown(wait=False, cancel_futures=True)

    # --- pass 2: single-company upgrade for the priority tier ---------------
    # A company that fails here keeps its batch-sourced figures, so failures
    # are counted and summarised rather than logged 3,000 times.
    failures: list[str] = []
    blocked = threading.Event()
    consecutive_baseline = [0]
    priority = [code for code in priority_codes if code in set(corp_codes)]
    # Report-major, not company-major: `needed` is now priority-ordered (this
    # quarter and this fiscal year first - see plan()), so if this pass also
    # runs out of budget, the most load-bearing report lands on the most
    # companies rather than exhausting all 8 reports on a handful of them.
    upgrade_jobs = [
        (code, ref)
        for ref in needed
        for code in priority
        if (stored(code, ref) or {}).get("src") != "s"
    ]
    if upgrade_jobs and not limit_reached.is_set():
        LOGGER.info(
            "DART 전체 재무제표 보정: %s개 기업 × %s종 = %s개 요청 (지배주주지분 순이익)",
            len(priority), len(needed), len(upgrade_jobs),
        )

    def run_single(job: tuple[str, ReportRef]) -> None:
        code, ref = job
        if limit_reached.is_set() or blocked.is_set():
            return
        try:
            extracted = fetch_single(api_key, code, *ref)
        except DailyLimitReached:
            limit_reached.set()
            return
        except Exception as error:  # noqa: BLE001 - one company must not sink the run
            failures.append(f"{code}/{ref[0]}-{ref[1]}: {error}")
            if len(failures) - consecutive_baseline[0] >= CONSECUTIVE_FAILURE_LIMIT:
                blocked.set()
            return
        # A success means DART is answering again, so the streak restarts.
        consecutive_baseline[0] = len(failures)
        if extracted:
            put(code, ref, extracted)

    if not limit_reached.is_set():
        upgrade_executor = ThreadPoolExecutor(max_workers=workers)
        try:
            futures = [upgrade_executor.submit(run_single, job) for job in upgrade_jobs]
            try:
                remaining = max(0.0, deadline - time.monotonic())
                for index, future in enumerate(as_completed(futures, timeout=remaining), start=1):
                    future.result()
                    if index % 500 == 0:
                        LOGGER.info("DART 보정 %s/%s 완료", index, len(futures))
                        if on_progress:
                            on_progress(store)
            except TimeoutError:
                LOGGER.warning("DART 보정이 제한시간을 초과해 중단합니다 - 나머지는 다음 실행에서 이어갑니다.")
        finally:
            upgrade_executor.shutdown(wait=False, cancel_futures=True)

    if blocked.is_set():
        LOGGER.warning(
            "OpenDART가 연속 %s건 응답하지 않아 보정을 중단했습니다 - 다음 실행에서 남은 기업을 이어서 보정합니다.",
            CONSECUTIVE_FAILURE_LIMIT,
        )
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
