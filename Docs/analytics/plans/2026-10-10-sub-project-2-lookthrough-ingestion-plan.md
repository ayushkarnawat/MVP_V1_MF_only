# Look-Through Engine Ingestion (Sub-Project 2, Section 00) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the look-through engine's ingestion layer end to end — the two-table data
model, the generic five-stage pipeline (Locate/Fetch/Parse/Normalize/Write), a Locate
layer that handles every distinct Locate/Fetch shape found in the spike (one workbook
with one sheet per scheme; a landing page listing many separate single-scheme files; a
calendar-deterministic URL needing no scrape at all; a bot-blocked AMC whose file is
discoverable only via the Wayback Machine's CDX index), the per-AMC adapter registry, and
the scheduled job — proven against every AMC whose live source this session
independently re-verified today (not merely recorded in an older research doc), so every
still-later AMC adapter is a declarative registry entry, not new pipeline code.

**Architecture:** Mirrors `amfi_ter_client.py`/`amfi_factsheet_client.py`'s established
shape: a frozen `*RefreshResult` dataclass, a top-level `async def refresh_X(db) ->
XRefreshResult` that degrades gracefully, a per-AMC resolver registry
(`AMC_DISCLOSURE_RESOLVERS`), and a per-AMC try/except-isolated orchestration loop with
structured single-line alerting feeding the existing SNS ops-alerts topic. The five
pipeline stages are split into their own modules (Parse, Normalize, Write) so each is
independently unit-testable without a network call, with the orchestrator
(`portfolio_disclosure_client.py`) composing them.

**Tech Stack:** Python/FastAPI/SQLAlchemy/Alembic (existing backend stack), `httpx` for
fetching, `openpyxl` for OOXML `.xlsx` and `xlrd` for legacy BIFF `.xls` (both already
transitively installed via `casparser`, newly pinned directly in `requirements.txt`
since this is now a direct dependency), `xlwt` added to `requirements-dev.txt` for
constructing legacy-`.xls` test fixtures. Reuses `difflib.SequenceMatcher` for fuzzy
matching, matching the exact algorithm already established in `amfi_factsheet_client.py`
rather than introducing a different fuzzy-matching library (`RapidFuzz` is pinned in
`requirements.txt` but unused by that precedent, so this plan doesn't switch to it
either — consistency with the established pattern over a marginal library difference).

**Spec:** `Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md`
(two-table data model, five-stage pipeline, full 57-AMC adapter classification) and its
feasibility source, `Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`.

## Scope note (writing-plans' Scope Check)

An earlier draft of this plan scoped down to one adapter (Nippon India) and deferred the
other 46 fetchable AMCs wholesale as "incremental follow-on," reasoning that only Nippon's
URL was pinned down to an exact literal string. That reasoning under-used real research
that already existed on disk — re-reading the spec and all four spike batch docs in full
(not just their structured tables) found many more AMCs with a literal, re-verifiable
source. It also missed a real architecture gap: the spec's single `STATIC_REGEX` tier
conflates at least four distinct Locate/Fetch shapes, not one. Per instruction, this plan
now builds the **complete shape framework** plus **every adapter this session could
independently re-verify live today** — not a one-adapter proof of concept, and not
deferred for token-conservation reasons. What's still excluded below is excluded because
today's live re-check found a concrete, specific technical blocker, not because building
it would cost more.

**Four Locate/Fetch shapes, all built generically in this plan** (`DisclosureFileShape`,
Task 5):

1. **`SINGLE_WORKBOOK_MULTI_SHEET`** — one URL, one workbook, one sheet per scheme. Already
   the shape Task 2/6 were written against.
2. **`MULTI_FILE_SINGLE_SCHEME`** — one landing page links many separate single-scheme
   files; the scheme identity comes from the link's visible text/filename, not from an
   internal worksheet name. `_locate_and_fetch` must return every current-dated file, not
   just one (the earlier draft's design bug) — fixed in Task 6.
3. **`DETERMINISTIC_TEMPLATE`** — no landing page at all; the URL is built directly from a
   scheme's own name plus the as-of date. Fetch still runs per scheme, but Locate is pure
   string substitution, not a scrape.
4. **`WAYBACK_LOCATE`** — the AMC's own domain is bot-blocked or has no live listing page,
   but the file is discoverable via the Internet Archive's CDX index and then downloads
   live from a separate, unprotected static-asset domain. This is genuinely custom code
   (an `httpx` call to `web.archive.org`'s CDX API), not a config-only registry row — built
   as its own task (Task 7), not crammed into the declarative registry shape.

**Adapters onboarded in this plan, each independently re-verified live today (2026-10-10),
not copied from a research doc without re-checking:**

| AMC | Shape | Confirmed |
|---|---|---|
| Nippon India Mutual Fund | `SINGLE_WORKBOOK_MULTI_SHEET` | Pre-existing, reaffirmed |
| Shriram Mutual Fund | `SINGLE_WORKBOOK_MULTI_SHEET` | Live Sept 2026 file found |
| PPFAS Mutual Fund | `SINGLE_WORKBOOK_MULTI_SHEET` | Live Sept 2026 file found |
| Groww Mutual Fund | `SINGLE_WORKBOOK_MULTI_SHEET` | Live Sept 2026 file found |
| Helios Mutual Fund | `MULTI_FILE_SINGLE_SCHEME` | Live Sept 2026 files found (5 schemes) |
| Capitalmind Mutual Fund | `MULTI_FILE_SINGLE_SCHEME` | Live Sept 2026 file found |
| Angel One Mutual Fund | `MULTI_FILE_SINGLE_SCHEME` | Live Sept 2026 files found |
| Union Mutual Fund | `DETERMINISTIC_TEMPLATE` | Live Sept 2026 file downloaded and verified (real `.xlsx`, correct content-type, a deliberately wrong scheme-slug correctly 500s — this is a real per-scheme existence check server-side, not a soft-404 shell) |
| HDFC Mutual Fund | `WAYBACK_LOCATE` | Built per the spike's confirmed mechanism (Task 7) |
| Canara Robeco Mutual Fund | `WAYBACK_LOCATE` | Built per the spike's confirmed mechanism (Task 7) |

**Explicitly deferred, each for a specific technical reason found by live re-checking
today, not for token-conservation:**

- **AlphaGrep Mutual Fund** — the spike's recorded calendar-deterministic template
  (`alphagrepmf.ai/assets/documents/{Scheme_Name}/monthly/...`) was re-tried today against
  four plausible slug transformations of its real scheme names. Every single one — including
  a deliberately nonsense slug — returned `HTTP 200` with identical `Content-Type: text/html`
  and identical `Content-Length: 59089` bytes: the site serves a soft-404 SPA shell with a
  200 status for any path, so a 200 response here proves nothing. No literal working URL
  survives re-verification today, even though the spike's narrative claimed one did.
  Parse's `sniff_workbook_format()` (Task 2) would safely reject this shell as a parse
  error rather than corrupt data if onboarded anyway, but there's no confirmed real URL to
  onboard. Needs fresh research, not a registry entry.
- **DSP Mutual Fund, NJ Mutual Fund** — both AMCs' disclosure pages returned a bare
  JS-shell body to a plain `httpx` GET today (114 and 1,253 bytes respectively — no
  server-rendered content at all), despite the spike recording them as `STATIC_REGEX`
  (meaning "no interactive select needed," not "a plain HTTP GET returns the content").
  Fetchable only with a real browser render step.
- **SBI, Mirae Asset, Invesco, Axis, ITI, Trust Mutual Fund, Taurus, Wealth Company,
  Aditya Birla Sun Life, JM Financial, Bank of India, Baroda BNP Paribas, 360 ONE, HSBC,
  LIC** — same JS-shell-vs-plain-HTTP finding (confirmed individually today, not assumed):
  either an empty/near-empty body, or a page whose static HTML mixes several SEBI
  disclosure types (AUM, portfolio concentration, overlap) without exposing the specific
  current-month holdings file via a plain quoted URL. This whole group needs either a
  headless-browser fetch step (a new production dependency — more Fargate CPU/memory, a
  slower job, `playwright`'s browser binaries — a real infra-cost decision this plan
  doesn't make unilaterally) or further manual per-AMC research. Not onboarded.
- **Old Bridge Mutual Fund** — the spike's recorded filename pattern
  (`Monthly_Portfolio_<Month>_<Year>.xlsx`) has visibly changed since the spike to a
  different, less obviously holdings-specific naming convention
  (`IR_Old_Bridge_Mutual_Fund_<DDMMYYYY>_<hash>.xlsx` mixed with per-scheme
  `Old_Bridge_<Scheme>_<Month>_<Year>_<hash>.xlsx` files, inconsistent across months) —
  genuinely ambiguous which file is the holdings disclosure today, not a copy-paste from
  old research.
- **`JSON_API` tier (14 AMCs: PGIM India, Navi, Jio BlackRock, Bandhan, ICICI Prudential,
  Bajaj Finserv, Unifi, Zerodha, Abakkus, quant Money Managers, Sundaram, Choice, UTI,
  Tata)** — re-reading every investigation doc in full (not just structured tables) found
  that not one of these 14 has a literal, reusable, non-expiring endpoint recorded
  anywhere — only qualitative mechanism descriptions survive (a WordPress REST path with
  no query string; a signed/expiring GCS URL that can't be hardcoded; a button-triggered
  ZIP download, not a static link). This is a hard research gap, not a scope choice: the
  registry's `JSON_API` kind still exists (unused this round) so these are a drop-in
  follow-on once that research is done, same precedent as
  `amfi_factsheet_client._json_api_candidates`.
- **Edelweiss, Mahindra Manulife** — standing manual-fetch per the spec (Akamai WAF;
  genuinely encrypted request/response API — see the project's constraint against
  attempting to crack it). **Kotak Mahindra** — pending its ~2026-10-12 CDN re-check, per
  the spec. None of these three are a new decision this plan is making.

## Global Constraints

- `disclosure_batch`'s grain is `(scheme_id, as_of_date)`, never `(amc, month)` — Canara
  Robeco's mixed monthly/fortnightly per-scheme cadence proved the latter collides.
- Write is always delete-all-`scheme_holding`-rows-for-`batch_id`-then-reinsert, never a
  partial upsert — re-running Write for the same batch must always be safe.
- Parse always reprocesses a full multi-sheet/multi-file bundle from scratch on retry,
  never resumes partial per-sheet state.
- `sector_raw` is stored verbatim from the source, never normalized against a sector
  taxonomy at write time (that's attribute 06's concern, not ingestion's).
- `market_value` is always normalized to bare ₹ at write time — a column stated in
  Lakhs/Crores must be multiplied up, never left in its source unit.
- Config-driven adapters by default (a landing URL + link-pattern regex); custom Python
  is reserved for genuinely non-formulaic Locate/Parse behavior (out of this plan's
  scope — see Scope note).
- Scheme-name matching reuses the hybrid layered pattern already established in
  `amfi_factsheet_client.py` (exact-first, scoped fuzzy fallback, ambiguity guard,
  persisted confidence) — not a new one-off matcher.
- Scheduling is retry-until-found (skip an AMC already `WRITTEN` this month, otherwise
  retry), not a per-AMC publishing-lag config.

## Review Focus

- A Locate regex matching more than one dated link on a landing page (an old month's file
  still linked alongside the new one) must pick the correctly-dated one, not whichever
  appears first in the HTML — Task 6's `_locate_and_fetch` test.
- A disclosure sheet name that's ambiguously close to two schemes in the same AMC (e.g.
  a fund and its near-identical segregated portfolio) must resolve to no match, not an
  arbitrary pick — Task 3's ambiguity-guard test.
- A market-value column stated in Crores (not just the more common Lakhs, or bare ₹) must
  be multiplied correctly, not silently treated as already-₹ — Task 2's unit test.
- A non-holdings sheet (an Index/summary/notes sheet with no SEBI header row) must be
  silently skipped, not crash the whole workbook's parse or show up as a false
  `parse_errors` entry — Task 2's header-not-found test.
- Re-running the daily job after an AMC is already `WRITTEN` for the current month must
  not re-fetch, re-parse, or duplicate `scheme_holding` rows — Task 6's idempotent-rerun
  test.

---

### Task 1: DB schema — `disclosure_batches` + `scheme_holdings`

**Files:**
- Modify: `backend/app/models/enums.py` (add `DisclosureBatchStatus`)
- Modify: `backend/app/models/reference.py` (add `DisclosureBatch`, `SchemeHolding`)
- Create: `backend/alembic/versions/0036_disclosure_batches_and_scheme_holdings.py`
- Test: `backend/tests/services/analytics/test_portfolio_disclosure_models.py`

**Interfaces:**
- Consumes: `app.db.base.Base`, `app.models.enums.enum_column`, `app.models.reference.Scheme`.
- Produces: `DisclosureBatchStatus` (enum: `PENDING`, `FETCHED`, `PARSED`, `WRITTEN`,
  `FAILED`, `AWAITING_MANUAL_UPLOAD`); `DisclosureBatch` (`id`, `scheme_id`, `as_of_date`,
  `amc_name`, `status`, `source_url`, `raw_file_reference`, `match_method`,
  `match_confidence`, `parse_errors`, `fetched_at`, `written_at`); `SchemeHolding` (`id`,
  `batch_id`, `instrument_name`, `isin`, `sector_raw`, `quantity`, `market_value`,
  `pct_to_nav`) — every later task imports these two classes from `app.models.reference`.

- [ ] **Step 1: Write the failing model test**

```python
# backend/tests/services/analytics/test_portfolio_disclosure_models.py
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.enums import DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding


def _scheme(db):
    scheme = Scheme(
        id=uuid.uuid4(), isin="INF123", name="Test Fund", amc_name="Test AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()
    return scheme


def test_round_trip_batch_and_holding(db_session):
    scheme = _scheme(db_session)
    batch = DisclosureBatch(
        id=uuid.uuid4(), scheme_id=scheme.id, as_of_date=date(2026, 8, 31), amc_name="Test AMC",
        status=DisclosureBatchStatus.WRITTEN, source_url="https://example.test/file.xls",
        match_method="EXACT", match_confidence=Decimal("1.0"), written_at=datetime.now(timezone.utc),
    )
    db_session.add(batch)
    db_session.commit()
    holding = SchemeHolding(
        id=uuid.uuid4(), batch_id=batch.id, instrument_name="HDFC Bank Ltd", isin="INE040A01034",
        sector_raw="Banks", quantity=Decimal("1000.0000"), market_value=Decimal("1500000.00"),
        pct_to_nav=Decimal("2.500"),
    )
    db_session.add(holding)
    db_session.commit()

    fetched = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).one()
    assert fetched.instrument_name == "HDFC Bank Ltd"
    assert fetched.isin == "INE040A01034"
    assert fetched.market_value == Decimal("1500000.00")


def test_unique_constraint_rejects_duplicate_scheme_and_date(db_session):
    scheme = _scheme(db_session)
    db_session.add(DisclosureBatch(
        id=uuid.uuid4(), scheme_id=scheme.id, as_of_date=date(2026, 8, 31), amc_name="Test AMC",
        status=DisclosureBatchStatus.WRITTEN,
    ))
    db_session.commit()
    db_session.add(DisclosureBatch(
        id=uuid.uuid4(), scheme_id=scheme.id, as_of_date=date(2026, 8, 31), amc_name="Test AMC",
        status=DisclosureBatchStatus.PENDING,
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'DisclosureBatchStatus'` (or
`DisclosureBatch`/`SchemeHolding` not found).

- [ ] **Step 3: Add the enum**

In `backend/app/models/enums.py`, immediately after `class SchemePlanType`:

```python
class DisclosureBatchStatus(str, enum.Enum):
    PENDING = "pending"
    FETCHED = "fetched"
    PARSED = "parsed"
    WRITTEN = "written"
    FAILED = "failed"
    AWAITING_MANUAL_UPLOAD = "awaiting_manual_upload"
```

- [ ] **Step 4: Add the models**

In `backend/app/models/reference.py`, add to the top-of-file imports:

```python
from sqlalchemy import JSON
from sqlalchemy.dialects import postgresql
```

and change the `enums` import line to include the new enum:

```python
from app.models.enums import (
    ArnStatus, BenchmarkIndex, BenchmarkReturnType, DisclosureBatchStatus,
    PlanNameVariant, SchemeSource, SchemePlanType, enum_column,
)
```

Then append, after `class SchemeFundManager`'s last line:

```python
class DisclosureBatch(Base):
    __tablename__ = "disclosure_batches"
    __table_args__ = (
        UniqueConstraint("scheme_id", "as_of_date", name="uq_disclosure_batches_scheme_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), nullable=False, index=True)
    as_of_date: Mapped[date_] = mapped_column(Date, nullable=False)
    amc_name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[DisclosureBatchStatus] = mapped_column(
        enum_column(DisclosureBatchStatus), nullable=False, default=DisclosureBatchStatus.PENDING,
    )
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_file_reference: Mapped[str | None] = mapped_column(String, nullable=True)
    # "EXACT" | "FUZZY" -- same convention as SchemeFundManager.match_method (plain
    # String + module constants in portfolio_disclosure_matching.py, not a DB enum).
    match_method: Mapped[str | None] = mapped_column(String, nullable=True)
    match_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    parse_errors: Mapped[list[dict] | None] = mapped_column(
        JSON().with_variant(postgresql.JSONB(astext_type=String()), "postgresql"), nullable=True,
    )
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    written_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SchemeHolding(Base):
    __tablename__ = "scheme_holdings"
    __table_args__ = (
        Index("ix_scheme_holdings_batch", "batch_id"),
        Index("ix_scheme_holdings_isin", "isin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("disclosure_batches.id"), nullable=False)
    instrument_name: Mapped[str] = mapped_column(String, nullable=False)
    isin: Mapped[str | None] = mapped_column(String, nullable=True)
    sector_raw: Mapped[str | None] = mapped_column(String, nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    market_value: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
    pct_to_nav: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_models.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the Alembic migration**

```python
# backend/alembic/versions/0036_disclosure_batches_and_scheme_holdings.py
"""disclosure_batches, scheme_holdings: look-through engine ingestion (sub-project 2, section 00)

Revision ID: 0036
Revises: 0035

One row per (scheme, as_of_date) disclosure event; one scheme_holding row per held
security within that batch, written by delete-all-then-reinsert on every (re)parse --
never a partial upsert. See
Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None

_STATUS_VALUES = ("pending", "fetched", "parsed", "written", "failed", "awaiting_manual_upload")


def upgrade() -> None:
    op.create_table(
        "disclosure_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("amc_name", sa.String(), nullable=False),
        sa.Column("status", sa.Enum(*_STATUS_VALUES, name="disclosurebatchstatus"), nullable=False),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.Column("raw_file_reference", sa.String(), nullable=True),
        sa.Column("match_method", sa.String(), nullable=True),
        sa.Column("match_confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("parse_errors", sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("written_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
        sa.UniqueConstraint("scheme_id", "as_of_date", name="uq_disclosure_batches_scheme_date"),
    )
    op.create_index("ix_disclosure_batches_scheme_id", "disclosure_batches", ["scheme_id"])

    op.create_table(
        "scheme_holdings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("instrument_name", sa.String(), nullable=False),
        sa.Column("isin", sa.String(), nullable=True),
        sa.Column("sector_raw", sa.String(), nullable=True),
        sa.Column("quantity", sa.Numeric(20, 4), nullable=True),
        sa.Column("market_value", sa.Numeric(20, 2), nullable=False),
        sa.Column("pct_to_nav", sa.Numeric(6, 3), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["batch_id"], ["disclosure_batches.id"]),
    )
    op.create_index("ix_scheme_holdings_batch", "scheme_holdings", ["batch_id"])
    op.create_index("ix_scheme_holdings_isin", "scheme_holdings", ["isin"])


def downgrade() -> None:
    op.drop_index("ix_scheme_holdings_isin", table_name="scheme_holdings")
    op.drop_index("ix_scheme_holdings_batch", table_name="scheme_holdings")
    op.drop_table("scheme_holdings")
    op.drop_index("ix_disclosure_batches_scheme_id", table_name="disclosure_batches")
    op.drop_table("disclosure_batches")
    sa.Enum(*_STATUS_VALUES, name="disclosurebatchstatus").drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 7: Verify the migration applies cleanly against a scratch DB**

Run: `cd backend && alembic upgrade head && alembic downgrade -1 && alembic upgrade head`
Expected: all three commands exit 0, no error.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/enums.py backend/app/models/reference.py \
  backend/alembic/versions/0036_disclosure_batches_and_scheme_holdings.py \
  backend/tests/services/analytics/test_portfolio_disclosure_models.py
git commit -m "feat: add disclosure_batches/scheme_holdings schema (sub-project 2 ingestion)"
```

---

### Task 2: Parse stage — format sniffing, unit normalization, generic SEBI-header extraction

**Files:**
- Create: `backend/app/services/analytics/portfolio_disclosure_parsing.py`
- Test: `backend/tests/services/analytics/test_portfolio_disclosure_parsing.py`
- Modify: `backend/requirements.txt` (pin `openpyxl==3.1.5`, `xlrd==2.0.2` — both are
  already present transitively via `casparser`, now pinned directly since this module
  imports them)
- Modify: `backend/requirements-dev.txt` (add `xlwt>=1.3.0`, used only by this task's
  test to construct a legacy-`.xls` fixture; `xlrd` can only read, never write, `.xls`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ParsedHolding` (frozen dataclass: `instrument_name: str`, `isin: str | None`,
  `sector_raw: str | None`, `quantity: Decimal | None`, `market_value: Decimal`,
  `pct_to_nav: Decimal`); `ParsedSheet` (frozen dataclass: `sheet_name: str`,
  `holdings: list[ParsedHolding]`, `error: str | None`); `def
  parse_workbook(data: bytes) -> list[ParsedSheet]` — Task 6's orchestrator calls this
  directly.

- [ ] **Step 1: Pin the Excel libraries**

In `backend/requirements.txt`, insert alphabetically:

```
openpyxl==3.1.5
```

right before the `packaging==26.3` line, and:

```
xlrd==2.0.2
```

right before the `xlwt` line you're about to add in the next file (i.e. after
`websockets==17.0.1`, the current last line). In `backend/requirements-dev.txt`, add a
new line:

```
xlwt>=1.3.0
```

Run: `cd backend && pip install -r requirements.txt -r requirements-dev.txt`
Expected: exits 0 (`openpyxl`/`xlrd` are already installed transitively, satisfied
instantly; `xlwt` installs fresh).

- [ ] **Step 2: Write the failing test for format sniffing and unit detection**

```python
# backend/tests/services/analytics/test_portfolio_disclosure_parsing.py
import io
from decimal import Decimal

import openpyxl
import pytest
import xlwt

from app.services.analytics.portfolio_disclosure_parsing import (
    find_header_row, market_value_multiplier, parse_sheet_rows, parse_workbook,
    sniff_workbook_format,
)


def _xlsx_bytes(sheets: dict[str, list[list]]) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _xls_bytes(sheets: dict[str, list[list]]) -> bytes:
    wb = xlwt.Workbook()
    for name, rows in sheets.items():
        ws = wb.add_sheet(name)
        for r, row in enumerate(rows):
            for c, value in enumerate(row):
                ws.write(r, c, value)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_sniff_workbook_format_detects_both():
    assert sniff_workbook_format(_xlsx_bytes({"S1": [["a"]]})) == "xlsx"
    assert sniff_workbook_format(_xls_bytes({"S1": [["a"]]})) == "xls"


def test_sniff_workbook_format_rejects_unknown():
    with pytest.raises(ValueError):
        sniff_workbook_format(b"not a workbook")


def test_market_value_multiplier_recognizes_units():
    assert market_value_multiplier("Market Value") == Decimal("1")
    assert market_value_multiplier("Market Value (Rs. in Lakhs)") == Decimal("100000")
    assert market_value_multiplier("Market Value (Rs. in Crores)") == Decimal("10000000")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_parsing.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.analytics.portfolio_disclosure_parsing'`.

- [ ] **Step 4: Implement format sniffing and unit detection**

```python
# backend/app/services/analytics/portfolio_disclosure_parsing.py
"""Parse stage: AMC-agnostic extraction of holdings rows from a downloaded workbook.

Generic by design -- a URL template plus this module's universal SEBI-field-name
detection covers the 29-AMC `STATIC_REGEX` single-scheme tier and most of the 14-AMC
`JSON_API` tier without any per-AMC Python (spec's "adapter design" section). Custom
Parse code (an Index-sheet scheme-code lookup) is reserved for the 4-AMC multi-scheme-
bundle tier, out of this plan's scope -- see this plan's Scope note."""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

import openpyxl
import xlrd

_XLS_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_XLSX_MAGIC = b"PK\x03\x04"


def sniff_workbook_format(data: bytes) -> str:
    """Never trusts the source URL's extension alone (spec: "sniff the actual bytes") --
    returns "xls" (legacy BIFF) or "xlsx" (OOXML)."""
    if data.startswith(_XLS_MAGIC):
        return "xls"
    if data.startswith(_XLSX_MAGIC):
        return "xlsx"
    raise ValueError(f"not a recognized workbook: first bytes {data[:8]!r}")


_UNIT_MULTIPLIERS = {
    "crore": Decimal("10000000"),
    "crores": Decimal("10000000"),
    "lakh": Decimal("100000"),
    "lakhs": Decimal("100000"),
}


def market_value_multiplier(header_text: str) -> Decimal:
    """₹ multiplier implied by a market-value header's own unit text (e.g. "Market Value
    (Rs. in Lakhs)"). A header with no recognized unit word is assumed to already be in
    bare rupees -- the common case -- rather than guessed."""
    lowered = header_text.lower()
    for word, multiplier in _UNIT_MULTIPLIERS.items():
        if word in lowered:
            return multiplier
    return Decimal("1")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_parsing.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing test for header detection and row extraction**

```python
# append to backend/tests/services/analytics/test_portfolio_disclosure_parsing.py

_HOLDING_ROWS = [
    ["Name of the Instrument", "ISIN", "Industry", "Quantity", "Market Value (Rs. in Lakhs)", "% to NAV"],
    ["HDFC Bank Ltd", "INE040A01034", "Banks", 1000, 15.00, 2.5],
    ["Reliance Industries Ltd", "INE002A01018", "Petroleum Products", 500, 20.00, 3.3],
    ["Net Receivables/Payables", "", "", "", 1.00, 0.2],
    ["Total", "", "", "", 36.00, 6.0],
]


def test_find_header_row_locates_header_below_a_title_banner():
    rows = [["Nippon India Large Cap Fund - Portfolio as on 31-Aug-2026"], [], *_HOLDING_ROWS]
    result = find_header_row(rows)
    assert result is not None
    row_index, columns = result
    assert row_index == 2
    assert columns["instrument_name"] == 0
    assert columns["isin"] == 1
    assert columns["market_value"] == 4
    assert columns["pct_to_nav"] == 5


def test_find_header_row_returns_none_for_a_non_holdings_sheet():
    assert find_header_row([["Index"], ["Scheme Code", "Scheme Name"], ["YB01", "Scheme A"]]) is None


def test_parse_sheet_rows_stops_at_total_and_normalizes_lakhs():
    _, columns = find_header_row(_HOLDING_ROWS)
    holdings = parse_sheet_rows(_HOLDING_ROWS[1:], columns, Decimal("100000"))
    assert len(holdings) == 3  # 2 equities + the cash/receivables line, not the Total row
    assert holdings[0].instrument_name == "HDFC Bank Ltd"
    assert holdings[0].isin == "INE040A01034"
    assert holdings[0].market_value == Decimal("1500000.00")
    assert holdings[2].instrument_name == "Net Receivables/Payables"
    assert holdings[2].isin is None


def test_parse_workbook_skips_non_holdings_sheets_and_normalizes_crores():
    crore_rows = [
        ["Name of the Instrument", "ISIN", "Industry", "Quantity", "Market Value (Rs. in Crores)", "% to NAV"],
        ["Infosys Ltd", "INE009A01021", "IT - Software", 2000, 1.50, 4.0],
    ]
    data = _xlsx_bytes({"Index": [["Scheme Code", "Scheme Name"], ["YB01", "Fund A"]], "Fund A": crore_rows})
    sheets = parse_workbook(data)
    names = {s.sheet_name for s in sheets}
    assert names == {"Fund A"}  # "Index" has no SEBI header row -- silently skipped, not an error
    fund_a = next(s for s in sheets if s.sheet_name == "Fund A")
    assert fund_a.error is None
    assert fund_a.holdings[0].market_value == Decimal("15000000.00")
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_parsing.py -v`
Expected: FAIL with `ImportError: cannot import name 'find_header_row'`.

- [ ] **Step 8: Implement header detection, row extraction, and the workbook reader**

Append to `backend/app/services/analytics/portfolio_disclosure_parsing.py`:

```python
_HEADER_PATTERNS: dict[str, re.Pattern] = {
    "instrument_name": re.compile(r"name of (the )?instrument|instrument name", re.I),
    "isin": re.compile(r"\bisin\b", re.I),
    "sector_raw": re.compile(r"industry|sector|rating", re.I),
    "quantity": re.compile(r"\bquantity\b", re.I),
    "market_value": re.compile(r"market value", re.I),
    "pct_to_nav": re.compile(r"%\s*to\s*(net\s*)?(asset|nav)", re.I),
}
_REQUIRED_FIELDS = ("instrument_name", "market_value", "pct_to_nav")
_TERMINATOR_NAMES = ("total", "grand total", "net assets")


def find_header_row(rows: list[list], max_scan: int = 15) -> tuple[int, dict[str, int]] | None:
    """The header row within a sheet's first `max_scan` rows -- not always row 0, since
    many AMCs print a title/as-on-date banner above the table. Returns (row index,
    {field: column index}) for the first row covering every required field, or None when
    no such row exists (an Index/summary sheet, not a holdings sheet)."""
    for row_index, row in enumerate(rows[:max_scan]):
        found: dict[str, int] = {}
        for col_index, cell in enumerate(row):
            text = str(cell or "")
            for field, pattern in _HEADER_PATTERNS.items():
                if field not in found and pattern.search(text):
                    found[field] = col_index
        if all(field in found for field in _REQUIRED_FIELDS):
            return row_index, found
    return None


def _to_decimal(cell) -> Decimal | None:
    if cell is None or cell == "":
        return None
    try:
        return Decimal(str(cell).replace(",", "").strip())
    except InvalidOperation:
        return None


@dataclass(frozen=True)
class ParsedHolding:
    instrument_name: str
    isin: str | None
    sector_raw: str | None
    quantity: Decimal | None
    market_value: Decimal
    pct_to_nav: Decimal


def _cell(row: list, columns: dict[str, int], field: str) -> str | None:
    col = columns.get(field)
    if col is None or col >= len(row) or row[col] in (None, ""):
        return None
    return str(row[col]).strip()


def parse_sheet_rows(rows: list[list], columns: dict[str, int], value_multiplier: Decimal) -> list["ParsedHolding"]:
    """Rows after the header until the first row with no instrument name or a terminator
    label (the sheet's trailing "Total"/footnote rows) -- never guesses where data ends
    by a fixed row count."""
    name_col = columns["instrument_name"]
    holdings: list[ParsedHolding] = []
    for row in rows:
        name = _cell(row, columns, "instrument_name")
        if name is None:
            break
        if name.lower() in _TERMINATOR_NAMES:
            break
        market_value = _to_decimal(row[columns["market_value"]]) if columns["market_value"] < len(row) else None
        pct = _to_decimal(row[columns["pct_to_nav"]]) if columns["pct_to_nav"] < len(row) else None
        if market_value is None or pct is None:
            continue  # a subtotal/section-header row, not a real holding
        holdings.append(ParsedHolding(
            instrument_name=name,
            isin=_cell(row, columns, "isin"),
            sector_raw=_cell(row, columns, "sector_raw"),
            quantity=_to_decimal(row[columns["quantity"]]) if "quantity" in columns and columns["quantity"] < len(row) else None,
            market_value=market_value * value_multiplier,
            pct_to_nav=pct,
        ))
    return holdings


@dataclass(frozen=True)
class ParsedSheet:
    sheet_name: str
    holdings: list[ParsedHolding]
    error: str | None


def _read_xlsx_sheets(data: bytes) -> list[tuple[str, list[list]]]:
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    return [(name, [list(row) for row in wb[name].iter_rows(values_only=True)]) for name in wb.sheetnames]


def _read_xls_sheets(data: bytes) -> list[tuple[str, list[list]]]:
    book = xlrd.open_workbook(file_contents=data)
    return [(sheet.name, [sheet.row_values(r) for r in range(sheet.nrows)]) for sheet in book.sheets()]


def parse_workbook(data: bytes) -> list[ParsedSheet]:
    """Always reprocesses every sheet from scratch -- no partial-state resume (spec's
    Parse-stage constraint). A per-sheet failure is captured in that sheet's `error`
    alone; it never loses every other sheet in the bundle."""
    fmt = sniff_workbook_format(data)
    sheets = _read_xlsx_sheets(data) if fmt == "xlsx" else _read_xls_sheets(data)
    parsed: list[ParsedSheet] = []
    for name, rows in sheets:
        header = find_header_row(rows)
        if header is None:
            continue  # an Index/notes/summary sheet, not a holdings sheet -- not an error
        header_row_index, columns = header
        try:
            market_value_header = str(rows[header_row_index][columns["market_value"]])
            multiplier = market_value_multiplier(market_value_header)
            holdings = parse_sheet_rows(rows[header_row_index + 1:], columns, multiplier)
            parsed.append(ParsedSheet(name, holdings, None))
        except Exception as exc:  # one sheet's bad data must not lose every other sheet
            parsed.append(ParsedSheet(name, [], f"{type(exc).__name__}: {exc}"))
    return parsed
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_parsing.py -v`
Expected: PASS (8 tests).

- [ ] **Step 10: Write the failing test for ZIP-bundle extraction**

No AMC is onboarded against the `ZIP_OF_WORKBOOKS` shape in this plan yet — both
candidates found by the spike (DSP, Aditya Birla Sun Life) turned out today to require a
browser render step or a hidden filter step a plain fetch can't drive (see Scope note).
This capability is still built now, generically, per instruction not to leave a known
shape out of the framework — the next AMC that fits it is a registry entry away, not a
new pipeline change.

```python
# append to backend/tests/services/analytics/test_portfolio_disclosure_parsing.py
import zipfile

from app.services.analytics.portfolio_disclosure_parsing import extract_zip_members


def test_extract_zip_members_returns_only_workbook_files():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("Fund A.xlsx", _xlsx_bytes({"Sheet1": [["a"]]}))
        zf.writestr("Fund B.xls", _xls_bytes({"Sheet1": [["a"]]}))
        zf.writestr("readme.txt", "not a workbook")
    members = extract_zip_members(buf.getvalue())
    names = {name for name, _ in members}
    assert names == {"Fund A.xlsx", "Fund B.xls"}
```

- [ ] **Step 11: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_parsing.py::test_extract_zip_members_returns_only_workbook_files -v`
Expected: FAIL with `ImportError: cannot import name 'extract_zip_members'`.

- [ ] **Step 12: Implement ZIP-member extraction**

Append to `backend/app/services/analytics/portfolio_disclosure_parsing.py`, and add
`import zipfile` to the top-of-file imports:

```python
def extract_zip_members(data: bytes) -> list[tuple[str, bytes]]:
    """(filename, bytes) for every workbook-shaped member of a ZIP archive -- stdlib
    zipfile, no new dependency. A directory entry or non-workbook file (readme, proxy-
    voting PDF alongside the portfolio workbooks) is silently skipped, not an error."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        return [
            (name, zf.read(name))
            for name in zf.namelist()
            if name.lower().endswith((".xls", ".xlsx")) and not name.endswith("/")
        ]
```

- [ ] **Step 13: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_parsing.py -v`
Expected: PASS (9 tests).

- [ ] **Step 14: Commit**

```bash
git add backend/requirements.txt backend/requirements-dev.txt \
  backend/app/services/analytics/portfolio_disclosure_parsing.py \
  backend/tests/services/analytics/test_portfolio_disclosure_parsing.py
git commit -m "feat: add generic Parse stage for AMC portfolio disclosures"
```

---

### Task 3: Normalize stage — scheme-name matching

**Files:**
- Create: `backend/app/services/analytics/portfolio_disclosure_matching.py`
- Test: `backend/tests/services/analytics/test_portfolio_disclosure_matching.py`

**Interfaces:**
- Consumes: `app.services.analytics.amfi_factsheet_client.FundFamily`,
  `build_families(schemes: list[Scheme]) -> list[FundFamily]` (both already public in the
  existing, unmodified attribute-04 module — sub-project 1 is closed, this task only
  imports from it, never edits it).
- Produces: `MATCH_METHOD_EXACT = "EXACT"`, `MATCH_METHOD_FUZZY = "FUZZY"`; `def
  match_scheme_name(raw_name: str, families: list[FundFamily]) -> tuple[FundFamily, str,
  Decimal] | None` — Task 6's orchestrator calls this per parsed sheet.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/services/analytics/test_portfolio_disclosure_matching.py
import uuid
from decimal import Decimal

from app.models.reference import Scheme
from app.services.analytics.amfi_factsheet_client import build_families
from app.services.analytics.portfolio_disclosure_matching import (
    MATCH_METHOD_EXACT, MATCH_METHOD_FUZZY, match_scheme_name,
)


def _scheme(amc, base_name, plan="Direct"):
    return Scheme(
        id=uuid.uuid4(), name=f"{base_name} - {plan} - Growth", amc_name=amc, base_name=base_name,
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )


def test_exact_match_scoped_to_one_amc():
    families = build_families([_scheme("Nippon India Mutual Fund", "Nippon India Large Cap Fund")])
    result = match_scheme_name("Nippon India Large Cap Fund", families)
    assert result is not None
    family, method, confidence = result
    assert family.base_name == "Nippon India Large Cap Fund"
    assert method == MATCH_METHOD_EXACT
    assert confidence == Decimal("1.0")


def test_fuzzy_match_above_threshold():
    families = build_families([_scheme("Nippon India Mutual Fund", "Nippon India Large Cap Fund")])
    result = match_scheme_name("Nippon India Large Cap Fund - Equity", families)
    assert result is not None
    assert result[1] == MATCH_METHOD_FUZZY


def test_ambiguous_match_returns_none():
    families = build_families([
        _scheme("Test AMC", "Test AMC Large Cap Fund"),
        _scheme("Test AMC", "Test AMC Large Cap Fund - Series 2"),
    ])
    assert match_scheme_name("Test AMC Large Cap", families) is None


def test_no_confident_match_returns_none():
    families = build_families([_scheme("Test AMC", "Test AMC Large Cap Fund")])
    assert match_scheme_name("Completely Unrelated Sheet Name", families) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_matching.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.analytics.portfolio_disclosure_matching'`.

- [ ] **Step 3: Implement the matcher**

```python
# backend/app/services/analytics/portfolio_disclosure_matching.py
"""Normalize stage: match a disclosure sheet's raw scheme/fund name to a locally known
scheme family. Reuses the hybrid layered pattern already established for fund-manager
attribution (amfi_factsheet_client.match_scheme_page): exact-first, scoped fuzzy
fallback, an ambiguity guard, and a persisted confidence -- not a new one-off matcher
(feedback_matching_design_philosophy). A separate, locally-owned canonicalizer (not an
import of attribute 04's private `_canonical_fund_name`) keeps this module independent
of sub-project 1's closed, intern-owned code while applying the identical rule set."""
from __future__ import annotations

import re
from decimal import Decimal
from difflib import SequenceMatcher

from app.services.analytics.amfi_factsheet_client import FundFamily

MATCH_METHOD_EXACT = "EXACT"
MATCH_METHOD_FUZZY = "FUZZY"

MIN_MATCH_CONFIDENCE = Decimal("0.80")
AMBIGUITY_MARGIN = Decimal("0.05")

_BOILERPLATE_RE = re.compile(
    r"\b(FUND|SCHEME|PLAN|DIRECT|REGULAR|GROWTH|IDCW|DIVIDEND|REINVESTMENT|PAYOUT)\b", re.IGNORECASE,
)


def _canonical_name(name: str) -> str:
    s = _BOILERPLATE_RE.sub("", name.upper())
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def match_scheme_name(raw_name: str, families: list[FundFamily]) -> tuple[FundFamily, str, Decimal] | None:
    """`families` must already be scoped to one AMC -- never search across AMCs.
    Returns None when no confident, unambiguous match exists (Review Focus #2)."""
    wanted = _canonical_name(raw_name)
    exact = [f for f in families if f.canonical == wanted]
    if len(exact) == 1:
        return exact[0], MATCH_METHOD_EXACT, Decimal("1.0")
    if len(exact) > 1:
        return None

    scored = sorted(
        ((f, Decimal(str(round(SequenceMatcher(None, wanted, f.canonical).ratio(), 3)))) for f in families),
        key=lambda pair: pair[1], reverse=True,
    )
    if not scored or scored[0][1] < MIN_MATCH_CONFIDENCE:
        return None
    if len(scored) > 1 and scored[0][1] - scored[1][1] < AMBIGUITY_MARGIN:
        return None
    return scored[0][0], MATCH_METHOD_FUZZY, scored[0][1]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_matching.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/portfolio_disclosure_matching.py \
  backend/tests/services/analytics/test_portfolio_disclosure_matching.py
git commit -m "feat: add Normalize-stage scheme-name matcher for portfolio disclosures"
```

---

### Task 4: Write stage — idempotent batch + holding writer

**Files:**
- Create: `backend/app/services/analytics/portfolio_disclosure_writer.py`
- Test: `backend/tests/services/analytics/test_portfolio_disclosure_writer.py`

**Interfaces:**
- Consumes: `DisclosureBatch`, `SchemeHolding` (Task 1); `FundFamily` (existing,
  unmodified); `ParsedHolding` (Task 2).
- Produces: `def write_disclosure_batch(db: Session, family: FundFamily, as_of_date:
  date, amc_name: str, source_url: str, holdings: list[ParsedHolding], match_method: str,
  match_confidence: Decimal, parse_errors: list[dict] | None = None) -> int` (returns the
  number of scheme batches written) — Task 6's orchestrator calls this per matched sheet.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/services/analytics/test_portfolio_disclosure_writer.py
import uuid
from datetime import date
from decimal import Decimal

from app.models.enums import DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding
from app.services.analytics.amfi_factsheet_client import build_families
from app.services.analytics.portfolio_disclosure_parsing import ParsedHolding
from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch

_HOLDING = ParsedHolding(
    instrument_name="HDFC Bank Ltd", isin="INE040A01034", sector_raw="Banks",
    quantity=Decimal("1000.0000"), market_value=Decimal("1500000.00"), pct_to_nav=Decimal("2.500"),
)


def _family(db, amc="Nippon India Mutual Fund", base="Nippon India Large Cap Fund", n_plans=2):
    schemes = [
        Scheme(id=uuid.uuid4(), name=f"{base} - Plan {i}", amc_name=amc, base_name=base,
               sebi_category="Equity Scheme - Large Cap Fund")
        for i in range(n_plans)
    ]
    db.add_all(schemes)
    db.commit()
    return build_families(schemes)[0]


def test_writes_one_batch_per_plan_variant(db_session):
    family = _family(db_session, n_plans=2)
    written = write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file.xls", [_HOLDING], "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    assert written == 2
    batches = db_session.query(DisclosureBatch).filter_by(as_of_date=date(2026, 8, 31)).all()
    assert len(batches) == 2
    assert all(b.status == DisclosureBatchStatus.WRITTEN for b in batches)
    for batch in batches:
        holdings = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).all()
        assert len(holdings) == 1
        assert holdings[0].instrument_name == "HDFC Bank Ltd"


def test_rerun_replaces_holdings_not_duplicates(db_session):
    family = _family(db_session, n_plans=1)
    write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file.xls", [_HOLDING], "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    new_holding = ParsedHolding(
        instrument_name="Reliance Industries Ltd", isin="INE002A01018", sector_raw="Petroleum Products",
        quantity=Decimal("500.0000"), market_value=Decimal("2000000.00"), pct_to_nav=Decimal("3.300"),
    )
    write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file-v2.xls", [new_holding], "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    batch = db_session.query(DisclosureBatch).filter_by(as_of_date=date(2026, 8, 31)).one()
    holdings = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).all()
    assert len(holdings) == 1
    assert holdings[0].instrument_name == "Reliance Industries Ltd"
    assert batch.source_url == "https://example.test/file-v2.xls"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_writer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.analytics.portfolio_disclosure_writer'`.

- [ ] **Step 3: Implement the writer**

```python
# backend/app/services/analytics/portfolio_disclosure_writer.py
"""Write stage: delete-all-rows-for-batch_id-then-reinsert, never a partial upsert --
re-running Write for the same batch is always safe, since nothing partial is ever left
behind to merge with (spec's Write-stage constraint)."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import DisclosureBatchStatus
from app.models.reference import DisclosureBatch, SchemeHolding
from app.services.analytics.amfi_factsheet_client import FundFamily
from app.services.analytics.portfolio_disclosure_parsing import ParsedHolding


def write_disclosure_batch(
    db: Session, family: FundFamily, as_of_date: date, amc_name: str, source_url: str,
    holdings: list[ParsedHolding], match_method: str, match_confidence: Decimal,
    parse_errors: list[dict] | None = None,
) -> int:
    """Writes to every plan/option row of the matched family -- holdings are identical
    across a fund's plan variants, the same precedent as attribute 04's
    `upsert_scheme_fund_managers`. Returns the number of scheme batches written."""
    written = 0
    for scheme in family.schemes:
        batch = (
            db.query(DisclosureBatch)
            .filter_by(scheme_id=scheme.id, as_of_date=as_of_date)
            .one_or_none()
        )
        if batch is None:
            batch = DisclosureBatch(
                id=uuid.uuid4(), scheme_id=scheme.id, as_of_date=as_of_date, amc_name=amc_name,
                status=DisclosureBatchStatus.PENDING,
            )
            db.add(batch)
            db.flush()
        else:
            db.query(SchemeHolding).filter_by(batch_id=batch.id).delete()
        batch.source_url = source_url
        batch.match_method = match_method
        batch.match_confidence = match_confidence
        batch.parse_errors = parse_errors
        batch.status = DisclosureBatchStatus.WRITTEN
        batch.written_at = datetime.now(timezone.utc)
        for holding in holdings:
            db.add(SchemeHolding(
                id=uuid.uuid4(), batch_id=batch.id, instrument_name=holding.instrument_name,
                isin=holding.isin, sector_raw=holding.sector_raw, quantity=holding.quantity,
                market_value=holding.market_value, pct_to_nav=holding.pct_to_nav,
            ))
        written += 1
    db.flush()
    return written
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_writer.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/portfolio_disclosure_writer.py \
  backend/tests/services/analytics/test_portfolio_disclosure_writer.py
git commit -m "feat: add idempotent Write stage for portfolio disclosures"
```

---

### Task 5: Adapter registry — `file_shape`-aware entries for every re-verified AMC

**Files:**
- Create: `backend/app/services/analytics/portfolio_disclosure_resolvers.py`
- Test: `backend/tests/services/analytics/test_portfolio_disclosure_resolvers.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DisclosureResolverKind` (enum: `STATIC_REGEX`, `JSON_API`, `MANUAL`,
  `WAYBACK_LOCATE`); `DisclosureFileShape` (enum: `SINGLE_WORKBOOK_MULTI_SHEET`,
  `MULTI_FILE_SINGLE_SCHEME`, `ZIP_OF_WORKBOOKS`, `DETERMINISTIC_TEMPLATE`);
  `DisclosureResolverEntry` (frozen dataclass: `kind`, `file_shape: DisclosureFileShape |
  None`, `landing_url: str | None`, `link_pattern: str | None`, `exclude_pattern: str |
  None`, `url_template: str | None`, `cdn_domain: str | None`, `note: str | None`);
  `AMC_DISCLOSURE_RESOLVERS: dict[str, DisclosureResolverEntry]` — Task 6/7's orchestrator
  iterates this dict and dispatches on `kind`/`file_shape`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/services/analytics/test_portfolio_disclosure_resolvers.py
from app.services.analytics.portfolio_disclosure_resolvers import (
    AMC_DISCLOSURE_RESOLVERS, DisclosureFileShape, DisclosureResolverKind,
)


def test_nippon_india_is_onboarded_as_single_workbook_multi_sheet():
    entry = AMC_DISCLOSURE_RESOLVERS["Nippon India Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.STATIC_REGEX
    assert entry.file_shape is DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET
    assert entry.landing_url == "https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures/"
    assert entry.link_pattern == r"MONTHLY-PORTFOLIO"


def test_helios_is_onboarded_as_multi_file_single_scheme_excluding_fortnightly():
    entry = AMC_DISCLOSURE_RESOLVERS["Helios Mutual Fund"]
    assert entry.file_shape is DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME
    assert entry.exclude_pattern == r"fortnightly"


def test_union_is_onboarded_as_deterministic_template():
    entry = AMC_DISCLOSURE_RESOLVERS["Union Mutual Fund"]
    assert entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE
    assert "{scheme_slug}" in entry.url_template
    assert "{dd}" in entry.url_template and "{yyyy}" in entry.url_template


def test_hdfc_is_onboarded_as_wayback_locate_with_a_separate_cdn_domain():
    entry = AMC_DISCLOSURE_RESOLVERS["HDFC Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.WAYBACK_LOCATE
    assert entry.cdn_domain == "files.hdfcfund.com"


def test_alphagrep_is_not_onboarded_pending_fresh_research():
    # 2026-10-10 re-check: every slug guess against the spike's recorded template
    # returned an identical soft-404 HTML shell (200 status, same byte count) -- no
    # literal working URL survives today. Deliberately absent, not an oversight.
    assert "AlphaGrep Mutual Fund" not in AMC_DISCLOSURE_RESOLVERS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_resolvers.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the registry**

```python
# backend/app/services/analytics/portfolio_disclosure_resolvers.py
"""Per-AMC Locate configuration for the look-through engine (sub-project 2, section 00).

Config-driven by default -- a landing URL plus a link-pattern regex, no bespoke Python --
per the spec's "adapter design" section. `DETERMINISTIC_TEMPLATE` is still config-only
(Task 6 builds one generic URL-substitution Locate function all such AMCs share);
`WAYBACK_LOCATE` is the one kind requiring genuinely custom code (Task 7), since a CDX
lookup isn't a plain regex match. Grows the same way fund_manager_resolvers.py does: one
entry per AMC, added only after independently re-verifying a real downloaded file today
-- never guessed from the AMC's name alone, and never kept after a re-check disproves it
(AlphaGrep was in an earlier draft of this registry and was removed here for exactly that
reason). See this plan's Scope note for the full list of what's deliberately excluded and
why."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class DisclosureResolverKind(str, Enum):
    STATIC_REGEX = "static_regex"
    JSON_API = "json_api"
    MANUAL = "manual"
    WAYBACK_LOCATE = "wayback_locate"


class DisclosureFileShape(str, Enum):
    # One URL -> one workbook -> one sheet per scheme (Nippon India, Shriram, PPFAS, Groww).
    SINGLE_WORKBOOK_MULTI_SHEET = "single_workbook_multi_sheet"
    # One landing page links many separate single-scheme files; the scheme name comes
    # from the link's own text, not an internal worksheet name (Helios, Capitalmind,
    # Angel One).
    MULTI_FILE_SINGLE_SCHEME = "multi_file_single_scheme"
    # A ZIP archive containing one or more workbooks -- built generically (Task 2's
    # extract_zip_members) but no AMC is onboarded against it yet; see Scope note.
    ZIP_OF_WORKBOOKS = "zip_of_workbooks"
    # No landing page at all -- the URL is built directly from the scheme's own name plus
    # the as-of date (Union).
    DETERMINISTIC_TEMPLATE = "deterministic_template"


@dataclass(frozen=True)
class DisclosureResolverEntry:
    kind: DisclosureResolverKind
    file_shape: DisclosureFileShape | None = None
    landing_url: str | None = None
    link_pattern: str | None = None
    exclude_pattern: str | None = None
    url_template: str | None = None
    cdn_domain: str | None = None
    note: str | None = None


AMC_DISCLOSURE_RESOLVERS: dict[str, DisclosureResolverEntry] = {
    # -- SINGLE_WORKBOOK_MULTI_SHEET: one consolidated monthly workbook, sheet per scheme.
    "Nippon India Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url="https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures/",
        link_pattern=r"MONTHLY-PORTFOLIO",
    ),
    # 2026-10-10: confirmed live, e.g. ".../Monthly-Portfolio-for-the-Financial-Year/
    # 2026-2027/Monthly-Portfolio-Shriram-Mutual-Fund-September-2026.xls".
    "Shriram Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url="https://www.shriramamc.in/investor-statutory-disclosures",
        link_pattern=r"Monthly-Portfolio-Shriram-Mutual-Fund",
    ),
    # 2026-10-10: confirmed live, e.g. ".../2026/PPTSF_PPFAS_Monthly_Portfolio_Report_
    # September_30_2026.xlsx?07102026".
    "PPFAS Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url="https://amc.ppfas.com/downloads/portfolio-disclosure/",
        link_pattern=r"PPFAS_Monthly_Portfolio_Report",
    ),
    # 2026-10-10: confirmed live, e.g. ".../Portfolio/2026%20-2027/Monthly%20Portfolio-
    # %20Sep%2030%202026.xlsx" (a single AMC-wide file, distinct from the same page's
    # separate "Fortnightly Portfolio" section).
    "Groww Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url="https://www.growwmf.in/statutory-disclosure/portfolio",
        link_pattern=r"Monthly\s*Portfolio",
        exclude_pattern=r"fortnightly",
    ),

    # -- MULTI_FILE_SINGLE_SCHEME: one landing page, many separate single-scheme files.
    # 2026-10-10: confirmed live across 5+ schemes, e.g. ".../helios-flexi-cap-fund-
    # monthly-portfolio-as-on-30th-september-2026.xls" alongside a same-page "...-
    # fortnightly-portfolio-..." for the overnight fund -- excluded by exclude_pattern.
    "Helios Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url="https://www.heliosmf.in/portfolio-disclosure/",
        link_pattern=r"monthly-portfolio",
        exclude_pattern=r"fortnightly",
    ),
    # 2026-10-10: confirmed live, e.g. ".../Capitalmind_Monthly_Portfolio_Disclosure_
    # September_2026_e738be9752.xlsx" alongside the same AMC's separate AUM-disclosure
    # files on the same page -- link_pattern scopes to the holdings file specifically.
    "Capitalmind Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url="https://www.capitalmindmf.com/statutory-disclosures.html",
        link_pattern=r"Monthly_Portfolio_Disclosure",
    ),
    # 2026-10-10: confirmed live across many ETF/index schemes, e.g. ".../Monthly-
    # Portfolio-September-2026-Angel-One-Nifty-50-ETF-1.xlsx" -- casing of "portfolio"
    # varies across months (seen both "Monthly-portfolio-" and "Monthly-Portfolio-"), so
    # the pattern is case-insensitive (Task 6 compiles every link_pattern with re.I).
    "Angel One Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url="https://www.angelonemf.com/downloads",
        link_pattern=r"monthly-portfolio",
    ),

    # -- DETERMINISTIC_TEMPLATE: no scrape -- the URL is scheme name + date, substituted
    # directly. 2026-10-10: confirmed live -- downloaded a real September-2026 .xlsx
    # (correct content-type, 316KB) for "Union Corporate Bond Fund" via the lowercase-
    # hyphenated slug; a deliberately wrong slug correctly 500s (a real per-scheme
    # existence check server-side, not a soft-404 shell -- the AlphaGrep failure mode
    # this same check would have caught, see Scope note).
    "Union Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.DETERMINISTIC_TEMPLATE,
        url_template=(
            "https://www.unionmf.com/docs/default-source/funddetail-downloads/"
            "fund-portfolio/{month_name_lower}-{yyyy}/monthly-portfolio-report-"
            "{scheme_slug}-{dd}-{mm}-{yyyy}.xlsx"
        ),
    ),

    # -- WAYBACK_LOCATE: custom Locate code (Task 7) -- the file is discoverable via the
    # Internet Archive's CDX index, then downloaded live from a separate, unprotected
    # domain. landing_url here is the CDX query target (the AMC's own blocked/listing-
    # less page), not something Task 6's regex-based _static_regex_candidates ever calls.
    "HDFC Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.WAYBACK_LOCATE,
        landing_url="https://www.hdfcfund.com/statutory-disclosure/portfolio-disclosure",
        cdn_domain="files.hdfcfund.com",
        note="Main domain is Akamai bot-blocked; Wayback's cached HTML of the blocked "
             "page reveals the current filename, which then downloads live from the "
             "separate, unprotected files.hdfcfund.com subdomain.",
    ),
    "Canara Robeco Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.WAYBACK_LOCATE,
        landing_url="https://www.canararobeco.com/wp-content/uploads/",
        note="Main site's own 'Portfolio Disclosure' nav drives a genuinely encrypted "
             "request/response API (not attempted -- see the project's constraint "
             "against cracking it); the files themselves sit on the same domain's plain "
             "WordPress media library with no live listing page, discoverable only via "
             "a CDX search for this URL prefix.",
    ),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_resolvers.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/portfolio_disclosure_resolvers.py \
  backend/tests/services/analytics/test_portfolio_disclosure_resolvers.py
git commit -m "feat: add file-shape-aware portfolio-disclosure adapter registry"
```

---

### Task 6: Orchestrator — shape-dispatched Locate/Fetch + the per-AMC refresh loop

**Files:**
- Create: `backend/app/services/analytics/portfolio_disclosure_client.py`
- Test: `backend/tests/services/analytics/test_portfolio_disclosure_client.py`

**Interfaces:**
- Consumes: `commit_off_loop` (`app.db.session`); `Scheme`, `DisclosureBatch`
  (`app.models.reference`); `DisclosureBatchStatus` (`app.models.enums`);
  `build_families` (`amfi_factsheet_client`); `match_scheme_name` (Task 3);
  `parse_workbook` (Task 2); `AMC_DISCLOSURE_RESOLVERS`, `DisclosureResolverEntry`,
  `DisclosureResolverKind`, `DisclosureFileShape` (Task 5); `write_disclosure_batch`
  (Task 4).
- Produces: `LocatedFile` (frozen dataclass: `data: bytes`, `source_url: str`,
  `as_of_date: date`, `scheme_hint: str | None = None`) — Task 7's `WAYBACK_LOCATE`
  mechanism returns a `list[LocatedFile]` in this same shape so the refresh loop below
  doesn't need to know which Locate mechanism produced a file; `PortfolioDisclosureRefreshResult`
  (frozen dataclass: `success: bool`, `amcs_processed: int = 0`, `amcs_failed: int = 0`,
  `schemes_written: int = 0`, `seconds: float = 0.0`); `async def
  refresh_portfolio_disclosures(db: Session) -> PortfolioDisclosureRefreshResult` —
  Task 9's job script calls this.

- [ ] **Step 1: Write the failing test for filename-date parsing and Locate candidate ranking**

```python
# backend/tests/services/analytics/test_portfolio_disclosure_client.py
from datetime import date

from app.services.analytics.portfolio_disclosure_client import _filename_as_of_date


def test_filename_as_of_date_parses_day_month_two_digit_year():
    url = "https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-31-Aug-26.xls"
    assert _filename_as_of_date(url) == date(2026, 8, 31)


def test_filename_as_of_date_returns_none_when_undated():
    assert _filename_as_of_date("https://example.test/current.xls") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the module through `_filename_as_of_date`**

```python
# backend/app/services/analytics/portfolio_disclosure_client.py
"""Orchestrates the five-stage look-through ingestion pipeline (Locate/Fetch/Parse/
Normalize/Write) across every onboarded AMC. Mirrors amfi_factsheet_client.py's
refresh_fund_managers shape: per-AMC try/except isolation, a commit per AMC so one AMC's
failure never undoes another's, and structured single-line alerting consumed by a
CloudWatch metric filter on the existing SNS ops-alerts topic. Retry-until-found is
implicit: an AMC already WRITTEN for the current as-of date is skipped, so a plain daily
cron (Task 9) needs no per-AMC publishing-lag config.

Locate is shape-dispatched (Task 5's DisclosureFileShape), not one-size-fits-all: a
landing page can yield one workbook for the whole AMC (SINGLE_WORKBOOK_MULTI_SHEET) or
many separate single-scheme files (MULTI_FILE_SINGLE_SCHEME, where the scheme identity
comes from the link's own text, not an internal worksheet name), or there may be no
landing page at all and the URL is built directly from the scheme name and date
(DETERMINISTIC_TEMPLATE). WAYBACK_LOCATE (Task 7) is the one kind requiring genuinely
custom code rather than a declarative registry row."""
from __future__ import annotations

import html
import logging
import re
import time
import urllib.parse
from dataclasses import dataclass
from datetime import date, timedelta

import httpx
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.enums import DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme
from app.services.analytics.amfi_factsheet_client import build_families
from app.services.analytics.portfolio_disclosure_matching import match_scheme_name
from app.services.analytics.portfolio_disclosure_parsing import parse_workbook
from app.services.analytics.portfolio_disclosure_resolvers import (
    AMC_DISCLOSURE_RESOLVERS, DisclosureFileShape, DisclosureResolverEntry, DisclosureResolverKind,
)
from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 90.0
_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
_MAX_WORKBOOK_BYTES = 60 * 1024 * 1024
_ANCHOR_LINK_RE = re.compile(r'<a[^>]+href=["\']([^"\']+\.(?:xlsx?|zip)[^"\']*)["\'][^>]*>(.*?)</a>', re.I | re.S)
_BARE_LINK_RE = re.compile(r'["\']([^"\']+\.(?:xlsx?|zip)[^"\']*)["\']', re.I)
# An optional ordinal suffix (1st/2nd/3rd/30th) between the day and separator -- Helios's
# real confirmed filenames read "...-as-on-30th-september-2026.xls", not "-30-september-".
_FILENAME_DATE_RE = re.compile(r"(\d{1,2})(?:st|nd|rd|th)?[-_]([A-Za-z]{3,9})[-_](\d{2,4})", re.I)
# Fallback for filenames with no day at all (Canara Robeco's Wayback-discovered uploads
# read "...-Canara-Robeco-Small-Cap-Fund-–-August-2026.xlsx" -- month and year only).
_FILENAME_MONTH_YEAR_RE = re.compile(r"([A-Za-z]{3,9})[-_\s–](\d{4})", re.I)
_MONTHS = {m: i for i, m in enumerate(
    ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}


@dataclass(frozen=True)
class LocatedFile:
    data: bytes
    source_url: str
    as_of_date: date
    scheme_hint: str | None = None


@dataclass(frozen=True)
class PortfolioDisclosureRefreshResult:
    success: bool
    amcs_processed: int = 0
    amcs_failed: int = 0
    schemes_written: int = 0
    seconds: float = 0.0


def _filename_as_of_date(url: str) -> date | None:
    """The disclosure's as-of date, parsed from the source filename itself (e.g.
    "NIMF-MONTHLY-PORTFOLIO-31-Aug-26.xls") -- AMCs state this far more reliably in the
    filename than inside the workbook, which is often just raw SEBI columns."""
    decoded = urllib.parse.unquote(url)
    match = _FILENAME_DATE_RE.search(decoded)
    if match:
        day, month_name, year = match.groups()
        month = _MONTHS.get(month_name[:3].lower())
        if month is None:
            return None
        year_int = int(year)
        if year_int < 100:
            year_int += 2000
        try:
            return date(year_int, month, int(day))
        except ValueError:
            return None
    month_year = _FILENAME_MONTH_YEAR_RE.search(decoded)
    if month_year:
        month_name, year = month_year.groups()
        month = _MONTHS.get(month_name[:3].lower())
        if month is None:
            return None
        # No day in the filename -- the file represents the whole month, so its last day
        # is the as-of date (Canara Robeco's Wayback-discovered uploads: month + year only).
        next_month = date(int(year), month, 28) + timedelta(days=4)
        return next_month - timedelta(days=next_month.day)
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for the full end-to-end refresh**

```python
# append to backend/tests/services/analytics/test_portfolio_disclosure_client.py
import io
import uuid
from decimal import Decimal

import httpx
import openpyxl
import pytest

from app.models.reference import DisclosureBatch, Scheme, SchemeHolding
from app.services.analytics import portfolio_disclosure_client as client
from app.services.analytics.portfolio_disclosure_resolvers import (
    DisclosureFileShape, DisclosureResolverEntry, DisclosureResolverKind,
)

_LANDING_HTML = """
<html><body>
<a href="/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-30-Jun-26.xls">June Monthly Portfolio</a>
<a href="/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-31-Aug-26.xls">August Monthly Portfolio</a>
</body></html>
"""

_HOLDING_ROWS = [
    ["Name of the Instrument", "ISIN", "Industry", "Quantity", "Market Value (Rs. in Lakhs)", "% to NAV"],
    ["HDFC Bank Ltd", "INE040A01034", "Banks", 1000, 15.00, 2.5],
]


def _workbook_bytes() -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    ws = wb.create_sheet("Nippon India Large Cap Fund")
    for row in _HOLDING_ROWS:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/factsheet-portfolio-and-other-disclosures/"):
        return httpx.Response(200, text=_LANDING_HTML)
    if "NIMF-MONTHLY-PORTFOLIO-31-Aug-26.xls" in str(request.url):
        return httpx.Response(200, content=_workbook_bytes())
    return httpx.Response(404)


@pytest.fixture
def _http(monkeypatch):
    real_client = httpx.AsyncClient
    monkeypatch.setattr(client, "httpx", httpx)
    monkeypatch.setattr(
        client.httpx, "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(_handler), trust_env=False, **kw),
    )


def test_refresh_writes_matched_scheme_and_is_idempotent_on_rerun(db_session, _http, monkeypatch):
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "Nippon India Mutual Fund": DisclosureResolverEntry(
            kind=DisclosureResolverKind.STATIC_REGEX,
            file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
            landing_url="https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures/",
            link_pattern=r"MONTHLY-PORTFOLIO",
        ),
    })
    scheme = Scheme(
        id=uuid.uuid4(), name="Nippon India Large Cap Fund - Direct - Growth",
        amc_name="Nippon India Mutual Fund", base_name="Nippon India Large Cap Fund",
        sebi_category="Equity Scheme - Large Cap Fund",
    )
    db_session.add(scheme)
    db_session.commit()

    import asyncio
    result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.success is True
    assert result.amcs_processed == 1
    assert result.amcs_failed == 0
    assert result.schemes_written == 1

    batch = db_session.query(DisclosureBatch).filter_by(scheme_id=scheme.id).one()
    assert batch.status.value == "written"
    holdings = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).all()
    assert len(holdings) == 1
    assert holdings[0].market_value == Decimal("1500000.00")

    # Review Focus #5: a second run this same month must not re-fetch or duplicate rows.
    result2 = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result2.amcs_processed == 1
    assert db_session.query(SchemeHolding).filter_by(batch_id=batch.id).count() == 1
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py -v`
Expected: FAIL with `AttributeError: module 'app.services.analytics.portfolio_disclosure_client' has no attribute 'refresh_portfolio_disclosures'`.

- [ ] **Step 7: Implement shape-dispatched Locate/Fetch and the refresh loop**

Append to `backend/app/services/analytics/portfolio_disclosure_client.py`:

```python
def _extract_links(html_text: str) -> list[tuple[str, str]]:
    """(url, label) pairs for every workbook/zip link on the page. Anchor tags give a
    label -- the link text, used as a scheme_hint for MULTI_FILE_SINGLE_SCHEME AMCs,
    since that shape's files carry no reliable internal worksheet name. A bare quoted
    URL not inside a plain <a href> (seen on some AMCs' JS-templated download buttons) is
    still returned, with an empty label rather than being silently dropped."""
    found: dict[str, str] = {}
    for href, label in _ANCHOR_LINK_RE.findall(html_text):
        found[href] = re.sub(r"<[^>]+>", " ", label)
    for href in _BARE_LINK_RE.findall(html_text):
        found.setdefault(href, "")
    return list(found.items())


def _clean_label(label: str) -> str:
    return html.unescape(" ".join(label.split())).strip()


async def _static_regex_candidates(
    client: httpx.AsyncClient, entry: DisclosureResolverEntry,
) -> list[tuple[str, str]]:
    resp = await client.get(entry.landing_url)
    resp.raise_for_status()
    pattern = re.compile(entry.link_pattern or r"portfolio", re.I)
    exclude = re.compile(entry.exclude_pattern, re.I) if entry.exclude_pattern else None
    links = []
    for href, label in _extract_links(resp.text):
        joined = f"{href} {label}"
        if not pattern.search(joined):
            continue
        if exclude and exclude.search(joined):
            continue
        links.append((urllib.parse.urljoin(str(resp.url), html.unescape(href)), label))
    return links


async def _download_workbook(client: httpx.AsyncClient, url: str) -> bytes | None:
    async with client.stream("GET", url) as resp:
        resp.raise_for_status()
        body = bytearray()
        async for chunk in resp.aiter_bytes():
            body.extend(chunk)
            if len(body) > _MAX_WORKBOOK_BYTES:
                return None
    return bytes(body)


async def _fetch_candidates(
    client: httpx.AsyncClient, candidates: list[tuple[str, str]], *, keep_all: bool,
) -> list[LocatedFile]:
    """Review Focus #1: a landing page listing an old month's file alongside the new one
    must not pick whichever happens to appear first in the HTML -- rank by the date
    parsed from each filename, newest first. SINGLE_WORKBOOK_MULTI_SHEME AMCs publish one
    file for the whole AMC, so the first that actually downloads wins (keep_all=False).
    MULTI_FILE_SINGLE_SCHEME AMCs publish one file per scheme at the same as-of date, so
    every file at the newest date found is kept (keep_all=True)."""
    dated = sorted(
        ((url, label, as_of) for url, label in candidates if (as_of := _filename_as_of_date(url)) is not None),
        key=lambda t: t[2], reverse=True,
    )
    if not dated:
        return []
    if not keep_all:
        for url, _label, as_of in dated:
            try:
                data = await _download_workbook(client, url)
            except httpx.HTTPError:
                continue
            if data:
                return [LocatedFile(data=data, source_url=url, as_of_date=as_of)]
        return []
    latest = dated[0][2]
    results = []
    for url, label, as_of in dated:
        if as_of != latest:
            continue
        try:
            data = await _download_workbook(client, url)
        except httpx.HTTPError:
            continue
        if data:
            results.append(LocatedFile(data=data, source_url=url, as_of_date=as_of, scheme_hint=_clean_label(label) or None))
    return results


def _slugify_scheme_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _latest_month_end(today: date | None = None) -> date:
    """Best-effort as-of date for DETERMINISTIC_TEMPLATE AMCs, which have no landing page
    to read a real published date from -- the most recently completed calendar month,
    which is what every SEBI monthly disclosure reports against."""
    today = today or date.today()
    return today.replace(day=1) - timedelta(days=1)


async def _locate_deterministic_template(
    client: httpx.AsyncClient, entry: DisclosureResolverEntry, scheme_names: list[str],
) -> list[LocatedFile]:
    as_of = _latest_month_end()
    results = []
    for scheme_name in scheme_names:
        url = entry.url_template.format(
            scheme_slug=_slugify_scheme_name(scheme_name),
            dd=f"{as_of.day:02d}", mm=f"{as_of.month:02d}", yyyy=as_of.year,
            month_name_lower=as_of.strftime("%B").lower(),
        )
        try:
            data = await _download_workbook(client, url)
        except httpx.HTTPError:
            # A per-scheme 404/500 here is a real "this scheme isn't under this slug"
            # signal (Union's confirmed behaviour), not a transient fetch failure --
            # skip just this scheme, same "one bad sheet never blocks a good one" rule
            # SINGLE_WORKBOOK_MULTI_SHEET already applies per-sheet.
            continue
        if data:
            results.append(LocatedFile(data=data, source_url=url, as_of_date=as_of, scheme_hint=scheme_name))
    return results


async def _locate_and_fetch(
    client: httpx.AsyncClient, entry: DisclosureResolverEntry, scheme_rows: list[Scheme],
) -> list[LocatedFile]:
    if entry.kind is DisclosureResolverKind.WAYBACK_LOCATE:
        return await _locate_wayback(client, entry)  # Task 7
    if entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE:
        names = [s.base_name or s.name for s in scheme_rows]
        return await _locate_deterministic_template(client, entry, names)
    if entry.kind is not DisclosureResolverKind.STATIC_REGEX:
        raise NotImplementedError(f"{entry.kind} Locate requires its own onboarding task")
    candidates = await _static_regex_candidates(client, entry)
    keep_all = entry.file_shape is DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME
    return await _fetch_candidates(client, candidates, keep_all=keep_all)


def _alert(amc_name: str, reason: str, detail: str) -> None:
    # One line per problem; a CloudWatch metric filter on this prefix raises an alarm on
    # the existing ops-alerts SNS topic (Task 10).
    logger.warning(
        "PORTFOLIO_DISCLOSURE_ALERT amc=%s reason=%s detail=%s",
        " ".join(amc_name.split()), " ".join(reason.split()), " ".join(detail.split()),
    )


def _already_written(db: Session, amc_name: str, as_of_date: date) -> bool:
    return (
        db.query(DisclosureBatch)
        .filter_by(amc_name=amc_name, as_of_date=as_of_date, status=DisclosureBatchStatus.WRITTEN)
        .first()
        is not None
    )


async def refresh_portfolio_disclosures(db: Session) -> PortfolioDisclosureRefreshResult:
    started = time.perf_counter()
    amcs_processed = amcs_failed = schemes_written = 0

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_HEADERS, follow_redirects=True) as http_client:
        for amc_name, entry in AMC_DISCLOSURE_RESOLVERS.items():
            if entry.kind is DisclosureResolverKind.MANUAL:
                continue
            try:
                scheme_rows = db.query(Scheme).filter(Scheme.amc_name == amc_name).all()
                located_files = await _locate_and_fetch(http_client, entry, scheme_rows)
                if not located_files:
                    _alert(amc_name, "no_file_found", entry.landing_url or entry.url_template or "")
                    amcs_failed += 1
                    continue
                latest_as_of = max(f.as_of_date for f in located_files)
                if _already_written(db, amc_name, latest_as_of):
                    amcs_processed += 1  # retry-until-found: already done this month, not a failure
                    continue
                families = build_families(scheme_rows)
                written_this_amc = 0
                for file in located_files:
                    sheets = parse_workbook(file.data)
                    parse_errors = [{"file": s.sheet_name, "error": s.error} for s in sheets if s.error] or None
                    for sheet in sheets:
                        if sheet.error or not sheet.holdings:
                            continue
                        # A located file's own scheme_hint (link text, or the scheme name
                        # used to build its URL) takes priority over the workbook's
                        # internal sheet name -- a MULTI_FILE_SINGLE_SCHEME/
                        # DETERMINISTIC_TEMPLATE file's sheet is often just "Sheet1".
                        match_key = file.scheme_hint or sheet.sheet_name
                        result = match_scheme_name(match_key, families)
                        if result is None:
                            logger.info("refresh_portfolio_disclosures: unmatched amc=%s key=%r", amc_name, match_key[:80])
                            continue
                        family, method, confidence = result
                        written_this_amc += write_disclosure_batch(
                            db, family, file.as_of_date, amc_name, file.source_url, sheet.holdings, method, confidence,
                            parse_errors=parse_errors,
                        )
                await commit_off_loop(db)  # per AMC: a later AMC failing never undoes this one
                amcs_processed += 1
                schemes_written += written_this_amc
            except Exception as exc:  # one AMC breaking never stops the rest
                db.rollback()
                _alert(amc_name, "error", f"{type(exc).__name__}: {exc}"[:300])
                amcs_failed += 1

    return PortfolioDisclosureRefreshResult(
        success=True, amcs_processed=amcs_processed, amcs_failed=amcs_failed,
        schemes_written=schemes_written, seconds=round(time.perf_counter() - started, 1),
    )
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py -v`
Expected: PASS (3 tests). Note: `_locate_and_fetch` references `_locate_wayback`, which
doesn't exist until Task 7 -- this is fine, since it's only called for
`DisclosureResolverKind.WAYBACK_LOCATE` and no test exercises that kind yet. Python
resolves the name at call time, not at module-import time.

- [ ] **Step 9: Write the failing test for `MULTI_FILE_SINGLE_SCHEME` — matching by link text, not internal sheet name**

Append to `backend/tests/services/analytics/test_portfolio_disclosure_client.py`:

```python
def _single_sheet_workbook_bytes() -> bytes:
    # The workbook's own sheet keeps openpyxl's default name ("Sheet") -- deliberately
    # NOT the scheme name, proving a MULTI_FILE_SINGLE_SCHEME match can't be relying on it.
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in _HOLDING_ROWS:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_multi_file_single_scheme_matches_via_link_text_not_internal_sheet_name(db_session, monkeypatch):
    landing_html = """
    <html><body>
    <a href="/disclosures/helios-flexi-cap-fund-monthly-portfolio-as-on-30th-september-2026.xls">Helios Flexi Cap Fund - Monthly Portfolio</a>
    <a href="/disclosures/helios-overnight-fund-fortnightly-portfolio-as-on-15th-september-2026.xls">Helios Overnight Fund - Fortnightly Portfolio</a>
    </body></html>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/portfolio-disclosure/"):
            return httpx.Response(200, text=landing_html)
        if "helios-flexi-cap-fund-monthly-portfolio" in str(request.url):
            return httpx.Response(200, content=_single_sheet_workbook_bytes())
        return httpx.Response(404)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(client, "httpx", httpx)
    monkeypatch.setattr(
        client.httpx, "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), trust_env=False, **kw),
    )
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "Helios Mutual Fund": DisclosureResolverEntry(
            kind=DisclosureResolverKind.STATIC_REGEX,
            file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
            landing_url="https://www.heliosmf.in/portfolio-disclosure/",
            link_pattern=r"monthly-portfolio",
            exclude_pattern=r"fortnightly",
        ),
    })
    scheme = Scheme(
        id=uuid.uuid4(), name="Helios Flexi Cap Fund - Direct - Growth",
        amc_name="Helios Mutual Fund", base_name="Helios Flexi Cap Fund",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db_session.add(scheme)
    db_session.commit()

    import asyncio
    result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_processed == 1
    # the fortnightly overnight-fund link is excluded by exclude_pattern, so only the
    # flexi-cap file is fetched at all, and it matches via its link text.
    assert result.schemes_written == 1

    batch = db_session.query(DisclosureBatch).filter_by(scheme_id=scheme.id).one()
    assert batch.as_of_date == date(2026, 9, 30)
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py::test_multi_file_single_scheme_matches_via_link_text_not_internal_sheet_name -v`
Expected: PASS already -- Step 7's generalized dispatch already handles this shape; this
step pins the regression rather than introducing new code. If it fails, the bug is in
`_fetch_candidates`'s `keep_all` branch or `_extract_links`'s label capture -- fix there.

- [ ] **Step 11: Write the failing test for `DETERMINISTIC_TEMPLATE` — URL built from scheme name and date, no landing page**

Append to `backend/tests/services/analytics/test_portfolio_disclosure_client.py`:

```python
def test_deterministic_template_builds_per_scheme_url_from_slug_and_month_end(db_session, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if "union-corporate-bond-fund" in str(request.url):
            return httpx.Response(200, content=_single_sheet_workbook_bytes())
        # Union's real confirmed behaviour for a slug that doesn't exist: a 500, not a
        # soft-404 shell -- see this plan's Scope note on why that distinction mattered.
        return httpx.Response(500)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(client, "httpx", httpx)
    monkeypatch.setattr(
        client.httpx, "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), trust_env=False, **kw),
    )
    monkeypatch.setattr(client, "_latest_month_end", lambda: date(2026, 9, 30))
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "Union Mutual Fund": DisclosureResolverEntry(
            kind=DisclosureResolverKind.STATIC_REGEX,
            file_shape=DisclosureFileShape.DETERMINISTIC_TEMPLATE,
            url_template=(
                "https://www.unionmf.com/docs/default-source/funddetail-downloads/"
                "fund-portfolio/{month_name_lower}-{yyyy}/monthly-portfolio-report-"
                "{scheme_slug}-{dd}-{mm}-{yyyy}.xlsx"
            ),
        ),
    })
    db_session.add_all([
        Scheme(id=uuid.uuid4(), name="Union Corporate Bond Fund - Direct - Growth",
               amc_name="Union Mutual Fund", base_name="Union Corporate Bond Fund",
               sebi_category="Debt Scheme - Corporate Bond Fund"),
        Scheme(id=uuid.uuid4(), name="Union Some Other Fund - Direct - Growth",
               amc_name="Union Mutual Fund", base_name="Union Some Other Fund",
               sebi_category="Equity Scheme - Flexi Cap Fund"),
    ])
    db_session.commit()

    import asyncio
    result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_processed == 1
    # "Union Some Other Fund"'s slug 500s (not a real scheme under this exact template) --
    # skipped, not a failure for the whole AMC.
    assert result.schemes_written == 1
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py::test_deterministic_template_builds_per_scheme_url_from_slug_and_month_end -v`
Expected: PASS already -- Step 7's `_locate_deterministic_template` already implements
this. If it fails, check `_slugify_scheme_name`'s handling of the scheme's `base_name`
or the `url_template.format(...)` field names against the registry entry's template.

- [ ] **Step 13: Run the full file and commit**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py -v`
Expected: PASS (5 tests).

```bash
git add backend/app/services/analytics/portfolio_disclosure_client.py \
  backend/tests/services/analytics/test_portfolio_disclosure_client.py
git commit -m "feat: add shape-dispatched portfolio-disclosure Locate/Fetch orchestrator"
```

---

### Task 7: `WAYBACK_LOCATE` — Internet Archive CDX discovery for bot-blocked AMCs

**Files:**
- Modify: `backend/app/services/analytics/portfolio_disclosure_client.py`
- Modify: `backend/tests/services/analytics/test_portfolio_disclosure_client.py`

**Interfaces:**
- Consumes: `LocatedFile`, `_extract_links`, `_fetch_candidates` (Task 6); `httpx`.
- Produces: `async def _locate_wayback(client: httpx.AsyncClient, entry:
  DisclosureResolverEntry) -> list[LocatedFile]` — Task 6's `_locate_and_fetch` already
  calls this by name for `DisclosureResolverKind.WAYBACK_LOCATE`; nothing later in the
  orchestrator needs to change.

Two AMCs share this kind but need two different CDX query shapes (confirmed in the
2026-10-09 investigation doc, re-verified in this plan's Scope note):

- **HDFC Mutual Fund**: the live site is Akamai bot-blocked, but a single exact-URL CDX
  lookup finds a cached capture of the listing page; its HTML names the current file,
  which is then downloaded live from a separate, unprotected CDN subdomain
  (`files.hdfcfund.com`) — the main domain's block doesn't apply there.
- **Canara Robeco Mutual Fund**: there's no listing page to cache at all — the real files
  sit directly on a plain WordPress media-library path with no index; a *prefix* CDX
  search over that path surfaces every capture, and each is downloaded live from the
  same, unprotected domain (no domain rewrite needed).

- [ ] **Step 1: Write the failing test for the CDX query helper**

Append to `backend/tests/services/analytics/test_portfolio_disclosure_client.py`:

```python
_CDX_RESPONSE = [
    ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"],
    ["com,hdfcfund)/statutory-disclosure/portfolio-disclosure", "20260915120000",
     "https://www.hdfcfund.com/statutory-disclosure/portfolio-disclosure", "text/html", "200", "ABC123", "45000"],
]


def test_cdx_query_returns_original_urls_from_the_most_recent_snapshots():
    import asyncio

    async def run():
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.host == "web.archive.org"
            return httpx.Response(200, json=_CDX_RESPONSE)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            return await client._cdx_query(http_client, "https://www.hdfcfund.com/statutory-disclosure/portfolio-disclosure")

    assert asyncio.run(run()) == ["https://www.hdfcfund.com/statutory-disclosure/portfolio-disclosure"]


def test_cdx_query_returns_empty_list_when_no_snapshot_exists():
    import asyncio

    async def run():
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=[["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            return await client._cdx_query(http_client, "https://example.test/never-captured")

    assert asyncio.run(run()) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py -k cdx_query -v`
Expected: FAIL with `AttributeError: module ... has no attribute '_cdx_query'`.

- [ ] **Step 3: Implement `_cdx_query` and `_locate_wayback`**

Append to `backend/app/services/analytics/portfolio_disclosure_client.py`:

```python
async def _cdx_query(client: httpx.AsyncClient, url: str, *, match_type: str = "exact") -> list[str]:
    """The Internet Archive's CDX index for a URL (or, with match_type="prefix", every
    URL under it) -- the "original" column of each row is the real, live URL that was
    captured. collapse=urlkey + the newest-first sort keeps this to one row per distinct
    URL; filter=statuscode:200 excludes captures of the page's own error responses."""
    resp = await client.get(
        "https://web.archive.org/cdx/search/cdx",
        params={
            "url": url, "output": "json", "matchType": match_type,
            "filter": "statuscode:200", "collapse": "urlkey", "limit": "-50",
        },
    )
    resp.raise_for_status()
    rows = resp.json()
    if len(rows) <= 1:
        return []
    header, *data_rows = rows
    original_idx = header.index("original")
    return [row[original_idx] for row in data_rows]


async def _locate_wayback_cached_page(
    client: httpx.AsyncClient, entry: DisclosureResolverEntry,
) -> list[LocatedFile]:
    snapshots = await _cdx_query(client, entry.landing_url, match_type="exact")
    if not snapshots:
        return []
    # The "id_" modifier returns the captured page's raw bytes with no Wayback
    # chrome/banner injected -- a plain page to scan exactly like a live one.
    cached = await client.get(f"https://web.archive.org/web/2id_/{entry.landing_url}")
    cached.raise_for_status()
    candidates = []
    for href, label in _extract_links(cached.text):
        absolute = urllib.parse.urljoin(entry.landing_url, html.unescape(href))
        parsed = urllib.parse.urlsplit(absolute)
        live_url = parsed._replace(netloc=entry.cdn_domain, scheme="https").geturl()
        candidates.append((live_url, label))
    return await _fetch_candidates(client, candidates, keep_all=True)


async def _locate_wayback_prefix_search(
    client: httpx.AsyncClient, entry: DisclosureResolverEntry,
) -> list[LocatedFile]:
    originals = await _cdx_query(client, entry.landing_url, match_type="prefix")
    candidates = [(url, url.rsplit("/", 1)[-1]) for url in originals]
    return await _fetch_candidates(client, candidates, keep_all=True)


async def _locate_wayback(client: httpx.AsyncClient, entry: DisclosureResolverEntry) -> list[LocatedFile]:
    if entry.cdn_domain:
        return await _locate_wayback_cached_page(client, entry)
    return await _locate_wayback_prefix_search(client, entry)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py -k cdx_query -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing end-to-end test for the cached-page mechanism (HDFC shape)**

Append to `backend/tests/services/analytics/test_portfolio_disclosure_client.py`:

```python
def test_wayback_cached_page_rewrites_to_the_live_cdn_domain(db_session, monkeypatch):
    cached_html = """
    <html><body>
    <a href="/content/dam/abc/en/statutory-disclosure/MONTHLY-PORTFOLIO-30-Sep-26.xlsx">Monthly Portfolio September 2026</a>
    </body></html>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "web.archive.org" and "cdx/search/cdx" in str(request.url):
            return httpx.Response(200, json=[
                ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"],
                ["20260915000000", "20260915000000",
                 "https://www.hdfcfund.com/statutory-disclosure/portfolio-disclosure", "text/html", "200", "X", "1"],
            ])
        if request.url.host == "web.archive.org" and "/web/2id_/" in str(request.url):
            return httpx.Response(200, text=cached_html)
        if request.url.host == "files.hdfcfund.com":
            return httpx.Response(200, content=_single_sheet_workbook_bytes())
        return httpx.Response(404)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(client, "httpx", httpx)
    monkeypatch.setattr(
        client.httpx, "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), trust_env=False, **kw),
    )
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "HDFC Mutual Fund": DisclosureResolverEntry(
            kind=DisclosureResolverKind.WAYBACK_LOCATE,
            landing_url="https://www.hdfcfund.com/statutory-disclosure/portfolio-disclosure",
            cdn_domain="files.hdfcfund.com",
        ),
    })
    scheme = Scheme(
        id=uuid.uuid4(), name="HDFC Flexi Cap Fund - Direct - Growth",
        amc_name="HDFC Mutual Fund", base_name="HDFC Flexi Cap Fund",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db_session.add(scheme)
    db_session.commit()

    import asyncio
    result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_processed == 1
    # no scheme matches "Monthly Portfolio September 2026" -- the point of this test is
    # that the fetch reached files.hdfcfund.com at all, not that it matched.
    assert result.amcs_failed == 0
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py::test_wayback_cached_page_rewrites_to_the_live_cdn_domain -v`
Expected: FAIL — before Step 3's `_locate_wayback` existed, `_locate_and_fetch` raised
`NameError`. If run after Step 3 (the usual TDD order here is implementation-then-test
since Step 3 already shipped the code this step is pinning), it should already PASS;
treat a failure as a real bug in `_locate_wayback_cached_page`'s domain rewrite, not a
step-ordering issue.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py::test_wayback_cached_page_rewrites_to_the_live_cdn_domain -v`
Expected: PASS (1 test).

- [ ] **Step 8: Write the failing end-to-end test for the prefix-search mechanism (Canara Robeco shape)**

Append to `backend/tests/services/analytics/test_portfolio_disclosure_client.py`:

```python
def test_wayback_prefix_search_fetches_every_capture_live_from_the_same_domain(db_session, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "web.archive.org" and "cdx/search/cdx" in str(request.url):
            return httpx.Response(200, json=[
                ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"],
                ["x", "20260901000000",
                 "https://www.canararobeco.com/wp-content/uploads/2026/09/SC-%E2%80%93-Canara-Robeco-Small-Cap-Fund-%E2%80%93-August-2026.xlsx",
                 "application/octet-stream", "200", "X", "1"],
            ])
        if request.url.host == "www.canararobeco.com":
            return httpx.Response(200, content=_single_sheet_workbook_bytes())
        return httpx.Response(404)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(client, "httpx", httpx)
    monkeypatch.setattr(
        client.httpx, "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), trust_env=False, **kw),
    )
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "Canara Robeco Mutual Fund": DisclosureResolverEntry(
            kind=DisclosureResolverKind.WAYBACK_LOCATE,
            landing_url="https://www.canararobeco.com/wp-content/uploads/",
        ),
    })
    scheme = Scheme(
        id=uuid.uuid4(), name="Canara Robeco Small Cap Fund - Direct - Growth",
        amc_name="Canara Robeco Mutual Fund", base_name="Canara Robeco Small Cap Fund",
        sebi_category="Equity Scheme - Small Cap Fund",
    )
    db_session.add(scheme)
    db_session.commit()

    import asyncio
    result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_processed == 1
    assert result.amcs_failed == 0
```

- [ ] **Step 9: Run the full file and commit**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py -v`
Expected: PASS (9 tests total in this file).

```bash
git add backend/app/services/analytics/portfolio_disclosure_client.py \
  backend/tests/services/analytics/test_portfolio_disclosure_client.py
git commit -m "feat: add Wayback-CDX Locate mechanism for Akamai-blocked AMCs"
```

---

### Task 8: Failure isolation and ambiguity-guard regression tests

**Files:**
- Modify: `backend/tests/services/analytics/test_portfolio_disclosure_client.py`
- Modify: `backend/tests/services/analytics/test_portfolio_disclosure_parsing.py`

**Interfaces:**
- Consumes: everything from Tasks 2–7; no new production code.
- Produces: nothing new — this task only adds the two remaining Review Focus
  regression tests that Tasks 2–7 didn't already cover end-to-end.

- [ ] **Step 1: Write the failing test — one AMC's failure never stops another's**

Append to `backend/tests/services/analytics/test_portfolio_disclosure_client.py`:

```python
def test_one_amc_failing_does_not_stop_the_next(db_session, _http, monkeypatch):
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "Bad AMC": DisclosureResolverEntry(
            kind=DisclosureResolverKind.STATIC_REGEX,
            landing_url="https://example.test/bad-landing/", link_pattern=r"PORTFOLIO",
        ),
        "Nippon India Mutual Fund": DisclosureResolverEntry(
            kind=DisclosureResolverKind.STATIC_REGEX,
            file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
            landing_url="https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures/",
            link_pattern=r"MONTHLY-PORTFOLIO",
        ),
    })
    scheme = Scheme(
        id=uuid.uuid4(), name="Nippon India Large Cap Fund - Direct - Growth",
        amc_name="Nippon India Mutual Fund", base_name="Nippon India Large Cap Fund",
        sebi_category="Equity Scheme - Large Cap Fund",
    )
    db_session.add(scheme)
    db_session.commit()

    import asyncio
    result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_failed == 1  # "Bad AMC": 404 on its landing page
    assert result.amcs_processed == 1  # Nippon still succeeds
    assert result.schemes_written == 1
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py::test_one_amc_failing_does_not_stop_the_next -v`
Expected: PASS already (Task 6's try/except-per-AMC loop already implements this) —
this step confirms the regression is actually pinned, not just incidentally working. If
it fails, the bug is in Task 6's exception handling around `_locate_and_fetch`/`httpx`
raising inside the loop; fix there, not here.

- [ ] **Step 3: Write the failing test — ambiguous within-AMC match leaves a sheet unmatched, not mis-written**

Append to `backend/tests/services/analytics/test_portfolio_disclosure_parsing.py`... actually,
this belongs with the client (it needs `refresh_portfolio_disclosures`'s full loop, not
just the matcher in isolation — Task 3 already unit-tests the matcher's ambiguity guard
directly). Append instead to `backend/tests/services/analytics/test_portfolio_disclosure_client.py`:

```python
def test_ambiguous_sheet_name_is_logged_unmatched_not_written(db_session, _http, monkeypatch, caplog):
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "Nippon India Mutual Fund": DisclosureResolverEntry(
            kind=DisclosureResolverKind.STATIC_REGEX,
            file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
            landing_url="https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures/",
            link_pattern=r"MONTHLY-PORTFOLIO",
        ),
    })
    # Two schemes whose base names collide with the sheet name under the matcher's own
    # ambiguity margin -- neither should receive the sheet's holdings.
    db_session.add_all([
        Scheme(id=uuid.uuid4(), name="Nippon India Large Cap Fund - Direct - Growth",
               amc_name="Nippon India Mutual Fund", base_name="Nippon India Large Cap",
               sebi_category="Equity Scheme - Large Cap Fund"),
        Scheme(id=uuid.uuid4(), name="Nippon India Large Cap Fund Series 2 - Direct - Growth",
               amc_name="Nippon India Mutual Fund", base_name="Nippon India Large Cap Series 2",
               sebi_category="Equity Scheme - Large Cap Fund"),
    ])
    db_session.commit()

    import logging
    import asyncio
    with caplog.at_level(logging.INFO):
        result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.schemes_written == 0
    assert db_session.query(DisclosureBatch).count() == 0
    assert "unmatched" in caplog.text
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py::test_ambiguous_sheet_name_is_logged_unmatched_not_written -v`
Expected: this exercises `match_scheme_name`'s ambiguity guard (Task 3) through the full
pipeline; it should already PASS given Task 3's existing logic. If it fails, the bug is
in how `refresh_portfolio_disclosures` (Task 6) handles a `None` match — fix there.

- [ ] **Step 5: Confirm both tests pass together with the full suite**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_client.py -v`
Expected: PASS (11 tests total in this file).

- [ ] **Step 6: Commit**

```bash
git add backend/tests/services/analytics/test_portfolio_disclosure_client.py
git commit -m "test: pin failure-isolation and ambiguity-guard regressions for portfolio disclosures"
```

---

### Task 9: Scheduled job script

**Files:**
- Create: `backend/scripts/jobs/refresh_portfolio_disclosures_daily.py`

**Interfaces:**
- Consumes: `SessionLocal` (`app.db.session`); `refresh_portfolio_disclosures`,
  `PortfolioDisclosureRefreshResult` (Task 6).
- Produces: a `main()` CLI entrypoint — Task 10's Terraform `command` list invokes this
  script by path, exactly like every other job in `infra/modules/scheduler/main.tf`.

- [ ] **Step 1: Write the script**

```python
# backend/scripts/jobs/refresh_portfolio_disclosures_daily.py
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.portfolio_disclosure_client import refresh_portfolio_disclosures

logger = logging.getLogger(__name__)


async def main_async(db) -> None:
    result = await refresh_portfolio_disclosures(db)
    logger.info(
        "refresh_portfolio_disclosures_daily: success=%s amcs_processed=%d amcs_failed=%d "
        "schemes_written=%d seconds=%.1f",
        result.success, result.amcs_processed, result.amcs_failed, result.schemes_written, result.seconds,
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify it runs against a local/dev database**

Run: `cd backend && python scripts/jobs/refresh_portfolio_disclosures_daily.py`
Expected: exits 0; logs a line starting `refresh_portfolio_disclosures_daily:
success=True amcs_processed=1 amcs_failed=0` (Nippon India fetched live) — confirms the
Locate regex and landing URL are still correct against the real site, not just the
mocked test.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/jobs/refresh_portfolio_disclosures_daily.py
git commit -m "feat: add scheduled job entrypoint for portfolio-disclosure ingestion"
```

---

### Task 10: Terraform scheduling and alerting

**Files:**
- Modify: `infra/modules/scheduler/main.tf`

**Interfaces:**
- Consumes: `local.jobs` map, `aws_cloudwatch_log_group.jobs`, `aws_sns_topic.ops_alerts`
  (all existing, unmodified resources in this file).
- Produces: a new scheduled ECS Fargate task (`portfolio-disclosures-daily`) and its own
  CloudWatch metric filter + alarm — nothing later in this plan depends on this task's
  output, since it's the last task.

- [ ] **Step 1: Add the job entry**

In `infra/modules/scheduler/main.tf`, inside `locals.jobs`, add after `fund_managers_monthly`:

```hcl
    # Daily, not monthly: retry-until-found is implicit in
    # refresh_portfolio_disclosures's own _already_written skip-check, so a flat
    # 1st-20th daily window needs no per-AMC publishing-lag config (spec's
    # "Scheduling and orchestration" section). 20 days covers the slowest AMC's
    # stated lag with margin.
    portfolio_disclosures_daily = {
      slug                = "portfolio-disclosures-daily"
      command             = ["python", "scripts/jobs/refresh_portfolio_disclosures_daily.py"]
      schedule_expression = "cron(0 7 1-20 * ? *)"
      task_role_arn       = null
    }
```

- [ ] **Step 2: Add the metric filter and alarm**

After `resource "aws_cloudwatch_metric_alarm" "fund_manager_alerts"`'s closing brace, add:

```hcl
resource "aws_cloudwatch_log_metric_filter" "portfolio_disclosure_alerts" {
  name           = "${var.project}-${var.environment}-portfolio-disclosure-alerts"
  log_group_name = aws_cloudwatch_log_group.jobs["portfolio_disclosures_daily"].name
  pattern        = "PORTFOLIO_DISCLOSURE_ALERT"
  metric_transformation {
    name      = "PortfolioDisclosureAlerts"
    namespace = "${var.project}/${var.environment}/jobs"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "portfolio_disclosure_alerts" {
  alarm_name          = "${var.project}-${var.environment}-portfolio-disclosure-alerts"
  alarm_description   = "An AMC's monthly portfolio disclosure wasn't found or failed to parse; the log line names the AMC, reason and URL."
  namespace           = "${var.project}/${var.environment}/jobs"
  metric_name         = "PortfolioDisclosureAlerts"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
}
```

- [ ] **Step 3: Validate the Terraform syntax (no apply)**

Run: `cd infra && terraform fmt -check modules/scheduler/main.tf && terraform validate`
Expected: `fmt -check` exits 0 (no formatting diff); `validate` reports "Success! The
configuration is valid." Do **not** run `terraform apply` — deploying this is a separate,
explicit step the user takes later, same as every other infra change in this project.

- [ ] **Step 4: Commit**

```bash
git add infra/modules/scheduler/main.tf
git commit -m "feat: schedule daily portfolio-disclosure ingestion with its own alerting"
```

---

## Open items carried forward (not in this plan's scope)

Every item below has a specific, named technical reason it isn't onboarded this round —
see this plan's Scope note for the live re-check each one is based on. None are deferred
purely to conserve token/implementation effort; each either needs a capability this plan
doesn't build (a headless-browser Fetch step, a bespoke CDX-to-prefix mapping), needs
fresh research no amount of extra time today could responsibly substitute for (a literal
endpoint that survives nowhere in writing), or is already a pre-existing spec-level
decision outside this plan's scope to revisit.

- **`JSON_API`-kind Locate (14 AMCs: PGIM India, Navi, Jio BlackRock, Bandhan, ICICI
  Prudential, Bajaj Finserv, Unifi, Zerodha, Abakkus, quant Money Managers, Sundaram,
  Choice, UTI, Tata).** The registry's `DisclosureResolverKind.JSON_API` enum member
  anticipates this, but `_locate_and_fetch` only implements `STATIC_REGEX` and
  `WAYBACK_LOCATE` this round (raises `NotImplementedError` otherwise, the same
  precedent as `amfi_factsheet_client._json_api_candidates`) — no literal reusable
  endpoint survives in writing anywhere for any of these 14; each needs its own
  from-scratch network-trace research pass before an adapter can be written at all.
- **`ZIP_OF_WORKBOOKS` has no onboarded AMC yet**, despite Task 2 building
  `extract_zip_members` generically — ICICI Prudential's real ZIP-of-151-xlsx and the
  other AMCs that share this bundling pattern (Bank of India, Abakkus, Sundaram, Baroda
  BNP Paribas) are all also in the `JSON_API`-research-gap bucket above, so there's no
  AMC today where only the ZIP step is missing; wiring a registry entry for it is moot
  until one of those 14 is separately onboarded.
- **JS-shell AMCs (DSP, NJ Mutual Fund, and 14 others individually re-confirmed the same
  way — SBI, Mirae Asset, Invesco, Axis, ITI, Trust Mutual Fund, Taurus, Wealth Company,
  Aditya Birla Sun Life, JM Financial, Bank of India, Baroda BNP Paribas, 360 ONE, HSBC,
  LIC).** A plain `httpx` GET returns a near-empty JS-rendered shell (DSP: 114 bytes; NJ:
  1,253 bytes), not the real content — needs a headless-browser Fetch step (Playwright),
  a new production dependency with real infra cost (more Fargate CPU/memory, a slower
  job), not just more Locate-pattern research. Worth its own follow-on plan once the
  cost/benefit of adding Playwright to the ingestion job is weighed on its own.
- **AlphaGrep Mutual Fund.** The spike's recorded calendar-deterministic URL template was
  re-tried today with 4 real scheme-name slug guesses plus a deliberately bogus one — all
  5 returned an identical `HTTP 200` soft-404 HTML shell (`Content-Type: text/html`,
  `Content-Length: 59089` for every guess). No literal working URL survives today; either
  the site changed or the original verification was mistaken. Needs fresh, from-scratch
  discovery, not a registry entry built on an unconfirmed claim.
- **Old Bridge Mutual Fund.** Its filename convention has visibly drifted since the
  spike — a mix of `IR_Old_Bridge_Mutual_Fund_DDMMYYYY_hash.xlsx` and separate
  per-scheme files, with the per-scheme pattern only confirmed through January 2026.
  Genuinely ambiguous today; not safe to hardcode a `link_pattern` against.
- **Standing manual-fetch (Edelweiss, Mahindra Manulife) and Kotak Mahindra's
  pending-CDN re-check (~2026-10-12).** All three are pre-existing spec-level decisions
  (confirmed-genuine WAF/encrypted-API blocks for the first two; a believed-identical,
  not-yet-live CDN path for Kotak) — not a new design question raised by this plan, just
  sequencing already settled before this plan was written.
- Attributes 02/06/10/13/15's own compute logic, reading from `scheme_holding` — each is
  its own future implementation plan against this one's two tables, per the spec's own
  "Open items" section.
