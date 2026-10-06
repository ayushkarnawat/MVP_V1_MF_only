# CAS Import Fixes — Phase 1: Safety Net, Frontend Quick Fixes, Error Messages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** Build the yardstick every later phase is measured with (a read-only reconciliation of our units against each CAS's own closing units, on a staging-only Import health page), fix the four frontend display bugs that need no backend change, and give every upload error a stable code and a sensible place in the UI.

**Architecture:** Reconciliation is computed on read, never stored: the CAS closing units and valuation NAV already sit in `imports.raw_parser_output` (casparser's full JSON, PAN-redacted) for every confirmed import. A new `services/import_/reconciliation.py` compares them per folio with a fresh FIFO run, the in-process holdings cache and the latest monthly snapshot. A new `api/dev_health.py` router (registered only when `ENVIRONMENT` is `staging` or `development`) exposes it. The frontend probes `GET /dev/status`; a 404 hides the link. Parse errors are classified by exception type in `parser.py`; the frontend places each error by `code`.

**Tech Stack:** FastAPI + SQLAlchemy 2, casparser 1.3.0 (`casparser.exceptions`), pypdfium2, React 19 + TypeScript + Vitest.

**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` issues #6, #13, #14, #15, #16, #22 (and the master index `2026-10-06-cas-import-fixes-00-index.md`, whose Global Constraints apply here).

## Global Constraints

See the master index. Additionally for this phase:
- **No migration in this phase.** Nothing here may add a column.
- **Deviation from the artifact, recorded:** the artifact stored the reconciliation in `folios.coverage_gap_details`. `coverage_gap.evaluate_folio_coverage_gaps` overwrites that column with `None` whenever a folio has no deficit (and runs on every delete), so a stored result would be wiped. Computing on read from `raw_parser_output` needs no storage at all and can never go stale. The mobile app has no profile screen, so the Import health page is reached only from the desktop Profile page (the artifact's "mobile profile sheet" doesn't exist).
- Dev routes return **404** (route not registered) outside `staging`/`development`; they are read-only (no `db.add`, no commit, no cache writes).

## Review Focus

1. **A folio present in an older import but absent from the newest one** (fund fully sold before the newer statement's start, so the newer CAS doesn't list it). Reconciliation must use the newest import that *contains* that folio, not the newest import overall. Test: `test_uses_newest_import_containing_the_folio` (Task 2).
2. **Two folios with the same folio number but different schemes, or one scheme printed under two spellings of the folio** ("4400918 / 3" vs "4400918/3"). Matching uses `people.folio_key` + ISIN, falling back to AMFI code then normalised name. Test: `test_folio_key_spacing_matches` (Task 2).
3. **A wrong password, then the right one, without re-choosing the file.** The file must stay selected; the error sits under the password field. Test: `keeps the file after wrong_password` (Task 8).
4. **A scanned PDF.** Must say "We can’t read this PDF", not "Could not identify the CAS issuer… NSDL and CDSL". Test: `test_scanned_pdf_maps_to_scanned_pdf` (Task 4).
5. **Health page opened by a user whose household has no imports.** Empty state, never 500. Test: `test_import_health_empty_household` (Task 3).

---

## File map

**Backend**
- Create `backend/app/services/import_/reconciliation.py` — CAS-vs-ours per folio.
- Modify `backend/app/services/dashboard/holdings.py` — add `peek_cached_holdings` (read-only).
- Create `backend/app/api/dev_health.py` — `GET /dev/status`, `GET /dev/import-health`.
- Modify `backend/app/main.py` — conditional registration.
- Modify `backend/app/services/import_/parser.py` — `classify_parse_error` by type; scanned-vs-unknown-issuer; drop stamp-duty skip warnings.
- Modify `backend/app/services/import_/confirm_people.py` — real `warnings` in the confirm response; `already_imported`.
- Modify `backend/app/api/imports.py` — empty password accepted; `already_imported` → 409.

**Frontend** (`frontend/src/`)
- Create `features/dev/ImportHealth.tsx`, `features/dev/api.ts`, `features/dev/useDevToolsEnabled.ts`.
- Modify `features/profile/ProfileView.tsx` — staging-only link; `features/dashboard/MainDashboardFlow.tsx` — renders the page.
- Create `features/dashboard/PlanBadge.tsx`; modify `features/dashboard/types.ts`, `components/HoldingsTable.tsx`, `features/dashboard/FundDetailModal.tsx`, mobile `MobileHoldingCard.tsx`, `MobileHoldingCardSummary.tsx`, `MobileFundDetailView.tsx`, `MobileFundDetailSheet.tsx`.
- Modify `features/dashboard/DashboardView.tsx`, `mobile/features/dashboard/MobileDashboardView.tsx` — hero totals, labels, row selection.
- Modify `features/import/useImportFlow.ts`, `UploadForm.tsx`, `ImportError.tsx`, `ImportFlow.tsx`; mobile `MobileImportView.tsx`, `MobileUploadForm.tsx`.

---

### Task 0: Restore and regenerate the synthetic suite

The synthetic folder was deleted from the working tree after commit `6821253` (its 12 code files are still in git; the generated PDFs were never committed). Every checkpoint in this plan depends on it.

**Files:**
- Restore: `Docs/CAS Files/synthetic/{README.md,cas_builder.py,layouts.py,gen_scenarios.py,gen_errors.py,truth.json,harness/*}`
- Regenerate: `Docs/CAS Files/synthetic/*.pdf`, `Docs/CAS Files/synthetic/errors/*.pdf`

- [ ] **Step 1: Confirm with the user that the deletion wasn't deliberate.** If it was (they want the suite out of the repo), restore it to `~/cas-synthetic/` instead and replace every `Docs/CAS Files/synthetic/` path in this plan with that path. Don't proceed without the answer.
- [ ] **Step 2: Restore the code files.**

```bash
cd "/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only"
git restore "Docs/CAS Files/synthetic"
```

- [ ] **Step 3: Regenerate the PDFs** (needs `reportlab` and `pikepdf`; the generator writes next to itself).

```bash
cd "Docs/CAS Files/synthetic"
python3 -m pip install --user reportlab pikepdf
python3 gen_scenarios.py
python3 gen_errors.py
ls *.pdf errors/*.pdf | wc -l
```

Expected: the files listed in the README (p20_*, p10_*, p7_*, p3_*, kfin_*, oldcams_p20_20yr, fam_10yr, p20_FY_altfolio, px_14yr, px_FY) plus `errors/err_*.pdf`.

- [ ] **Step 4: Verify the regenerated files match `truth.json`.** For three files, compare casparser's closing units with `truth.json` (the generator is deterministic; any difference means the restore is wrong).

```bash
python3 - <<'EOF'
import json, casparser
from decimal import Decimal as D
T = json.load(open("truth.json"))
for fn in ("p20_20yr.pdf", "p10_FY.pdf", "kfin_pk_10yr.pdf"):
    r = casparser.read_cas_pdf(fn, "MF@123")
    got = {(f.folio, s.isin or s.scheme): str(D(str(s.close))) for f in r.folios for s in f.schemes}
    print(fn, len(got), "funds")
EOF
```

Then open `truth.json` and check the same three files' closing units by eye for two funds each. Expected: identical.

- [ ] **Step 5: Fix the hard-coded path in the harness.** `harness/test_deep.py` and `harness/test_perf.py` set `SYN = "/mnt/c/.../Docs/CAS Files/synthetic/"`. Replace with a path relative to the file:

```python
from pathlib import Path
SYN = str(Path(__file__).resolve().parent.parent) + "/"
```

- [ ] **Step 6: Smoke-run one scenario.**

```bash
cd backend
SEQ=p3_FY.pdf OUT=/tmp/p3fy.json python3 -m pytest "../Docs/CAS Files/synthetic/harness/test_deep.py" -q --rootdir "../Docs/CAS Files/synthetic/harness"
```

Expected: the test runs (it may report value mismatches; that's today's bug, not a harness failure).

---

### Task 1: `peek_cached_holdings` — read the holdings cache without touching it

**Files:**
- Modify: `backend/app/services/dashboard/holdings.py` (after `invalidate_holdings_cache`)
- Test: `backend/tests/services/dashboard/test_holdings.py`

**Interfaces:**
- Produces: `peek_cached_holdings(household_member_ids: list[uuid.UUID]) -> list[HoldingRow] | None` — the cached rows for today's key if present and within TTL, else `None`. Never deletes, never computes.

- [ ] **Step 1: Write the failing tests** (append to `test_holdings.py`):

```python
from app.services.dashboard.holdings import _holdings_cache, _holdings_cache_lock, _HoldingsCacheEntry, peek_cached_holdings


def test_peek_cached_holdings_returns_none_when_cold():
    assert peek_cached_holdings([uuid.uuid4()]) is None


def test_peek_cached_holdings_returns_rows_without_removing_them():
    member_id = uuid.uuid4()
    key = ((member_id,), date.today())
    with _holdings_cache_lock:
        _holdings_cache[key] = _HoldingsCacheEntry(rows=["sentinel"], cached_at=time.monotonic())
    try:
        assert peek_cached_holdings([member_id]) == ["sentinel"]
        assert key in _holdings_cache
    finally:
        invalidate_holdings_cache(member_id)
```

(Add `import time` at the top of the test file if missing.)

- [ ] **Step 2: Run, expect FAIL** — `python3 -m pytest tests/services/dashboard/test_holdings.py -k peek -q` → ImportError.
- [ ] **Step 3: Implement** in `holdings.py`:

```python
def peek_cached_holdings(household_member_ids: list[uuid.UUID]) -> list[HoldingRow] | None:
    """Read-only look at today's cache entry (Import health page, #6). Never
    computes, evicts or extends anything: the page must not change what users see."""
    cache_key = (tuple(sorted(household_member_ids)), date.today())
    with _holdings_cache_lock:
        entry = _holdings_cache.get(cache_key)
        if entry is None or _holdings_cache_clock() - entry.cached_at > _HOLDINGS_CACHE_TTL_SECONDS:
            return None
        return entry.rows
```

- [ ] **Step 4: Run, expect PASS** — same command, then the whole file once: `python3 -m pytest tests/services/dashboard/test_holdings.py -q`.

---

### Task 2: Reconciliation service

**Files:**
- Create: `backend/app/services/import_/reconciliation.py`
- Test: `backend/tests/services/import_/test_reconciliation.py` (new)

**Interfaces:**
- Consumes: `holdings._process_folio_lots`, `holdings._LOT_CONSUMING_TYPES`, `holdings.peek_cached_holdings` (Task 1), `people.folio_key`, `enrich.normalize_name`, `nav._latest_cached_on_or_before`.
- Produces:

```python
@dataclass
class FolioReconciliation:
    folio_id: str
    household_member_id: str
    scheme_name: str
    folio_number: str
    plan_type: str
    cas_close_units: Decimal | None      # None: no import of ours lists this folio
    cas_statement_to: date | None
    fresh_units: Decimal
    cached_units: Decimal | None         # None: no warm cache entry
    cas_nav: Decimal | None
    cas_nav_date: date | None
    our_nav: Decimal | None              # nav_history for this scheme on cas_nav_date (cache only)
    status: Literal["match", "units_differ", "cache_stale", "no_cas_data"]
    diff_units: Decimal | None           # fresh − CAS

def reconcile_members(db: Session, member_ids: list[uuid.UUID]) -> list[FolioReconciliation]
def cas_closings(raw_parser_output: dict) -> list[dict]   # one dict per (folio, scheme) in the import
```

Rules:
- `cas_closings` reads casparser JSON: `folios[].folio`, `folios[].schemes[].{scheme,isin,amfi,close,valuation.{date,nav}}`. Values are strings or numbers; convert with `to_decimal`.
- For each `Folio` row of the members: take the newest `Import` (by `statement_to_date`, then `confirmed_at`) of that member with status `CONFIRMED` whose `raw_parser_output` contains an entry where `folio_key(entry.folio) == folio_key(folio.folio_number)` **and** (`entry.isin == scheme.isin` if both set, else `entry.amfi == scheme.amfi_code` if both set, else `normalize_name(entry.scheme) == normalize_name(scheme.name)`).
- `fresh_units` = `_process_folio_lots(sorted transactions)[0]`, transactions ordered exactly like `holdings.compute_holdings` (date, consuming-after-adding, id).
- `cached_units`: from `peek_cached_holdings(member_ids)`: the row with the same `(scheme_id, household_member_id, plan_type)`; note holdings rows sum all folios of that key, so `cached_units` is compared against the sum of `fresh_units` over folios sharing the key (store that sum on each folio's row as the comparison basis).
- `status`: `no_cas_data` if `cas_close_units is None`; else `units_differ` if `fresh_units != cas_close_units` (compare at 3 dp); else `cache_stale` if `cached_units is not None` and it differs from the fresh key-sum; else `match`.
- Read-only: no `db.add`, no flush, no commit.

- [ ] **Step 1: Write the failing tests** in `backend/tests/services/import_/test_reconciliation.py`:

```python
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import ImportStatus, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.import_.reconciliation import cas_closings, reconcile_members


def _db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False)()


def _raw(folio, scheme, isin, close, nav="10.0000", nav_date="2026-10-05"):
    return {"folios": [{"folio": folio, "amc": "AMC", "PAN": None, "schemes": [
        {"scheme": scheme, "isin": isin, "amfi": "100001", "open": "0", "close": close,
         "valuation": {"date": nav_date, "nav": nav, "value": "0", "cost": "0"}, "transactions": []}]}]}


def _setup(db, folio_number="4400918/3"):
    user = User(id=uuid.uuid4(), phone_number="+919999999999")
    db.add(user)
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Me", relationship=Relationship.SELF,
                             created_at=datetime.now(timezone.utc))
    scheme = Scheme(id=uuid.uuid4(), amfi_code="100001", isin="INF000A01", name="Nippon Small Cap - Regular - Growth",
                    amc_name="Nippon", sebi_category="Equity Scheme - Small Cap Fund")
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id,
                  folio_number=folio_number, plan_type=PlanType.REGULAR)
    db.add_all([member, scheme, folio])
    db.flush()
    return member, scheme, folio


def _import(db, member, raw, statement_to, confirmed_at=None):
    imp = Import(id=uuid.uuid4(), household_member_id=member.id, status=ImportStatus.CONFIRMED,
                 raw_parser_output=raw, uploaded_at=datetime.now(timezone.utc),
                 confirmed_at=confirmed_at or datetime.now(timezone.utc), statement_to_date=statement_to)
    db.add(imp)
    db.flush()
    return imp


def _buy(db, folio, imp, units, on=date(2020, 1, 1)):
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=imp.id, type=TransactionType.PURCHASE,
                       date=on, amount=Decimal("1000.00"), units=Decimal(units), nav=Decimal("10.0000")))
    db.flush()


def test_cas_closings_reads_close_and_valuation():
    rows = cas_closings(_raw("1/2", "X Fund", "INF1", "12.345", nav="20.5000"))
    assert rows == [{"folio": "1/2", "scheme": "X Fund", "isin": "INF1", "amfi": "100001",
                     "close": Decimal("12.345"), "nav": Decimal("20.5000"), "nav_date": date(2026, 10, 5)}]


def test_match_when_units_equal_cas_close():
    db = _db()
    member, scheme, folio = _setup(db)
    imp = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "100.000"), date(2026, 10, 5))
    _buy(db, folio, imp, "100.000")
    [row] = reconcile_members(db, [member.id])
    assert row.status == "match" and row.diff_units == Decimal("0")


def test_units_differ_reports_signed_difference():
    db = _db()
    member, scheme, folio = _setup(db)
    imp = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "289301.004"), date(2026, 10, 5))
    _buy(db, folio, imp, "299034.210")
    [row] = reconcile_members(db, [member.id])
    assert row.status == "units_differ"
    assert row.diff_units == Decimal("9733.206")


def test_folio_key_spacing_matches():
    db = _db()
    member, scheme, folio = _setup(db, folio_number="4400918 / 3")
    imp = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "5.000"), date(2026, 10, 5))
    _buy(db, folio, imp, "5.000")
    [row] = reconcile_members(db, [member.id])
    assert row.status == "match"


def test_uses_newest_import_containing_the_folio():
    db = _db()
    member, scheme, folio = _setup(db)
    old = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "7.000"), date(2025, 3, 31))
    _import(db, member, {"folios": []}, date(2026, 10, 5))  # newer import without this folio
    _buy(db, folio, old, "7.000")
    [row] = reconcile_members(db, [member.id])
    assert row.cas_close_units == Decimal("7.000") and row.cas_statement_to == date(2025, 3, 31)


def test_no_cas_data_when_no_import_lists_the_folio():
    db = _db()
    member, scheme, folio = _setup(db)
    imp = _import(db, member, {"folios": []}, date(2026, 10, 5))
    _buy(db, folio, imp, "1.000")
    [row] = reconcile_members(db, [member.id])
    assert row.status == "no_cas_data"


def test_reconcile_is_read_only():
    db = _db()
    member, scheme, folio = _setup(db)
    imp = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "1.000"), date(2026, 10, 5))
    _buy(db, folio, imp, "1.000")
    db.commit()
    reconcile_members(db, [member.id])
    assert not db.new and not db.dirty
```

(If `User` needs other non-null columns in this codebase, copy the minimal constructor from `tests/services/dashboard/test_holdings.py::_household_member`.)

- [ ] **Step 2: Run, expect FAIL** — `python3 -m pytest tests/services/import_/test_reconciliation.py -q` → ModuleNotFoundError.
- [ ] **Step 3: Implement** `backend/app/services/import_/reconciliation.py`:

```python
"""Import health (#6): our units vs the CAS's own closing units, per folio.

Computed on read from imports.raw_parser_output (casparser's JSON, PAN-redacted),
never stored: coverage_gap_details is rewritten by every gap evaluation, and a
stored copy could go stale. Strictly read-only -- the staging page must not
change anything users see."""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_units, to_decimal
from app.models.enums import ImportStatus
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.services.dashboard.holdings import _LOT_CONSUMING_TYPES, _process_folio_lots, peek_cached_holdings
from app.services.dashboard.nav import _latest_cached_on_or_before
from app.services.import_.enrich import normalize_name
from app.services.import_.people import folio_key

Status = Literal["match", "units_differ", "cache_stale", "no_cas_data"]


@dataclass
class FolioReconciliation:
    folio_id: str
    household_member_id: str
    scheme_name: str
    folio_number: str
    plan_type: str
    cas_close_units: Decimal | None
    cas_statement_to: date | None
    fresh_units: Decimal
    cached_units: Decimal | None
    cas_nav: Decimal | None
    cas_nav_date: date | None
    our_nav: Decimal | None
    status: Status
    diff_units: Decimal | None


def _date(value: Any) -> date | None:
    if not value:
        return None
    return date.fromisoformat(str(value)[:10])


def cas_closings(raw: dict | None) -> list[dict]:
    out: list[dict] = []
    for f in (raw or {}).get("folios") or []:
        for s in f.get("schemes") or []:
            valuation = s.get("valuation") or {}
            out.append({
                "folio": f.get("folio"), "scheme": s.get("scheme"), "isin": s.get("isin"), "amfi": s.get("amfi"),
                "close": quantize_units(to_decimal(s["close"])) if s.get("close") is not None else None,
                "nav": to_decimal(valuation["nav"]) if valuation.get("nav") is not None else None,
                "nav_date": _date(valuation.get("date")),
            })
    return out


def _same_scheme(entry: dict, scheme: Scheme) -> bool:
    if entry.get("isin") and scheme.isin:
        return entry["isin"] == scheme.isin
    if entry.get("amfi") and scheme.amfi_code:
        return str(entry["amfi"]) == scheme.amfi_code
    return normalize_name(entry.get("scheme") or "") == normalize_name(scheme.name)


def reconcile_members(db: Session, member_ids: list[uuid.UUID]) -> list[FolioReconciliation]:
    if not member_ids:
        return []
    folios = db.query(Folio).filter(Folio.household_member_id.in_(member_ids)).all()
    if not folios:
        return []
    schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios})).all()}
    imports = (
        db.query(Import)
        .filter(Import.household_member_id.in_(member_ids), Import.status == ImportStatus.CONFIRMED)
        .all()
    )
    # Newest first: statement end, then confirm time (manual opening-balance
    # imports have no raw output and are skipped naturally).
    imports.sort(key=lambda i: (i.statement_to_date or date.min, i.confirmed_at or i.uploaded_at), reverse=True)
    closings = {i.id: cas_closings(i.raw_parser_output) for i in imports}

    txns = (
        db.query(Transaction)
        .filter(Transaction.folio_id.in_([f.id for f in folios]))
        .order_by(Transaction.date, case((Transaction.type.in_(_LOT_CONSUMING_TYPES), 1), else_=0), Transaction.id)
        .all()
    )
    by_folio: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    for t in txns:
        by_folio[t.folio_id].append(t)

    fresh = {f.id: _process_folio_lots(by_folio.get(f.id, []))[0] for f in folios}
    key_sum: dict[tuple, Decimal] = defaultdict(Decimal)
    for f in folios:
        key_sum[(f.household_member_id, f.scheme_id, f.plan_type)] += fresh[f.id]
    cached_rows = peek_cached_holdings(member_ids) or []
    cached = {
        (uuid.UUID(r.household_member_id), uuid.UUID(r.scheme_id), r.plan_type): Decimal(r.units_held)
        for r in cached_rows
    }

    out: list[FolioReconciliation] = []
    for f in folios:
        scheme = schemes[f.scheme_id]
        entry, statement_to = None, None
        for imp in imports:
            if imp.household_member_id != f.household_member_id:
                continue
            entry = next(
                (e for e in closings[imp.id]
                 if e["folio"] and folio_key(e["folio"]) == folio_key(f.folio_number) and _same_scheme(e, scheme)),
                None,
            )
            if entry is not None:
                statement_to = imp.statement_to_date
                break
        key = (f.household_member_id, f.scheme_id, f.plan_type)
        cached_units = cached.get(key)
        cas_close = entry["close"] if entry else None
        our_nav = None
        if entry and entry["nav_date"]:
            cached_nav = _latest_cached_on_or_before(db, scheme.id, entry["nav_date"])
            our_nav = cached_nav.nav if cached_nav and cached_nav.date == entry["nav_date"] else None
        if cas_close is None:
            status: Status = "no_cas_data"
        elif quantize_units(fresh[f.id]) != cas_close:
            status = "units_differ"
        elif cached_units is not None and quantize_units(cached_units) != quantize_units(key_sum[key]):
            status = "cache_stale"
        else:
            status = "match"
        out.append(FolioReconciliation(
            folio_id=str(f.id), household_member_id=str(f.household_member_id), scheme_name=scheme.name,
            folio_number=f.folio_number, plan_type=f.plan_type.value,
            cas_close_units=cas_close, cas_statement_to=statement_to,
            fresh_units=quantize_units(fresh[f.id]), cached_units=cached_units,
            cas_nav=entry["nav"] if entry else None, cas_nav_date=entry["nav_date"] if entry else None,
            our_nav=our_nav, status=status,
            diff_units=(quantize_units(fresh[f.id]) - cas_close) if cas_close is not None else None,
        ))
    return out
```

- [ ] **Step 4: Run, expect PASS** — `python3 -m pytest tests/services/import_/test_reconciliation.py -q`.

---

### Task 3: Staging-only dev router

**Files:**
- Create: `backend/app/api/dev_health.py`
- Modify: `backend/app/main.py` (after the existing `include_router` lines)
- Test: `backend/tests/api/test_dev_health_routes.py` (new)

**Interfaces:**
- Consumes: `reconcile_members` (Task 2), `member_details.require_member`, `get_active_user`, `get_db`, `models.snapshot.PortfolioSnapshot`.
- Produces:
  - `DEV_ENVIRONMENTS = {"staging", "development"}`
  - `register_dev_routes(app: FastAPI, environment: str) -> bool` (True when registered)
  - `GET /dev/status` → `{"enabled": true}`
  - `GET /dev/import-health?household_member_id=<uuid>` (omit for the whole household) → `ImportHealthResponse`:

```python
class FolioHealth(BaseModel):
    folio_id: str; household_member_id: str; household_member_name: str
    scheme_name: str; folio_number: str; plan_type: str
    cas_close_units: str | None; cas_statement_to: date | None
    fresh_units: str; cached_units: str | None
    cas_nav: str | None; cas_nav_date: date | None; our_nav: str | None
    status: Literal["match", "units_differ", "cache_stale", "no_cas_data"]
    diff_units: str | None

class HistoryCacheHealth(BaseModel):
    household_member_id: str; latest_month: date | None; cached_value: str | None

class ImportHealthResponse(BaseModel):
    folios: list[FolioHealth]
    history: list[HistoryCacheHealth]
    warnings: list[str]          # casparser parse_warnings of each member's newest import
    last_import_at: datetime | None
```

- [ ] **Step 1: Write the failing tests** (`backend/tests/api/test_dev_health_routes.py`):

```python
from fastapi import FastAPI

from app.api.dev_health import register_dev_routes
from tests.api.import_helpers import _authed_headers_and_member


def test_not_registered_in_production():
    app = FastAPI()
    assert register_dev_routes(app, "production") is False
    assert not any(getattr(r, "path", "").startswith("/dev") for r in app.routes)


def test_registered_in_staging():
    app = FastAPI()
    assert register_dev_routes(app, "staging") is True
    assert any(getattr(r, "path", "") == "/dev/import-health" for r in app.routes)


def test_status_route(client):
    headers, _ = _authed_headers_and_member(client, "+919800000101")
    assert client.get("/dev/status", headers=headers).json() == {"enabled": True}


def test_import_health_empty_household(client):
    headers, _ = _authed_headers_and_member(client, "+919800000102")
    body = client.get("/dev/import-health", headers=headers).json()
    assert body["folios"] == [] and body["last_import_at"] is None


def test_import_health_other_users_member_is_404(client):
    _, other_member = _authed_headers_and_member(client, "+919800000103")
    headers, _ = _authed_headers_and_member(client, "+919800000104")
    assert client.get(f"/dev/import-health?household_member_id={other_member}", headers=headers).status_code == 404


def test_import_health_requires_auth(client):
    assert client.get("/dev/import-health").status_code == 401
```

(The `client` fixture is in `backend/tests/conftest.py`; its app is `app.main.app`, built with the default `environment="development"`, so the routes are registered.)

- [ ] **Step 2: Run, expect FAIL.** `python3 -m pytest tests/api/test_dev_health_routes.py -q`
- [ ] **Step 3: Implement** `backend/app/api/dev_health.py`:

```python
"""Staging-only developer tools (#6). Registered by main.py only when
ENVIRONMENT is staging or development; elsewhere these paths are 404.
Read-only by construction."""

import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.enums import ImportStatus
from app.models.imports import Import
from app.models.snapshot import PortfolioSnapshot
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.dashboard.member_details import require_member
from app.services.import_.reconciliation import reconcile_members

DEV_ENVIRONMENTS = {"staging", "development"}
router = APIRouter(prefix="/dev", tags=["dev"])


class FolioHealth(BaseModel):
    folio_id: str
    household_member_id: str
    household_member_name: str
    scheme_name: str
    folio_number: str
    plan_type: str
    cas_close_units: str | None
    cas_statement_to: date | None
    fresh_units: str
    cached_units: str | None
    cas_nav: str | None
    cas_nav_date: date | None
    our_nav: str | None
    status: Literal["match", "units_differ", "cache_stale", "no_cas_data"]
    diff_units: str | None


class HistoryCacheHealth(BaseModel):
    household_member_id: str
    latest_month: date | None
    cached_value: str | None


class ImportHealthResponse(BaseModel):
    folios: list[FolioHealth]
    history: list[HistoryCacheHealth]
    warnings: list[str]
    last_import_at: datetime | None


def _s(v) -> str | None:
    return None if v is None else str(v)


@router.get("/status")
def dev_status(user: User = Depends(get_active_user)) -> dict:
    return {"enabled": True}


@router.get("/import-health", response_model=ImportHealthResponse)
def import_health(
    household_member_id: uuid.UUID | None = None,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
) -> ImportHealthResponse:
    if household_member_id is not None:
        members = [require_member(db, user.id, household_member_id)]
    else:
        members = db.query(HouseholdMember).filter(HouseholdMember.user_id == user.id).all()
    ids = [m.id for m in members]
    names = {str(m.id): m.name for m in members}
    rows = reconcile_members(db, ids)
    imports = (
        db.query(Import)
        .filter(Import.household_member_id.in_(ids), Import.status == ImportStatus.CONFIRMED)
        .order_by(Import.confirmed_at.desc())
        .all()
    ) if ids else []
    warnings: list[str] = []
    seen: set[uuid.UUID] = set()
    for imp in imports:
        if imp.household_member_id in seen:
            continue
        seen.add(imp.household_member_id)
        warnings.extend((imp.raw_parser_output or {}).get("parse_warnings") or [])
    history = []
    for m in members:
        snap = (
            db.query(PortfolioSnapshot)
            .filter(PortfolioSnapshot.household_member_id == m.id)
            .order_by(PortfolioSnapshot.snapshot_month.desc())
            .first()
        )
        history.append(HistoryCacheHealth(
            household_member_id=str(m.id),
            latest_month=snap.snapshot_month if snap else None,
            cached_value=_s(snap.total_value) if snap else None,
        ))
    return ImportHealthResponse(
        folios=[FolioHealth(
            folio_id=r.folio_id, household_member_id=r.household_member_id,
            household_member_name=names[r.household_member_id], scheme_name=r.scheme_name,
            folio_number=r.folio_number, plan_type=r.plan_type,
            cas_close_units=_s(r.cas_close_units), cas_statement_to=r.cas_statement_to,
            fresh_units=str(r.fresh_units), cached_units=_s(r.cached_units),
            cas_nav=_s(r.cas_nav), cas_nav_date=r.cas_nav_date, our_nav=_s(r.our_nav),
            status=r.status, diff_units=_s(r.diff_units),
        ) for r in rows],
        history=history,
        warnings=[w for w in warnings if "STAMP" not in w.upper()],
        last_import_at=imports[0].confirmed_at if imports else None,
    )


def register_dev_routes(app: FastAPI, environment: str) -> bool:
    if environment not in DEV_ENVIRONMENTS:
        return False
    app.include_router(router)
    return True
```

In `backend/app/main.py`, after `app.include_router(legal.router)`:

```python
from app.api.dev_health import register_dev_routes  # noqa: E402

# Staging/development only (#6 Import health); production never registers it.
register_dev_routes(app, settings.environment)
```

- [ ] **Step 4: Run, expect PASS.** `python3 -m pytest tests/api/test_dev_health_routes.py tests/test_health.py -q`

---

### Task 4: Parse errors classified by type (#22, backend)

**Files:**
- Modify: `backend/app/services/import_/parser.py:201-213` (`classify_parse_error`), `:329-361` (`parse_cas_pdf_bytes`)
- Modify: `backend/app/api/imports.py` (the `/imports/parse` route's `password` parameter)
- Test: `backend/tests/services/import_/test_parser.py`, `backend/tests/api/test_imports_routes.py`

**Interfaces:**
- Produces error codes (stable, used by the frontend): `wrong_password`, `scanned_pdf`, `damaged_pdf`, `unknown_issuer`, `summary_cas` (exists), `demat_cas` (exists), `parse_failed` (fallback). `unreadable_pdf` is removed; grep the frontend for it and replace with `scanned_pdf`.
- Messages (verbatim from the artifact's #22 table):
  - `wrong_password`: "That password didn’t open the file. It’s usually your PAN in capitals, or the password you set when requesting the CAS."
  - `scanned_pdf`: "We can’t read this PDF. It looks like a scan or a photo, so there’s no text in it to read. Download the statement again from CAMS or KFintech as a PDF; don’t print or scan it."
  - `damaged_pdf`: "This file looks incomplete. Download it again."
  - `unknown_issuer`: "This isn’t a CAMS or KFintech statement. Download your Consolidated Account Statement from CAMS or KFintech."
  - `demat_cas`: "Demat statements aren’t supported yet; use the CAMS/KFintech CAS."

- [ ] **Step 1: Write the failing tests** (append to `test_parser.py`):

```python
import pypdfium2
from casparser.exceptions import CASParseError, IncorrectPasswordError

from app.services.import_.parser import classify_parse_error


def test_incorrect_password_maps_to_wrong_password():
    assert classify_parse_error(IncorrectPasswordError("bad")).code == "wrong_password"


def test_pdfium_error_maps_to_damaged_pdf():
    assert classify_parse_error(pypdfium2.PdfiumError("Data format error")).code == "damaged_pdf"


def test_unknown_issuer_with_text_maps_to_unknown_issuer():
    exc = CASParseError("Could not identify the CAS issuer. Supported issuers are CAMS, KFintech, NSDL, and CDSL.")
    assert classify_parse_error(exc, has_text=True).code == "unknown_issuer"


def test_scanned_pdf_maps_to_scanned_pdf():
    exc = CASParseError("Could not identify the CAS issuer. Supported issuers are CAMS, KFintech, NSDL, and CDSL.")
    err = classify_parse_error(exc, has_text=False)
    assert err.code == "scanned_pdf"
    assert "NSDL" not in err.message


def test_unrelated_text_error_is_not_scanned():
    # The old keyword rule mapped any message containing "text" to unreadable.
    assert classify_parse_error(ValueError("bad text encoding in row 3")).code == "parse_failed"


def test_parse_error_on_error_pdfs():
    from pathlib import Path
    from app.services.import_.parser import ParseError, parse_cas_pdf_bytes
    errors = Path(__file__).resolve().parents[4] / "Docs" / "CAS Files" / "synthetic" / "errors"
    if not errors.exists():
        pytest.skip("synthetic error PDFs not generated (Task 0)")
    expected = {"err_scanned.pdf": "scanned_pdf", "err_truncated.pdf": "damaged_pdf"}
    for name, code in expected.items():
        with pytest.raises(ParseError) as info:
            parse_cas_pdf_bytes((errors / name).read_bytes(), "MF@123")
        assert info.value.code == code, name
```

(Check `errors/` for the exact file names `gen_errors.py` produces and adjust the two keys; the suite has a scanned file and a truncated file.)

Append to `backend/tests/api/test_imports_routes.py`:

```python
def test_parse_accepts_empty_password_field(client, tmp_path):
    headers, member_id = _authed_headers_and_member(client, "+919800000201")
    with patch("app.api.imports.parse_cas_pdf_bytes", side_effect=ParseError("wrong_password", "x")):
        r = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "", "household_member_id": member_id, "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
            headers=headers,
        )
    assert r.status_code == 422 and r.json()["detail"]["code"] == "wrong_password"
```

(Import `ParseError` from `app.services.import_.parser` and `PAN_DISCLAIMER_VERSION` from `tests.api.import_helpers` if not already.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Replace `classify_parse_error` in `parser.py`:

```python
from casparser.exceptions import CASParseError, IncorrectPasswordError
import pypdfium2

_UNKNOWN_ISSUER = "could not identify the cas issuer"
MESSAGES = {
    "wrong_password": "That password didn’t open the file. It’s usually your PAN in capitals, or the password you set when requesting the CAS.",
    "scanned_pdf": "We can’t read this PDF. It looks like a scan or a photo, so there’s no text in it to read. Download the statement again from CAMS or KFintech as a PDF; don’t print or scan it.",
    "damaged_pdf": "This file looks incomplete. Download it again.",
    "unknown_issuer": "This isn’t a CAMS or KFintech statement. Download your Consolidated Account Statement from CAMS or KFintech.",
}


def classify_parse_error(exc: Exception, *, has_text: bool = True) -> ParseError:
    """#22: by exception type, never by keywords in the message (the old rule
    sent any message containing "text" to "scanned")."""
    if isinstance(exc, IncorrectPasswordError):
        return ParseError("wrong_password", MESSAGES["wrong_password"])
    if isinstance(exc, pypdfium2.PdfiumError):
        # pypdfium2 raises PdfiumError for both a bad password and a broken
        # file; its message says which.
        if "password" in str(exc).lower():
            return ParseError("wrong_password", MESSAGES["wrong_password"])
        return ParseError("damaged_pdf", MESSAGES["damaged_pdf"])
    if isinstance(exc, CASParseError) and _UNKNOWN_ISSUER in str(exc).lower():
        code = "unknown_issuer" if has_text else "scanned_pdf"
        return ParseError(code, MESSAGES[code])
    return ParseError("parse_failed", str(exc)[:500])


def _has_text_layer(path: str, password: str) -> bool:
    try:
        doc = pypdfium2.PdfDocument(path, password=password)
    except Exception:
        return True  # can't tell; don't claim "scanned"
    try:
        for i in range(min(len(doc), 3)):
            if doc[i].get_textpage().get_text_range().strip():
                return True
        return False
    finally:
        doc.close()
```

In `parse_cas_pdf_bytes`, change the `except Exception as exc:` branch to:

```python
    except Exception as exc:
        raise classify_parse_error(exc, has_text=_has_text_layer(tmp_path, password)) from exc
```

(`_has_text_layer` must run before the `finally` unlinks the temp file — it does, because `except` runs before `finally`.)

Replace the `demat_cas` message with `"Demat statements aren’t supported yet; use the CAMS/KFintech CAS."`.

In `api/imports.py`, the parse route's `password: str = Form(...)` becomes `password: str = Form("")` so an empty field reaches the parser and returns `wrong_password` (an encrypted PDF) instead of pydantic's raw 422.

- [ ] **Step 4: Run, expect PASS.** `python3 -m pytest tests/services/import_/test_parser.py tests/api/test_imports_routes.py -q`; then `grep -rn "unreadable_pdf" backend frontend/src` and fix every hit.

---

### Task 5: Real warnings in the confirm response, and "already imported" (#6, #22)

**Files:**
- Modify: `backend/app/services/import_/parser.py:283-291` (skip warnings)
- Modify: `backend/app/services/import_/confirm_people.py` (`_confirm_claimed`, new `AlreadyImportedError`)
- Modify: `backend/app/api/imports.py` (confirm route error mapping)
- Test: `backend/tests/services/import_/test_parser.py`, `backend/tests/api/test_imports_people_routes.py`

**Interfaces:**
- Produces: `confirm_people.AlreadyImportedError(Exception)` with `code = "already_imported"`, `message = "This statement was already imported."`; route maps it to **409** `{"code": "already_imported", "message": ...}`.
- `ImportConfirmResponse.warnings` now carries `parse_result.parse_warnings` minus stamp-duty/STT skip lines.

Rules:
- In `parser.py`, a skipped row whose normalized type is `STAMP_DUTY` or `STT` adds no warning (155 such lines on a 10-year file drowned the real ones). Other skips still warn (phase 2/3 make them rare).
- "Already imported": after `_validate_schemes` and before `_finalise_pan_claims`, if **every** included transaction already exists for the resolved member (same check `_write_person_rows` uses today) **and** every work has an existing `member_id`, raise `AlreadyImportedError` — no Import row, no file stored. A re-upload of the same statement today writes an empty Import; after this it gets the message instead (decided: "This statement was already imported", #22).

- [ ] **Step 1: Write the failing tests.** In `test_parser.py`:

```python
def test_skipped_stamp_duty_rows_do_not_warn():
    txn = MagicMock(date="2024-01-01", description="*** Stamp Duty ***", amount="0.25", units=None,
                    nav=None, type="STAMP_DUTY_TAX")
    scheme = MagicMock(scheme="X Fund - Direct Plan - Growth", isin="INF1", amfi="1", type="EQUITY",
                       advisor=None, transactions=[txn])
    folio = MagicMock(folio="1/1", amc="X", PAN="ABCDE1234F", schemes=[scheme])
    data = MagicMock(cas_type=CASFileType.DETAILED, file_type=FileType.CAMS,
                     investor_info=MagicMock(email="t@example.com"), folios=[folio], parse_warnings=[])
    data.model_dump_json.return_value = "{}"
    assert not any("Stamp" in w for w in _normalize_cas_data(data).parse_warnings)
```

In `test_imports_people_routes.py` (reuse its existing helpers for a single-person upload, e.g. `_parse` + the confirm call those tests already make):

```python
def test_second_upload_of_same_statement_is_already_imported(client, tmp_path):
    headers, member_id = _authed_headers_and_member(client, "+919800000301")
    first = _parse(client, headers, member_id, sample_result(), tmp_path).json()
    assert client.post("/imports/confirm", json=_confirm_body(first), headers=headers).status_code == 200
    second = _parse(client, headers, member_id, sample_result(), tmp_path).json()
    r = client.post("/imports/confirm", json=_confirm_body(second), headers=headers)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "already_imported"


def test_confirm_returns_real_parse_warnings(client, tmp_path):
    headers, member_id = _authed_headers_and_member(client, "+919800000302")
    result = sample_result()
    result.parse_warnings = ["Balance mismatch for folio 1/1"]
    preview = _parse(client, headers, member_id, result, tmp_path).json()
    body = client.post("/imports/confirm", json=_confirm_body(preview), headers=headers).json()
    assert body["warnings"] == ["Balance mismatch for folio 1/1"]
```

(`sample_result` / `_confirm_body`: use the helpers these route tests already define for a one-person statement; if the file builds the request inline, copy that inline body into a local `_confirm_body(preview)` helper.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** In `parser.py`'s skip branch:

```python
                if amount is None or units is None or nav is None:
                    if normalize_txn_type(txn.type) not in (TransactionType.STAMP_DUTY, TransactionType.STT):
                        parse_warnings.append(...)  # unchanged text
                    continue
```

In `confirm_people.py` add:

```python
class AlreadyImportedError(Exception):
    """Every row of this statement is already saved for the same people (#22)."""
    code = "already_imported"
    message = "This statement was already imported."
```

and in `_confirm_claimed`, right after `_validate_schemes(...)`:

```python
    if all(w.member_id is not None for w in works) and _all_rows_exist(db, works, txns_of, previews, key_to_temp, overrides):
        raise AlreadyImportedError()
```

with

```python
def _all_rows_exist(db, works, txns_of, previews, key_to_temp, overrides) -> bool:
    for w in works:
        for key in w.scheme_keys:
            for t in txns_of.get(key, []):
                temp_id = key_to_temp[key]
                override = overrides.get(temp_id)
                code = (override.amfi_code if override and override.amfi_code else None) or previews[temp_id].suggested_amfi_code
                scheme = db.query(Scheme).filter_by(amfi_code=code).first()
                folio = scheme and db.query(Folio).filter_by(
                    household_member_id=w.member_id, scheme_id=scheme.id, folio_number=t.folio).first()
                if folio is None or db.query(Transaction.id).filter_by(
                        folio_id=folio.id, date=t.txn_date, amount=t.amount, units=t.units, type=t.txn_type).first() is None:
                    return False
    return True
```

(Phases 3 and 4 change the dedupe identity; each of those phases updates `_all_rows_exist` to call the same matcher `_write_person_rows` uses. Keep it a separate function so that's a one-line change.)

At the end of `_confirm_claimed`, the response gets `warnings=[w for w in parse_result.parse_warnings if "stamp" not in w.lower()]`.

In `api/imports.py`'s confirm route, map `AlreadyImportedError` like the other confirm errors: `raise HTTPException(409, {"code": exc.code, "message": exc.message})`. The session is spent (same as a successful confirm): in `confirm_people._confirm`, catch `AlreadyImportedError` before the generic `BaseException` branch and call `return_confirmed_session(session_id, session, lock, keep=False)` then re-raise, after `db.rollback()` (nothing was written; PAN claims are untouched because the check runs before `_finalise_pan_claims`). Also release the session's pending claims via `service._release_session_claims(db, session)` and commit, so a pending PAN claim from the upload doesn't sit 65 minutes.

- [ ] **Step 4: Run, expect PASS** — the two test files, plus `grep -rln "warnings" backend/tests/api | xargs` for any test asserting `warnings == []`.

---

### Task 6: Frontend — Import health page (staging)

**Files:**
- Create: `frontend/src/features/dev/api.ts`, `frontend/src/features/dev/useDevToolsEnabled.ts`, `frontend/src/features/dev/ImportHealth.tsx`, `frontend/src/features/dev/ImportHealth.test.tsx`
- Modify: `frontend/src/features/profile/ProfileView.tsx` (link), `frontend/src/features/dashboard/MainDashboardFlow.tsx` (render)

**Interfaces:**
- Consumes: `GET /dev/status`, `GET /dev/import-health` (Task 3).
- Produces: `useDevToolsEnabled(): boolean` (false until `/dev/status` returns 200; any error → false, never retried in a loop); `<ImportHealth memberId?: string onBack: () => void />`.

UI (copy verbatim from the artifact's #6 mock):
- Header "Import health", subtitle "{household or member name} · last import {date, time} · checks our numbers against the CAS", button "Re-run check" (refetch).
- Four tiles: "{n} folios match the CAS" (green), "{n} units differ" (red), "{n} cache stale" (amber), "{a} / {b} NAV check passed" (b = rows with both `cas_nav` and `our_nav`).
- Filter chips "All {n}", "Problems only {n}", member select when the household has >1 member.
- Table columns: Fund · folio | CAS closing units | Our units (fresh) | Our units (cached) | NAV check | History cache | Status. Status chip: "✓ Match", "✗ {diff} units" (signed, 3 dp), "! Cache stale", "No CAS data".
- A "units_differ" row expands on click to "Why: {abs diff} units short/extra." (the "likely cause" hint is a static lookup on the diff: equals one SIP instalment's units → "same-day twin SIP dropped (#2)"; otherwise omitted — keep it simple).
- Warnings box "casparser warnings for this import ({n}):" listing `warnings`.
- Under 640px width the table becomes one card per folio (status chip on top).

- [ ] **Step 1: Write the failing tests** (`ImportHealth.test.tsx`):

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { ImportHealth } from "./ImportHealth";
import * as api from "./api";

const body = {
  folios: [
    { folio_id: "f1", household_member_id: "m1", household_member_name: "Vikram", scheme_name: "PPFAS Flexi Cap", folio_number: "1047392/12",
      plan_type: "direct", cas_close_units: "18402.117", cas_statement_to: "2026-10-05", fresh_units: "18402.117", cached_units: "18402.117",
      cas_nav: "92.41", cas_nav_date: "2026-10-05", our_nav: "92.41", status: "match", diff_units: "0.000" },
    { folio_id: "f2", household_member_id: "m1", household_member_name: "Vikram", scheme_name: "Nippon Small Cap", folio_number: "4400918/3",
      plan_type: "regular", cas_close_units: "289301.004", cas_statement_to: "2026-10-05", fresh_units: "299034.210", cached_units: null,
      cas_nav: "168.92", cas_nav_date: "2026-10-05", our_nav: "168.92", status: "units_differ", diff_units: "9733.206" },
  ],
  history: [], warnings: ["Balance mismatch for folio 4400918/3"], last_import_at: "2026-10-06T06:12:00Z",
};

it("shows tiles, rows and warnings", async () => {
  vi.spyOn(api, "fetchImportHealth").mockResolvedValue(body);
  render(<ImportHealth onBack={() => {}} />);
  expect(await screen.findByText("1")).toBeInTheDocument();
  expect(screen.getByText(/folios match the CAS/)).toBeInTheDocument();
  expect(screen.getByText("✗ +9,733.206 units")).toBeInTheDocument();
  expect(screen.getByText(/Balance mismatch for folio 4400918\/3/)).toBeInTheDocument();
});

it("filters to problems only", async () => {
  vi.spyOn(api, "fetchImportHealth").mockResolvedValue(body);
  render(<ImportHealth onBack={() => {}} />);
  fireEvent.click(await screen.findByText(/Problems only/));
  expect(screen.queryByText("PPFAS Flexi Cap")).not.toBeInTheDocument();
  expect(screen.getByText("Nippon Small Cap")).toBeInTheDocument();
});
```

And a hook test: `useDevToolsEnabled` returns false when `fetchDevStatus` rejects with a 404 `ApiError`, true when it resolves.

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/features/dev`
- [ ] **Step 3: Implement.** `features/dev/api.ts` uses the same `authFetch` idiom as `features/dashboard/api.ts` (copy the 15-line helper; don't import a private function across features). `fetchDevStatus()` → `GET /dev/status`; `fetchImportHealth(memberId?)` → `GET /dev/import-health[?household_member_id=]`, typed with an `ImportHealthResponse` interface mirroring Task 3's model. Bypass `cachedFetch` caching for both (pass `{ cache: "no-store" }` or call `fetch` directly) — the page must always show live numbers. Format numbers with the existing Indian-format helper used by `HoldingsTable` (`formatIndianNumber` / `formatIndianCurrency` in `lib/`), 3 dp for units.

In `ProfileView.tsx`, under the existing sections, render when `useDevToolsEnabled()` is true:

```tsx
<button type="button" className="..." onClick={onOpenImportHealth}>Import health <span className="...">STAGING</span></button>
```

with a new optional prop `onOpenImportHealth?: () => void`. In `MainDashboardFlow.tsx`, hold `const [devPage, setDevPage] = useState(false)`; when true render `<ImportHealth memberId={viewMode === "member" ? selectedMemberId : undefined} onBack={() => setDevPage(false)} />` in place of the tab content, and pass `onOpenImportHealth={() => setDevPage(true)}` to `ProfileView`.

- [ ] **Step 4: Run, expect PASS**, then `npx vitest run src/features/dev src/features/profile/ProfileView.test.tsx` and `npx tsc -b`.

---

### Task 7: Frontend — plan badge (#13), gain labels (#15)

**Files:**
- Create: `frontend/src/features/dashboard/PlanBadge.tsx`, `PlanBadge.test.tsx`
- Modify: `features/dashboard/types.ts:8`, `components/HoldingsTable.tsx:14,228-231`, `features/dashboard/FundDetailModal.tsx:25,34-36`, `mobile/features/dashboard/MobileHoldingCard.tsx:65-67`, `mobile/features/holdings/MobileHoldingCardSummary.tsx:65-66`, `mobile/features/holdings/MobileFundDetailView.tsx:249-251,475`, `mobile/features/holdings/MobileFundDetailSheet.tsx:96-98`
- Test: the existing tests of each modified file (grep `plan_type` under `frontend/src/**/*.test.tsx`).

**Interfaces:**
- Produces: `type PlanType = "direct" | "regular" | "unclassified"` exported from `features/dashboard/types.ts`; `HoldingRow.plan_type: PlanType`; `HoldingRow.plan_verified?: boolean` (optional now; phase 5 starts sending it); `<PlanBadge planType={PlanType} verified?: boolean />`.
- Badge: Direct → `positive` "Direct"; Regular → `neutral` "Regular"; Unclassified → `warning` "Unclassified"; `verified === false` on Regular → `warning` "Regular · unverified".

- [ ] **Step 1: Write the failing test** (`PlanBadge.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import { PlanBadge } from "./PlanBadge";

it.each([
  ["direct", undefined, "Direct"],
  ["regular", undefined, "Regular"],
  ["unclassified", undefined, "Unclassified"],
  ["regular", false, "Regular · unverified"],
] as const)("%s %s → %s", (planType, verified, label) => {
  render(<PlanBadge planType={planType} verified={verified} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});

it("direct is green", () => {
  render(<PlanBadge planType="direct" />);
  expect(screen.getByText("Direct").className).toMatch(/color-positive/);
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `PlanBadge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import type { PlanType } from "./types";

export function PlanBadge({ planType, verified }: { planType: PlanType; verified?: boolean }) {
  if (planType === "direct") return <Badge variant="positive">Direct</Badge>;
  if (planType === "unclassified") return <Badge variant="warning">Unclassified</Badge>;
  if (verified === false) return <Badge variant="warning">Regular · unverified</Badge>;
  return <Badge variant="neutral">Regular</Badge>;
}
```

Replace every `plan_type === "DIRECT"` badge listed in **Files** with `<PlanBadge planType={row.plan_type} verified={row.plan_verified} />` (variable names per file). Fix `HoldingsTable.tsx:14`'s local type to `plan_type: PlanType`. In `FundDetailModal.tsx`, show two labelled figures instead of one "Total Return": "Unrealised gain" (`unrealized_gain`) and "Total return incl. realised" (`current_profit_total`) (#15). Mobile detail views get the same two labels. Update test fixtures that use `"DIRECT"` to `"direct"`.

- [ ] **Step 4: Run, expect PASS** — `npx vitest run` on PlanBadge plus every test file found by `grep -rl "DIRECT\|plan_type" frontend/src --include=*.test.tsx`; `npx tsc -b`.

---

### Task 8: Frontend — hero totals (#14) and family view (#16)

**Files:**
- Modify: `features/dashboard/DashboardView.tsx:207-240,338,705-711`, `components/HoldingsTable.tsx:32,187`, `mobile/features/dashboard/MobileDashboardView.tsx:176-202,243-260,555`
- Test: `features/dashboard/DashboardView.test.tsx`, `mobile/features/dashboard/MobileDashboardView.test.tsx` (create if missing), `components/HoldingsTable.test.tsx`

**Interfaces:**
- `HoldingsTable` prop `onSelectScheme?: (schemeId: string) => void` becomes `onSelectHolding?: (row: HoldingRow) => void`. Grep for every `onSelectScheme` caller.

Rules:
- One population for Value, Invested and Gain: valued holdings (`!nav_unavailable`) **of the filtered list** (`displayedHoldings` on desktop, the member-filtered list on mobile, *before* the search filter). The excluded-funds note ("{n} funds without a price aren’t included") covers all three numbers. Desktop stops using `allocation.total_value` for the hero.
- Label "Total Gain"/"Total Loss" → "Unrealised gain"/"Unrealised loss" (desktop `:338`, mobile `:555`). Realised and today's gain are added in phase 6 (#9/#14).
- When the member filter is "all" in aggregate view, the hero caption reads "Family total"; otherwise "{member name}".
- Row click selects by the row object itself, so two members' identical funds can't be confused.

- [ ] **Step 1: Write the failing tests** (DashboardView):

```tsx
it("hero value, invested and gain use the same valued holdings", async () => {
  mockHoldings([
    holding({ scheme_id: "s1", current_value: "120", amount_invested: "100", unrealized_gain: "20" }),
    holding({ scheme_id: "s2", nav_unavailable: true, current_value: null, amount_invested: "50", unrealized_gain: null }),
  ]);
  renderDashboard();
  expect(await screen.findByText("₹120")).toBeInTheDocument();       // value
  expect(screen.getByText("₹100")).toBeInTheDocument();              // invested (valued only)
  expect(screen.getByText("Unrealised gain")).toBeInTheDocument();
});

it("opens the clicked member's fund when two members hold the same scheme", async () => {
  mockHoldings([
    holding({ scheme_id: "s1", household_member_id: "neha", household_member_name: "Neha", units_held: "5" }),
    holding({ scheme_id: "s1", household_member_id: "vikram", household_member_name: "Vikram", units_held: "9" }),
  ]);
  renderDashboard({ viewMode: "aggregate" });
  fireEvent.click((await screen.findAllByText(/PPFAS/))[0].closest("tr")!);
  expect(screen.getByRole("dialog")).toHaveTextContent("5");
});

it("member filter changes the hero, not just the list", async () => {
  mockHoldings([
    holding({ household_member_id: "neha", current_value: "100", amount_invested: "90", unrealized_gain: "10" }),
    holding({ household_member_id: "vikram", current_value: "300", amount_invested: "200", unrealized_gain: "100" }),
  ]);
  renderDashboard({ viewMode: "aggregate" });
  selectMemberFilter("Neha");
  expect(await screen.findByText("₹100")).toBeInTheDocument();
});
```

(`mockHoldings`, `holding`, `renderDashboard`, `selectMemberFilter`: use the helpers `DashboardView.test.tsx` already has; add thin ones beside them if missing — `holding()` returns a full `HoldingRow` with defaults overridden by the argument.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** In `DashboardView.tsx` replace the `totals` memo with one computed from `displayedHoldings`:

```tsx
const totals = useMemo(() => {
  const valued = displayedHoldings.filter((h) => !h.nav_unavailable);
  const currentVal = parseFloat(sumDecimalStrings(valued.map((h) => h.current_value || "0")));
  const investedVal = parseFloat(sumDecimalStrings(valued.map((h) => h.amount_invested)));
  const profitVal = parseFloat(sumDecimalStrings(valued.map((h) => h.unrealized_gain || "0")));
  const gainPercentage = investedVal > 0 ? (profitVal / investedVal) * 100 : 0;
  return { currentVal, investedVal, profitVal, gainPercentage, excludedCount: displayedHoldings.length - valued.length };
}, [displayedHoldings]);
```

Render `excludedCount > 0` as the note under the hero. Pass `onSelectHolding={(row) => setSelectedHolding(row)}` to `HoldingsTable`; in `HoldingsTable` call `onSelectHolding?.(row)`. Mobile: same memo over the member-filtered list (split `filteredHoldings` into `memberHoldings` and the search-filtered list), same label, and `handleSelectHolding(item)` already receives the row — keep it.

- [ ] **Step 4: Run, expect PASS**; `npx tsc -b`.

---

### Task 9: Frontend — error placement by code (#22)

**Files:**
- Modify: `features/import/useImportFlow.ts:43-50,95-106`, `features/import/UploadForm.tsx`, `features/import/ImportError.tsx`, `features/import/ImportFlow.tsx:117-131`
- Modify: `mobile/features/import/MobileImportView.tsx:244-260`, `mobile/features/import/MobileUploadForm.tsx`
- Test: `features/import/useImportFlow.test.ts` (or the existing ImportFlow test), `features/import/UploadForm.test.tsx`, `features/import/ImportError.test.tsx`, `mobile/features/import/MobileImportView.test.tsx`

**Interfaces:**
- `useImportFlow` exposes `errorCode: string | null` alongside `error`.
- `UploadForm` gains `passwordError?: string` and keeps its selected `File` across a failed attempt (the parent no longer remounts it).
- `ImportError` props become `{ code: string; message: string; onUploadAnother: () => void; onRequestCas?: () => void }`.

Placement (artifact #22 table):
- `wrong_password` → stage returns to `upload` with `passwordError = message`; file kept.
- `file_too_large`, `unsupported_file`/not-PDF → inline under the file box (they're checked before sending today; just route the server's 413/400 the same way).
- `scanned_pdf`, `damaged_pdf`, `unknown_issuer`, `summary_cas`, `demat_cas`, `parse_failed` → error card. Title per code: "We can’t read this PDF" (scanned), "This file looks incomplete" (damaged), "This isn’t a CAMS or KFintech statement" (unknown_issuer), "This is a summary statement" (summary), "Demat statements aren’t supported yet" (demat), "Import failed" (parse_failed). Body = server message. Buttons: "Upload a different file" always; "Request CAS from CAMS" for scanned/unknown_issuer/summary/demat (opens the existing `RequestCamsPath` flow via the existing tab switch in `TwoPathImportContainer`).
- `already_imported` (409 on confirm) → leave the flow and show a toast on the dashboard: "This statement was already imported". Use the app's existing toast/notice mechanism (grep `toast` in `frontend/src`; if none exists, reuse `ImportConfirmed`'s success-banner pattern with this text).
- Session expired (410) → upload screen with banner "Your upload timed out. Please upload again." (replaces today's error stage for that code).

- [ ] **Step 1: Write the failing tests:**

```tsx
// UploadForm.test.tsx
it("keeps the file after wrong_password", async () => {
  const onSubmit = vi.fn();
  const { rerender } = render(<UploadForm onSubmit={onSubmit} />);
  const file = new File(["%PDF"], "cas.pdf", { type: "application/pdf" });
  // @testing-library/user-event is not installed: use fireEvent like the existing tests.
  fireEvent.change(screen.getByLabelText(/choose file|upload/i), { target: { files: [file] } });
  rerender(<UploadForm onSubmit={onSubmit} passwordError="That password didn’t open the file." />);
  expect(screen.getByText("cas.pdf")).toBeInTheDocument();
  expect(screen.getByText(/didn’t open the file/)).toBeInTheDocument();
});

// ImportError.test.tsx
it("scanned PDF offers both actions", () => {
  render(<ImportError code="scanned_pdf" message="It looks like a scan" onUploadAnother={() => {}} onRequestCas={() => {}} />);
  expect(screen.getByText("We can’t read this PDF")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Upload a different file" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Request CAS from CAMS" })).toBeInTheDocument();
});

it("damaged PDF offers only upload", () => {
  render(<ImportError code="damaged_pdf" message="x" onUploadAnother={() => {}} onRequestCas={() => {}} />);
  expect(screen.queryByRole("button", { name: "Request CAS from CAMS" })).not.toBeInTheDocument();
});
```

Plus a `useImportFlow` test: an `ApiError(422, {code: "wrong_password", message: "m"})` from `parseImport` leaves `stage === "upload"`, `errorCode === "wrong_password"`.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** In `useImportFlow.ts`:

```ts
const INLINE_CODES = new Set(["wrong_password", "file_too_large", "unsupported_file"]);

function errorCodeOf(err: unknown): string | null {
  if (err instanceof ApiError && err.payload && typeof err.payload === "object" && "code" in err.payload) {
    return String((err.payload as { code: unknown }).code);
  }
  return null;
}
```

In `handleFailure`: set `errorCode`; if the code is in `INLINE_CODES` set `stage` to `"upload"` (not `"error"`). `ImportFlow.tsx` passes `passwordError={errorCode === "wrong_password" ? error : undefined}` to `UploadForm` and renders `<ImportError code={errorCode ?? "parse_failed"} message={error ?? ""} .../>` in the error stage. Mirror both in `MobileImportView.tsx` / `MobileUploadForm.tsx`.

- [ ] **Step 4: Run, expect PASS**; `npx tsc -b`.

---

### Task 10: Checkpoint — synthetic baseline

**Files:**
- Create: `Docs/orchestration/2026-10-06-cas-import-baseline.md` (the record later phases compare against)

- [ ] **Step 1: Run every synthetic scenario through the harness** with the reconciliation added to its output. Add to `harness/test_deep.py`, after the confirms, one block that calls `reconcile_members(db, [member_id])` and writes `{"reconcile": [{folio, scheme, status, diff_units}]}` into the OUT JSON.

```bash
cd backend
for SEQ in p20_20yr.pdf p20_10yr.pdf p20_7yr.pdf p20_3yr.pdf p20_1yr.pdf p20_FY.pdf \
           p10_10yr.pdf p10_FY.pdf p7_7yr.pdf p3_FY.pdf kfin_pk_10yr.pdf kfin_p7_7yr.pdf \
           oldcams_p20_20yr.pdf fam_10yr.pdf px_14yr.pdf p20_FY.pdf,p20_20yr.pdf p20_FY.pdf,p20_FY_altfolio.pdf; do
  OUT="/tmp/base_${SEQ//[,.]/_}.json" SEQ=$SEQ python3 -m pytest "../Docs/CAS Files/synthetic/harness/test_deep.py" -q --rootdir "../Docs/CAS Files/synthetic/harness" || true
done
```

- [ ] **Step 2: Write the baseline doc**: a table of scenario → dashboard value vs CAS value, count of `match` / `units_differ` / `no_cas_data` folios, and the five worst `diff_units`. This is "today's damage" — the numbers from the artifact (e.g. p20_FY ₹0.11 Cr vs ₹20.00 Cr) should reappear. If they don't, stop and investigate before phase 2: the yardstick itself is wrong.
- [ ] **Step 3: Staging check.** After deploying phase 1 to staging, open Profile → Import health with one uploaded synthetic file and confirm the page shows the same statuses as the harness for that file. Report the result in the baseline doc.
