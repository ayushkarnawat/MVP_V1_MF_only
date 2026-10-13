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

**Downstream consumer:** this plan builds the ingestion layer only (section 00: the two
tables + pipeline + adapters). Attributes 02/06/10/13/15's own compute logic and UI are a
separate, already-written plan that reads off this one's output —
`Docs/analytics/plans/2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-plan.md`.
That plan's Task 0 is gated on this plan: it needs at least one AMC's `disclosure_batches`
row reaching `WRITTEN` with real `scheme_holdings` rows before it can start in earnest.

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

  **Resolved 2026-10-13 (sixth pass, no longer deferred):** the soft-404 shell above is
  AlphaGrep's real *factsheet* API, genuinely AES-encrypted — but the spike-consolidated
  doc's own later sixth-pass correction found a separate, plain static bypass for the
  *disclosure* document specifically
  (`alphagrepmf.ai/assets/documents/{scheme_name}/monthly/FY-{yy}-{yy_plus_1}/
  {month_name}_{yyyy}.xls`, with the two-digit financial-year template corrected from this
  plan's original guess) that bypasses the encrypted API entirely and was confirmed via
  live download. Onboarded in the registry below as `STATIC_REGEX`/`DETERMINISTIC_TEMPLATE`.
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

  **Corrected 2026-10-12** (this plan's own "114/1,253-byte body" test was a missing-`User-Agent`
  artifact, not a real block — see
  `Docs/analytics/investigations/2026-10-12-amc-disclosure-reconciliation-fifth-pass.md` for the
  full live-rechecked evidence behind every AMC below): DSP, NJ Mutual Fund, Wealth Company,
  Baroda BNP Paribas, and 360 ONE were `STATIC_REGEX` all along — this plan's re-check used the
  wrong URL or a bare `httpx` GET missing a realistic Chrome `User-Agent` header, not a real
  JS-shell. SBI, Mirae Asset, Axis, Trust Mutual Fund, Taurus, Aditya Birla Sun Life, Bank of
  India, and LIC each had a stale cited URL; a one-time Playwright trace found a plain
  JSON/AJAX endpoint underneath each one, replayable forever via `curl`/`httpx` — no headless
  browser needed in production (see the `JSON_API`-kind Locate bullet in "Open items carried
  forward" for each one's exact endpoint). Invesco and ITI are confirmed `BOT_BLOCKED` — a real
  headless-Chromium Playwright navigation gets blocked too, so this is not a Playwright candidate
  at all. JM Financial's "file" decodes to AES-ciphertext, a confirmed false positive — not a
  JS-shell, an encrypted dead end. **That leaves exactly 1 AMC, HSBC, confirmed to genuinely need
  a standing-browser fetch step in production** — and the decision is not to add Playwright for
  one AMC (see the go/no-go decision in "Open items carried forward"); HSBC is handled as a
  standing-manual-fetch AMC instead.
- **Old Bridge Mutual Fund — resolved 2026-10-13, no longer deferred.** The naming-drift
  ambiguity described below is real, but per the user's explicit instruction that no AMC
  is left to a later wave, this is a disambiguation rule to build now, not a research gap
  to defer: prefer the per-scheme-named file (`Old_Bridge_<Scheme>_<Month>_<Year>_<hash>.xlsx`)
  over the AMC-wide `IR_` file when both match the current month, and alert (not silently
  pick) if a month has neither. Onboarded in the registry below with this rule encoded as
  `link_pattern`/`exclude_pattern`.
- **Old Bridge Mutual Fund (original framing, kept for audit trail)** — the spike's
  recorded filename pattern (`Monthly_Portfolio_<Month>_<Year>.xlsx`) has visibly changed
  since the spike to a different, less obviously holdings-specific naming convention
  (`IR_Old_Bridge_Mutual_Fund_<DDMMYYYY>_<hash>.xlsx` mixed with per-scheme
  `Old_Bridge_<Scheme>_<Month>_<Year>_<hash>.xlsx` files, inconsistent across months) —
  genuinely ambiguous which file is the holdings disclosure today, not a copy-paste from
  old research. See the resolution immediately above.
- **`JSON_API` tier, UI-discovered group (14 AMCs: PGIM India, Navi, Jio BlackRock,
  Bandhan, ICICI Prudential, Bajaj Finserv, Unifi, Zerodha, Abakkus, quant Mutual Fund,
  Sundaram, Choice, UTI, Tata) — corrected 2026-10-13, no Playwright/browser automation
  needed in production for 13 of these 14, and this is scoped adapter-build work, not a
  research gap.** The original framing here (and in "Open items" below) said none of
  these 14 had a literal endpoint written down and called that "a hard research gap, not a
  scope choice." Two things resolve that: (1) the spike-consolidated doc's own "Second
  audit pass" already recorded a literal endpoint for Navi
  (`navi.com/wp-json/nv/v1/documents`), just not pulled into this plan's registry yet; (2)
  cross-checking attribute 04's own adapter registry
  (`backend/app/services/analytics/fund_manager_resolvers.py`, already-built, in
  production) found that 12 of the remaining 13 AMCs already have a confirmed,
  non-bot-blocked, plain-HTTP document API or static-link page on the *exact same domain*
  for their factsheet document type — strong, concrete evidence the portfolio-disclosure
  equivalent is a sibling endpoint/link, not a page requiring live JS execution. Each of
  those 12 is onboarded this round in Task 5 with that hypothesis spelled out and a note
  reading `NEEDS LIVE VERIFICATION` — a single bounded "try the substituted request,
  confirm with a real download" check per AMC, not fresh research and not a guessed URL
  (the hypothesis is sourced, the confirmation step is explicit). **Bandhan — resolved
  2026-10-13:** the attribute-04 sibling-auth-gate signal above was itself re-checked
  against the more directly relevant evidence (the spike's own second-audit-pass
  investigation of Bandhan's *disclosure* document specifically, not its unrelated
  factsheet API) and found to be a public, unauthenticated backend proxy that signs a
  time-limited GCS URL — no login observed. Reclassified `JSON_API`, onboarded below.
  **Decided 2026-10-13 (resolves amc-coverage.html Q14 — how many AMCs must be live before
  the attributes ship? — see `decisions.md`): neither option A (ship 10, everything else a
  later plan) nor the artifact's own recommended option B (a second wave of 19, a third
  wave of the rest) — overridden per explicit instruction that nothing is left to a later
  wave.** Every AMC whose mechanism is knowable without fresh per-AMC research is onboarded
  in this single execution: all of Q14's named "wave 2" candidates (9 static, Baroda,
  Kotak, the 8 JSON endpoints) plus the 15 the artifact called a research gap are resolved
  below with real mechanisms, not deferred pending research — the research itself is done
  in this pass, not scheduled for later. **WhiteOak Capital** (page confirmed live at
  `mf.whiteoakamc.com/regulatory-disclosures/scheme-portfolios`, but its mechanism isn't
  discovered at all yet) is the sole AMC in the entire 57-AMC universe still genuinely
  open — intentionally left without a registry row (see the registry's closing comment)
  rather than guessed, pending one bounded research pass before Task 6 onboards it; every
  other AMC below now has either a working mechanism or a confirmed hard blocker. **Final
  tally: 51 registry entries (`STATIC_REGEX`/`JSON_API`/`MANUAL`) + 1 open (WhiteOak) + 5
  no-registry-row-needed (ASK, IL&FS, Lakshya, Carnelian, Nuvama) = all 57 AMCs
  accounted for in this single execution wave.** Attribute work can still start as soon as
  one AMC is `WRITTEN` (the artifact's own "after your answer" note for Q14) — AMC
  onboarding and attribute-building run in parallel, neither blocks the other.
- **Decided 2026-10-13 (resolves amc-coverage.html Q15 — how do the 6 manual AMCs get into
  the system? — see `decisions.md`): option A, not the artifact's recommended option C
  ("A, but as wave 2") — same override as Q14, no separate wave.** Edelweiss, Mahindra
  Manulife, Invesco, ITI, JM Financial, HSBC — 6 AMCs, standing manual-fetch, built now as
  part of this plan's single execution wave (an intake mechanism modeled on attribute 04's
  `import_manual_fund_managers.py`), not deferred to a later wave.** Edelweiss and
  Mahindra Manulife per the spec (Akamai WAF; genuinely encrypted request/response API —
  see the project's constraint against attempting to crack it); Invesco and ITI confirmed
  `BOT_BLOCKED` across multiple passes (a real headless-Chromium Playwright navigation
  gets blocked too, not just plain curl — a genuine bot wall, not a missing-interaction
  problem); JM Financial's "file" decodes to AES-ciphertext, a confirmed false positive
  joining the encrypted-API dead-end bucket; HSBC is the sole AMC confirmed to genuinely
  need a real browser in production (see below) — handled as standing-manual-fetch
  instead of adding Playwright as a production dependency for one AMC. **Kotak Mahindra —
  resolved 2026-10-12 (sixth pass), no longer pending.** Live-checked on the trigger date
  itself: the real path is
  `/FAD/Portfolios/Consolidated-SEBI-Portfolio-as-on-{Month}-{DD},-{YYYY}/
  ConsolidatedSEBIPortfolio{Month}{YYYY}.xlsx` on `vatseelabs-s3.kotakmf.com` (found via
  Wayback CDX) — the spec's originally-recorded filename guess had the wrong path prefix
  and naming convention, which is why it 403'd on 2026-10-09 even though Wayback shows the
  real file was already crawled live by 2026-10-10. Confirmed via live download with
  genuine SEBI-schema data. Folds into `STATIC_REGEX`, Wayback-Locate — a plain config row,
  no adapter code, same shape as HDFC.

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
- Modify: `backend/app/models/enums.py` (add `DisclosureBatchStatus`, `AssetType`)
- Modify: `backend/app/models/reference.py` (add `DisclosureBatch`, `SchemeHolding`)
- Create: `backend/alembic/versions/NNNN_disclosure_batches_and_scheme_holdings.py` — `NNNN`
  is whatever the real next sequence number is at build time (F1, see Step 6 below); it
  is written here as `0036` purely because that was the next free number on the day this
  plan was drafted (2026-10-10). The real chain has since moved past it (`0038` is head
  as of 2026-10-13) and will have moved further still by the time this task is executed.
- Test: `backend/tests/services/analytics/test_portfolio_disclosure_models.py`

**Interfaces:**
- Consumes: `app.db.base.Base`, `app.models.enums.enum_column`, `app.models.reference.Scheme`.
- Produces: `DisclosureBatchStatus` (enum: `PENDING`, `FETCHED`, `PARSED`, `WRITTEN`,
  `FAILED`, `AWAITING_MANUAL_UPLOAD`); `AssetType` (enum: `EQUITY_DOMESTIC`,
  `EQUITY_INTERNATIONAL`, `DEBT`, `GOLD_SILVER`, `REIT_INVIT`, `CASH_EQUIVALENT`,
  `DERIVATIVE`, `OTHER` — 8 values, not 6: see "Decided 2026-10-13" note below);
  `DisclosureBatch` (`id`, `scheme_id`, `as_of_date`, `amc_name`, `status`, `source_url`,
  `raw_file_reference`, `match_method`, `match_confidence`, `parse_errors`, `fetched_at`,
  `written_at`); `SchemeHolding` (`id`, `batch_id`, `instrument_name`, `isin`, `sector_raw`,
  `asset_type`, `quantity`, `market_value`, `pct_to_nav`) — every later task imports these
  classes from `app.models.reference`.

**Decided 2026-10-13 (resolves engine.html Q8 and Q13 together — see `decisions.md`):**
`asset_type` is built into this task from the start, not added by a second migration in
the consumer plan as originally drafted. The consumer plan's own Task 1 (the amendment)
is now a no-op verification step, not a schema change — see that plan's revision note.
Two extra enum values beyond the engine spec's original 6 are added: `DERIVATIVE` (futures/
options lines inside an otherwise-equity section — arbitrage and equity-savings funds
disclose these as real rows, not noise) and `OTHER` (a disclosed row whose section header
doesn't match any of the 7 known SEBI categories — e.g. a fund-of-funds' underlying-fund-
unit lines). Both are stored (nothing is dropped) but excluded from every consumer
attribute's sum (stock table, cap split, overlap, asset allocation, P/E-P/B universe) and
counted in each attribute's coverage note instead. `OTHER` is also the backfill-safe
default if this column is ever widened again — it is a real, meaningful enum member here,
not a placeholder, so the backfill inconsistency F11 flagged does not apply to this table.

- [ ] **Step 1: Write the failing model test**

```python
# backend/tests/services/analytics/test_portfolio_disclosure_models.py
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.enums import AssetType, DisclosureBatchStatus
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
        sector_raw="Banks", asset_type=AssetType.EQUITY_DOMESTIC, quantity=Decimal("1000.0000"),
        market_value=Decimal("1500000.00"), pct_to_nav=Decimal("2.500"),
    )
    db_session.add(holding)
    db_session.commit()

    fetched = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).one()
    assert fetched.instrument_name == "HDFC Bank Ltd"
    assert fetched.isin == "INE040A01034"
    assert fetched.market_value == Decimal("1500000.00")
    assert fetched.asset_type == AssetType.EQUITY_DOMESTIC


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


class AssetType(str, enum.Enum):
    EQUITY_DOMESTIC = "equity_domestic"
    EQUITY_INTERNATIONAL = "equity_international"
    DEBT = "debt"
    GOLD_SILVER = "gold_silver"
    REIT_INVIT = "reit_invit"
    CASH_EQUIVALENT = "cash_equivalent"
    # Futures/options rows disclosed inside an otherwise-equity section (arbitrage and
    # equity-savings funds) -- real rows, not noise, but excluded from every consumer
    # attribute's directional sum (see this plan's 2026-10-13 decision note above Task 1).
    DERIVATIVE = "derivative"
    # A disclosed row whose section header matches none of the 7 known SEBI categories
    # (e.g. a fund-of-funds' underlying-fund-unit lines) -- stored, never dropped, but
    # excluded from consumer sums and counted in each attribute's coverage note instead.
    OTHER = "other"
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
    ArnStatus, AssetType, BenchmarkIndex, BenchmarkReturnType, DisclosureBatchStatus,
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
    asset_type: Mapped[AssetType] = mapped_column(enum_column(AssetType), nullable=False)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    market_value: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
    pct_to_nav: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_models.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the Alembic migration**

**Decided 2026-10-13 (F1 — migration numbering):** this plan's `revision`/`down_revision`
values below (`0036`/`0035`) were correct on the day this plan was drafted
(2026-10-10) but are now stale — `0036` already belongs to `scenarios_and_scenario_results`
and the real head is `0038_nav_history_wider_nav` as of 2026-10-13, and will have moved
further still by the time this task is actually executed. Do not hardcode either value.
Immediately before this step, run `cd backend && alembic heads` to get the real current
head, name this migration's file `<next-sequential-number>_disclosure_batches_and_scheme_holdings.py`,
and set `down_revision` to that real head. The code below is written with illustrative
placeholders (`0036`/`0035`) purely to keep the diff readable; replace both at build time.

```python
# backend/alembic/versions/<NNNN>_disclosure_batches_and_scheme_holdings.py
"""disclosure_batches, scheme_holdings: look-through engine ingestion (sub-project 2, section 00)

Revision ID: <NNNN>
Revises: <real current head -- run `alembic heads` at build time, see decision note above>

One row per (scheme, as_of_date) disclosure event; one scheme_holding row per held
security within that batch, written by delete-all-then-reinsert on every (re)parse --
never a partial upsert. See
Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "<NNNN>"
down_revision = "<real current head>"
branch_labels = None
depends_on = None

_STATUS_VALUES = ("pending", "fetched", "parsed", "written", "failed", "awaiting_manual_upload")
# 8 values (Q8/Q13's decision): DERIVATIVE and OTHER beyond the engine spec's original 6
# are added so futures/options rows and unrecognized-section rows are stored, not dropped.
_ASSET_TYPE_VALUES = (
    "equity_domestic", "equity_international", "debt", "gold_silver", "reit_invit",
    "cash_equivalent", "derivative", "other",
)


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
        sa.Column("asset_type", sa.Enum(*_ASSET_TYPE_VALUES, name="assettype"), nullable=False),
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
    sa.Enum(*_ASSET_TYPE_VALUES, name="assettype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(*_STATUS_VALUES, name="disclosurebatchstatus").drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 7: Verify the migration applies cleanly against a scratch DB**

Run: `cd backend && alembic upgrade head && alembic downgrade -1 && alembic upgrade head`
Expected: all three commands exit 0, no error.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/enums.py backend/app/models/reference.py \
  backend/alembic/versions/<NNNN>_disclosure_batches_and_scheme_holdings.py \
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
- Consumes: `app.models.enums.AssetType` (Task 1).
- Produces: `ParsedHolding` (frozen dataclass: `instrument_name: str`, `isin: str | None`,
  `sector_raw: str | None`, `asset_type: AssetType`, `quantity: Decimal | None`,
  `market_value: Decimal`, `pct_to_nav: Decimal`); `ParsedSheet` (frozen dataclass:
  `sheet_name: str`, `holdings: list[ParsedHolding]`, `error: str | None`); `def
  parse_workbook(data: bytes) -> list[ParsedSheet]` — Task 6's orchestrator calls this
  directly.

**Decided 2026-10-13 (resolves engine.html Q9 — "prove the parser against real files"):**
this task is built fixture-first against real downloaded files, not against hand-written
synthetic rows alone. Before Step 2 below, download one real file for each of this plan's
Task 5 AMCs and save it under `backend/tests/fixtures/portfolio_disclosures/` (not under
`Docs/` — fixtures are test inputs, not documentation). Tune `_HEADER_PATTERNS`,
`_SECTION_PATTERNS` (below), and the terminator/unit logic against what those real files
actually contain, not just the synthetic rows in Steps 2/6. Two real-world mismatches are
already known from the format-survey and spike docs and are fixed directly in Step 8/14
below rather than left for a live run to discover: Choice and Aditya Birla Sun Life both
label the weight column "**% to AUM**", not "% to NAV" (confirmed in
`2026-10-09-amc-portfolio-disclosure-spike-batch-A.md`/`-C.md`); a "Sub Total" subtotal
row (distinct from "Total"/"Grand Total") appears in several AMCs' sheets and, as
originally written, would be ingested as a real holding — double-counting that section's
weight. Beyond the parser itself, a post-Write per-AMC sum check is added in Task 4 (Q9's
recommended option, deepened): after writing a batch, sum its `pct_to_nav` values and mark
the batch `FAILED` (not `WRITTEN`) if the total falls outside 90–101% of 100 — catching any
future header/terminator mismatch this fixture set didn't happen to cover, rather than
silently writing a wrong batch.

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
    assert market_value_multiplier("Market Value (Rs.)") == Decimal("1")
    assert market_value_multiplier("Market Value (₹)") == Decimal("1")
    assert market_value_multiplier("Market Value (Rs. in Lakhs)") == Decimal("100000")
    assert market_value_multiplier("Market Value (Rs. in Crores)") == Decimal("10000000")


def test_market_value_multiplier_raises_on_unrecognized_unit():
    # A future AMC's "(Rs. in '000s)" must not be silently treated as bare rupees --
    # the parenthetical names a scale this function doesn't recognize.
    with pytest.raises(ValueError):
        market_value_multiplier("Market Value (Rs. in '000s)")
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

from app.models.enums import AssetType

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
_PARENTHETICAL_UNIT = re.compile(r"\(([^)]*)\)")
_BARE_RUPEE_WORDS = ("rs.", "rs ", "rupees", "₹", "inr")


def market_value_multiplier(header_text: str) -> Decimal:
    """₹ multiplier implied by a market-value header's own unit text (e.g. "Market Value
    (Rs. in Lakhs)"). A header with no parenthetical at all, or a parenthetical that only
    names the currency with no scale word ("(Rs.)", "(₹)"), is bare rupees. A header that
    DOES have a parenthetical naming a scale this function doesn't recognize raises
    instead of silently assuming rupees (spec: "fail loudly on an unrecognized unit
    string") -- e.g. a future AMC using "(Rs. in '000s)" must not be silently treated as
    bare rupees."""
    lowered = header_text.lower()
    for word, multiplier in _UNIT_MULTIPLIERS.items():
        if word in lowered:
            return multiplier
    match = _PARENTHETICAL_UNIT.search(header_text)
    if match:
        inner = match.group(1).lower()
        remainder = inner
        for word in _BARE_RUPEE_WORDS:
            remainder = remainder.replace(word, "")
        if remainder.strip(" .,"):
            raise ValueError(f"unrecognized market-value unit: {header_text!r}")
    return Decimal("1")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_parsing.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing test for header detection and row extraction**

```python
# append to backend/tests/services/analytics/test_portfolio_disclosure_parsing.py
from app.models.enums import AssetType

_HOLDING_ROWS = [
    ["Name of the Instrument", "ISIN", "Industry", "Quantity", "Market Value (Rs. in Lakhs)", "% to NAV"],
    ["Equity & Equity Related", "", "", "", "", ""],
    ["HDFC Bank Ltd", "INE040A01034", "Banks", 1000, 15.00, 2.5],
    ["Reliance Industries Ltd", "INE002A01018", "Petroleum Products", 500, 20.00, 3.3],
    ["Sub Total", "", "", "", 35.00, 5.8],
    ["Money Market Instruments", "", "", "", "", ""],
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


def test_find_header_row_matches_pct_to_aum_header():
    # Choice and Aditya Birla Sun Life label this column "% to AUM", not "% to NAV".
    rows = [["Name of the Instrument", "ISIN", "Industry", "Quantity", "Market Value", "% to AUM"],
            ["HDFC Bank Ltd", "INE040A01034", "Banks", 1000, 15.00, 2.5]]
    result = find_header_row(rows)
    assert result is not None
    assert result[1]["pct_to_nav"] == 5


def test_parse_sheet_rows_stops_at_total_catches_sub_total_and_stamps_asset_type():
    _, columns = find_header_row(_HOLDING_ROWS)
    holdings = parse_sheet_rows(_HOLDING_ROWS[1:], columns, Decimal("100000"))
    # 2 equities + the cash/receivables line, not the "Sub Total" or "Total" rows --
    # the original exact-match terminator check would have ingested "Sub Total" as a
    # third equity holding, double-counting that section's weight.
    assert len(holdings) == 3
    assert holdings[0].instrument_name == "HDFC Bank Ltd"
    assert holdings[0].isin == "INE040A01034"
    assert holdings[0].market_value == Decimal("1500000.00")
    assert holdings[0].asset_type == AssetType.EQUITY_DOMESTIC
    assert holdings[1].asset_type == AssetType.EQUITY_DOMESTIC
    assert holdings[2].instrument_name == "Net Receivables/Payables"
    assert holdings[2].isin is None
    assert holdings[2].asset_type == AssetType.CASH_EQUIVALENT


def test_parse_sheet_rows_defaults_to_other_before_any_section_header():
    rows = [["Some Unlabeled Instrument", "", "", "", 1.00, 0.1], ["Total", "", "", "", 1.00, 0.1]]
    _, columns = find_header_row([_HOLDING_ROWS[0], *rows])
    holdings = parse_sheet_rows(rows, columns, Decimal("1"))
    assert holdings[0].asset_type == AssetType.OTHER


def test_parse_sheet_rows_handles_percent_values_written_as_text():
    rows = [["HDFC Bank Ltd", "INE040A01034", "Banks", 1000, "15.00", "2.50%"],
            ["Total", "", "", "", "15.00", "2.50%"]]
    _, columns = find_header_row([_HOLDING_ROWS[0], *rows])
    holdings = parse_sheet_rows(rows, columns, Decimal("1"))
    assert len(holdings) == 1
    assert holdings[0].pct_to_nav == Decimal("2.50")


def test_parse_workbook_skips_non_holdings_sheets_and_normalizes_crores():
    crore_rows = [
        ["Name of the Instrument", "ISIN", "Industry", "Quantity", "Market Value (Rs. in Crores)", "% to NAV"],
        ["Equity & Equity Related", "", "", "", "", ""],
        ["Infosys Ltd", "INE009A01021", "IT - Software", 2000, 1.50, 4.0],
    ]
    data = _xlsx_bytes({"Index": [["Scheme Code", "Scheme Name"], ["YB01", "Fund A"]], "Fund A": crore_rows})
    sheets = parse_workbook(data)
    names = {s.sheet_name for s in sheets}
    assert names == {"Fund A"}  # "Index" has no SEBI header row -- silently skipped, not an error
    fund_a = next(s for s in sheets if s.sheet_name == "Fund A")
    assert fund_a.error is None
    assert fund_a.holdings[0].market_value == Decimal("15000000.00")
    assert fund_a.holdings[0].asset_type == AssetType.EQUITY_DOMESTIC
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
    # Widened 2026-10-13 (Q9): "% to NAV" is the plan's original assumption, but Choice
    # and Aditya Birla Sun Life both label this column "% to AUM" (confirmed in the batch
    # spike docs) -- "aum" is added as a third alternative alongside "asset"/"nav".
    "pct_to_nav": re.compile(r"%\s*(to|of)?\s*(net\s*)?(asset|nav|aum)", re.I),
}
_REQUIRED_FIELDS = ("instrument_name", "market_value", "pct_to_nav")
# "total" alone (substring match, not exact) catches "Total", "Grand Total", AND
# "Sub Total" in one check -- the original exact-match tuple missed "Sub Total" rows,
# which carry real numbers and were silently ingested as holdings, double-counting that
# section's weight (Q9).
_TERMINATOR_NAMES = ("net assets",)


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


def _is_terminator(name: str) -> bool:
    lowered = name.lower()
    return "total" in lowered or lowered in _TERMINATOR_NAMES


def _to_decimal(cell) -> Decimal | None:
    if cell is None or cell == "":
        return None
    try:
        # Strip a trailing "%" (Q9): a percent value occasionally arrives as text,
        # e.g. "2.50%" -- without this strip, Decimal(...) raises InvalidOperation,
        # _to_decimal silently returns None, and the row is dropped as if it were a
        # subtotal/header row, losing a real holding.
        return Decimal(str(cell).replace(",", "").replace("%", "").strip())
    except InvalidOperation:
        return None


# Section-header text that precedes a block of holdings under SEBI's standard monthly
# portfolio disclosure categories (Q8/Q13). A sheet's section headers are themselves rows
# with no market value/pct, so they never become ParsedHolding rows directly -- they only
# update which asset_type subsequent holding rows are stamped with. Order matters: more
# specific patterns (international, derivatives) are checked before the generic "equity"
# fallback they'd otherwise also match.
_SECTION_PATTERNS: list[tuple[AssetType, re.Pattern]] = [
    (AssetType.DERIVATIVE, re.compile(r"future|option|derivative", re.I)),
    (AssetType.EQUITY_INTERNATIONAL, re.compile(r"overseas|foreign|international", re.I)),
    (AssetType.EQUITY_DOMESTIC, re.compile(r"equity", re.I)),
    (AssetType.DEBT, re.compile(r"debt instrument|corporate debt|government securities|g-sec", re.I)),
    (AssetType.CASH_EQUIVALENT, re.compile(r"money market|cash|net current assets|treps|tri-?party", re.I)),
    (AssetType.GOLD_SILVER, re.compile(r"gold|silver", re.I)),
    (AssetType.REIT_INVIT, re.compile(r"reit|invit", re.I)),
]


def _section_asset_type(name: str, current: AssetType) -> AssetType:
    """A section-header row's AssetType, or `current` unchanged if `name` doesn't match
    any known section pattern (e.g. a blank spacer row) -- never resets to OTHER on a
    row that just isn't a recognized header, only on a genuinely unrecognized header."""
    for asset_type, pattern in _SECTION_PATTERNS:
        if pattern.search(name):
            return asset_type
    return current


@dataclass(frozen=True)
class ParsedHolding:
    instrument_name: str
    isin: str | None
    sector_raw: str | None
    asset_type: AssetType
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
    by a fixed row count. A row with an instrument name but no market value/pct is either
    a section header (e.g. "Equity & Equity Related") or a blank subtotal row -- either
    way it updates `current_asset_type` (via `_section_asset_type`, a no-op when the text
    doesn't match any known header) and is skipped, never stored as a holding itself."""
    current_asset_type = AssetType.OTHER
    holdings: list[ParsedHolding] = []
    for row in rows:
        name = _cell(row, columns, "instrument_name")
        if name is None:
            break
        if _is_terminator(name):
            break
        market_value = _to_decimal(row[columns["market_value"]]) if columns["market_value"] < len(row) else None
        pct = _to_decimal(row[columns["pct_to_nav"]]) if columns["pct_to_nav"] < len(row) else None
        if market_value is None or pct is None:
            current_asset_type = _section_asset_type(name, current_asset_type)
            continue  # a section-header/subtotal row, not a real holding
        holdings.append(ParsedHolding(
            instrument_name=name,
            isin=_cell(row, columns, "isin"),
            sector_raw=_cell(row, columns, "sector_raw"),
            asset_type=current_asset_type,
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
Expected: PASS (11 tests).

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
Expected: PASS (12 tests).

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

**Decided 2026-10-13 (resolves engine.html Q10 — one holdings copy per plan variant, and
how long to keep history — see `decisions.md`):** option B. One `scheme_holdings` copy
per plan variant as already planned (the consumer reads by the exact scheme a client
holds, so collapsing variants into a shared row would push de-duplication work onto
every reader for a write-side convenience). Keep the latest 3 months' batches per scheme
plus each cadence period's last disclosure (so Taurus/Monarch's Half-Yearly/Fortnightly
batches, see Task 5's registry notes, are never pruned as "stale monthly"); prune
everything older in Task 9's daily job. Option C (one copy per fund family) is rejected
for now — it needs a family-key concept that doesn't exist yet, for a storage saving
(5-7M rows/year, by estimate) Postgres already handles comfortably; revisit only if a
measured row count, not the estimate above, actually threatens query latency.

**Decided 2026-10-13 (resolves engine.html Q11 — keep the original downloaded files? —
see `decisions.md`):** option C. Only files whose batch ends up `FAILED` (either the
parser raised, or Q9's post-Write sum check above falls outside 90-101%) are archived,
to a new private S3 bucket with a 12-month lifecycle rule (Task 10's Terraform; distinct
from the existing CAS-file bucket, which carries a PAN-retention lifecycle that doesn't
fit this data). Every other batch leaves `raw_file_reference` NULL — re-fetching a
`WRITTEN` batch's source, if ever needed, means re-running Locate against the AMC's
page or the Wayback CDX index (Task 7), not reading an archive. This keeps the archive
to the handful of files a human actually needs to debug, instead of a standing mirror
of every AMC's output every month.

**Decided 2026-10-13 (resolves engine.html Q9's deepened fix — the post-Write sum check):**
after building a batch's holdings, this stage sums every holding's `pct_to_nav`
(across all `asset_type` values — the disclosure itself declares its *entire* portfolio,
so the raw total must land near 100% regardless of how the consumer attributes later
filter by `asset_type`) and marks the batch `FAILED` instead of `WRITTEN` when that total
falls outside 90–101%. This is deliberately a wide band, not a tight one: it exists to
catch a header/terminator mismatch this plan's fixture set didn't happen to cover (e.g.
a still-unknown header spelling silently dropping an entire section), not to flag normal
day-to-day variation (a fund sitting on more cash than usual, rounding across many
small holdings). A `FAILED` batch is surfaced the same way any other `FAILED` batch is —
see Task 6/9's alerting — rather than silently written with a wrong total.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/services/analytics/test_portfolio_disclosure_writer.py
import uuid
from datetime import date
from decimal import Decimal

from app.models.enums import AssetType, DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding
from app.services.analytics.amfi_factsheet_client import build_families
from app.services.analytics.portfolio_disclosure_parsing import ParsedHolding
from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch

_HOLDINGS = [
    ParsedHolding(
        instrument_name="HDFC Bank Ltd", isin="INE040A01034", sector_raw="Banks",
        asset_type=AssetType.EQUITY_DOMESTIC, quantity=Decimal("1000.0000"),
        market_value=Decimal("1500000.00"), pct_to_nav=Decimal("62.500"),
    ),
    ParsedHolding(
        instrument_name="Net Receivables/Payables", isin=None, sector_raw=None,
        asset_type=AssetType.CASH_EQUIVALENT, quantity=None,
        market_value=Decimal("900000.00"), pct_to_nav=Decimal("35.500"),
    ),
]  # sums to 98.0% -- within the 90-101% plausibility band


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
        "https://example.test/file.xls", _HOLDINGS, "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    assert written == 2
    batches = db_session.query(DisclosureBatch).filter_by(as_of_date=date(2026, 8, 31)).all()
    assert len(batches) == 2
    assert all(b.status == DisclosureBatchStatus.WRITTEN for b in batches)
    for batch in batches:
        holdings = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).all()
        assert len(holdings) == 2
        assert holdings[0].instrument_name == "HDFC Bank Ltd"
        assert holdings[0].asset_type == AssetType.EQUITY_DOMESTIC


def test_rerun_replaces_holdings_not_duplicates(db_session):
    family = _family(db_session, n_plans=1)
    write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file.xls", _HOLDINGS, "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    new_holdings = [ParsedHolding(
        instrument_name="Reliance Industries Ltd", isin="INE002A01018", sector_raw="Petroleum Products",
        asset_type=AssetType.EQUITY_DOMESTIC, quantity=Decimal("500.0000"),
        market_value=Decimal("2000000.00"), pct_to_nav=Decimal("97.300"),
    )]
    write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file-v2.xls", new_holdings, "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    batch = db_session.query(DisclosureBatch).filter_by(as_of_date=date(2026, 8, 31)).one()
    holdings = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).all()
    assert len(holdings) == 1
    assert holdings[0].instrument_name == "Reliance Industries Ltd"
    assert batch.source_url == "https://example.test/file-v2.xls"
    assert batch.status == DisclosureBatchStatus.WRITTEN


def test_marks_batch_failed_when_disclosed_weight_sum_is_implausible(db_session):
    family = _family(db_session, n_plans=1)
    low_sum_holding = [ParsedHolding(
        instrument_name="HDFC Bank Ltd", isin="INE040A01034", sector_raw="Banks",
        asset_type=AssetType.EQUITY_DOMESTIC, quantity=Decimal("1000.0000"),
        market_value=Decimal("1500000.00"), pct_to_nav=Decimal("2.500"),
    )]  # a lone 2.5% holding -- the kind of total a missed header/terminator would produce
    write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file.xls", low_sum_holding, "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    batch = db_session.query(DisclosureBatch).filter_by(as_of_date=date(2026, 8, 31)).one()
    assert batch.status == DisclosureBatchStatus.FAILED
    # the holdings are still written -- FAILED flags the batch for review, it doesn't
    # hide the data that was actually parsed.
    assert db_session.query(SchemeHolding).filter_by(batch_id=batch.id).count() == 1
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

# Deliberately wide (Q9's deepened fix): exists to catch a header/terminator mismatch
# the fixture set didn't cover (an entire section silently dropped), not to flag normal
# day-to-day variation in a fund's actual disclosed total.
_SUM_CHECK_MIN = Decimal("90")
_SUM_CHECK_MAX = Decimal("101")


def write_disclosure_batch(
    db: Session, family: FundFamily, as_of_date: date, amc_name: str, source_url: str,
    holdings: list[ParsedHolding], match_method: str, match_confidence: Decimal,
    parse_errors: list[dict] | None = None,
) -> int:
    """Writes to every plan/option row of the matched family -- holdings are identical
    across a fund's plan variants, the same precedent as attribute 04's
    `upsert_scheme_fund_managers`. Returns the number of scheme batches written."""
    total_pct = sum((h.pct_to_nav for h in holdings), Decimal("0"))
    status = (
        DisclosureBatchStatus.WRITTEN
        if _SUM_CHECK_MIN <= total_pct <= _SUM_CHECK_MAX
        else DisclosureBatchStatus.FAILED
    )
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
        batch.status = status
        batch.written_at = datetime.now(timezone.utc)
        for holding in holdings:
            db.add(SchemeHolding(
                id=uuid.uuid4(), batch_id=batch.id, instrument_name=holding.instrument_name,
                isin=holding.isin, sector_raw=holding.sector_raw, asset_type=holding.asset_type,
                quantity=holding.quantity, market_value=holding.market_value, pct_to_nav=holding.pct_to_nav,
            ))
        written += 1
    db.flush()
    return written
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_writer.py -v`
Expected: PASS (3 tests).

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


def test_every_registry_key_follows_the_amc_name_convention():
    # F4b, part 1: `refresh_portfolio_disclosures` filters `Scheme` by exact string match
    # on `amc_name`, which the scheme master always populates as "<X> Mutual Fund" (AMFI's
    # own convention) -- never an informal name like "Union Asset Management" (the
    # spike's own prose for Union MF, confirmed not what scheme master stores). A
    # one-off fixture snapshotting every live scheme-master name would drift out of sync
    # with the real table the moment a new AMC launches; this check instead enforces the
    # *convention* itself, which catches the exact bug class this plan has already hit
    # once (Union) for free, forever, with no fixture to maintain. Before Task 6 ships,
    # cross-check this list once against `SELECT DISTINCT amc_name FROM schemes` live --
    # that one-time manual check (not an automated test) is what actually catches a
    # convention-following key that's still spelled subtly wrong (the ongoing automated
    # backstop is the runtime zero_schemes_matched alert in Task 6, which fires forever).
    for amc_name in AMC_DISCLOSURE_RESOLVERS:
        assert amc_name.endswith("Mutual Fund"), f"{amc_name!r} doesn't match scheme master's AMC-name convention"


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


def test_alphagrep_is_onboarded_with_the_two_digit_year_template():
    # Corrected 2026-10-13: the 2026-10-10 "soft-404" finding was a digit-format bug
    # (FY-{year}-{year+1}, e.g. FY-2026-2027) against the real two-digit-year path
    # (FY-{YY}-{YY+1}, e.g. FY-2026-27) -- not a dead endpoint. Re-onboarded.
    entry = AMC_DISCLOSURE_RESOLVERS["AlphaGrep Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.STATIC_REGEX
    assert entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE
    assert "FY-{yy}-{yy_plus_1}" in entry.url_template


def test_kotak_mahindra_is_onboarded_as_wayback_locate_with_the_monthly_path():
    # F4b: missing from the registry entirely until this pass, despite being resolved
    # (sixth pass, 2026-10-12) -- the original spike's filename guess had the wrong
    # path prefix/naming convention, which is why it 403'd even though the real file
    # was already live.
    # Decided 2026-10-13 (amc-coverage.html Q16): re-onboarded again as a direct
    # DETERMINISTIC_TEMPLATE fetch instead of WAYBACK_LOCATE -- the path is date-built,
    # not something that needs an archive lookup every month.
    entry = AMC_DISCLOSURE_RESOLVERS["Kotak Mahindra Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.STATIC_REGEX
    assert entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE
    assert entry.cdn_domain == "vatseelabs-s3.kotakmf.com"
    assert "Consolidated-SEBI-Portfolio-as-on" in entry.url_template


def test_navi_is_onboarded_as_json_api_with_the_documented_wordpress_endpoint():
    # The spike recorded this endpoint literally (not just a qualitative mechanism
    # description), and attribute 04's own resolver for the same domain
    # (fund_manager_resolvers.py) independently confirms the exact request shape
    # (POST with financial_year/month/category + a WP-NONCE scraped from the page).
    entry = AMC_DISCLOSURE_RESOLVERS["Navi Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.JSON_API
    assert entry.endpoint_url == "https://navi.com/wp-json/nv/v1/documents"


def test_jio_blackrock_is_onboarded_with_the_hypothesized_shared_endpoint():
    # Not independently literal in the spike -- this reuses attribute 04's exact,
    # production-confirmed endpoint and request shape for the same AMC/domain
    # (a Next.js RSC server action), on the documented hypothesis that the same
    # action with a different document-category argument serves portfolio
    # disclosures instead of factsheets. Flagged NEEDS LIVE VERIFICATION, not
    # treated as confirmed, until that one substitution is actually tried.
    entry = AMC_DISCLOSURE_RESOLVERS["Jio BlackRock Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.JSON_API
    assert "NEEDS LIVE VERIFICATION" in entry.note
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
(AlphaGrep was briefly removed from an earlier draft of this registry after a one-digit-
format bug made every slug guess 404 -- re-added once the real two-digit-year template
was found; see its entry below). Entries noted `NEEDS LIVE VERIFICATION` carry a specific,
sourced hypothesis (a sibling production endpoint for the same domain, or a literal
endpoint the spike recorded but didn't drive end-to-end) rather than a guess -- confirm
each with one real download before relying on it, same bar as every other entry. See this
plan's Scope note for the full list of what's deliberately excluded and why."""
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
    # JSON_API only -- mirrors attribute 04's ResolverEntry (fund_manager_resolvers.py)
    # exactly, reusing its proven shape rather than inventing a new one: a single GET,
    # a dotted path into the JSON response to reach the document list, and an optional
    # regex filter over that list's filenames/titles. Covers every JSON_API AMC below
    # except Axis and LIC, whose real mechanism is a two-call chain (token/filter-
    # options call, then the real document call) -- those two get a dedicated Python
    # function in Task 6, the same pattern WAYBACK_LOCATE already uses, not a new field
    # here, since generalizing a chain-of-calls shape for two AMCs isn't worth it.
    endpoint_url: str | None = None
    response_json_path: str | None = None
    documents: tuple[str, ...] | None = None
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
        # Decided 2026-10-13 (resolves amc-coverage.html Q16's bug-shaped gap): without a
        # link_pattern, the open-ended prefix CDX search downloads every capture under
        # this path (up to 50), unrelated files included. Confirmed real per-scheme shape
        # from the spike's own capture: "SC--Canara-Robeco-Small-Cap-Fund-...-2026.xlsx" --
        # also resolves the spec-vs-plan conflict: this is a plain per-scheme workbook,
        # not an index-sheet bundle; the engine spec's listing of Canara as an index-sheet
        # AMC alongside Baroda/Bank of India/Abakkus/Sundaram/ICICI Prudential is corrected.
        link_pattern=r"Canara-Robeco-.*-Fund",
        note="Main site's own 'Portfolio Disclosure' nav drives a genuinely encrypted "
             "request/response API (not attempted -- see the project's constraint "
             "against cracking it); the files themselves sit on the same domain's plain "
             "WordPress media library with no live listing page, discoverable only via "
             "a CDX search for this URL prefix.",
    ),
    # 2026-10-12 (sixth pass): resolved. The spike's original filename guess had the
    # wrong path prefix and naming convention (Monthly-Portfolio-as-on-...), which is
    # why it 403'd even though the real file was already live by then.
    # Decided 2026-10-13 (resolves amc-coverage.html Q16, option B/C -- see decisions.md):
    # the real path is date-built, not something only Wayback can find -- fetch it
    # directly every month like AlphaGrep below, same DETERMINISTIC_TEMPLATE shape.
    # Wayback is kept only as Task 7's fallback for the rare month this CDN path changes
    # again, not the normal path -- removes an avoidable failure point and the ~1-day
    # capture lag the Wayback-only approach carried.
    "Kotak Mahindra Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.DETERMINISTIC_TEMPLATE,
        cdn_domain="vatseelabs-s3.kotakmf.com",
        url_template=(
            "https://vatseelabs-s3.kotakmf.com/FAD/Portfolios/"
            "Consolidated-SEBI-Portfolio-as-on-{month_name}-{dd},-{yyyy}/"
            "ConsolidatedSEBIPortfolio{month_name}{yyyy}.xlsx"
        ),
        note="Direct date-built path, confirmed live via sixth-pass Wayback CDX query "
             "then direct-download SEBI-schema verification. Main domain's downloads "
             "page lists no direct file link, so there's no landing_url to scrape -- "
             "the template is the only mechanism. Monthly, not the differently-named "
             "Fortnightly file found in an earlier pass. No automatic Wayback fallback is "
             "built -- that would need a second mechanism per entry, which nothing else "
             "in this registry has either. If the CDN path changes again the template "
             "404s, Q12's day-10/day-20 alert catches it like any other AMC, and the fix "
             "is a one-off repeat of the sixth pass's Wayback CDX re-discovery, not a "
             "standing code path.",
    ),

    # -- DETERMINISTIC_TEMPLATE (F4a): resolved 2026-10-12 (sixth pass) -- this was a
    # one-digit-format bug, not a dead endpoint. The spike's original template used a
    # four-digit year range (FY-2026-2027); the real path uses a two-digit range.
    "AlphaGrep Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.DETERMINISTIC_TEMPLATE,
        url_template=(
            "https://alphagrepmf.ai/assets/documents/{scheme_name}/monthly/"
            "FY-{yy}-{yy_plus_1}/{month_name}_{yyyy}.xls"
        ),
        note="Confirmed via live download with the corrected two-digit template: "
             "genuine SEBI-schema data (ISIN, Industry, Quantity, Market value, %NAV).",
    ),

    # -- JSON_API, confirmed via the spike's own "second audit pass" (2026-10-09): a
    # real file was downloaded and opened for every entry below, with genuine SEBI-
    # schema columns, not just a page-shaped URL. That pass recorded the *mechanism*
    # (which UI interaction/call reveals the file) but, for most of these, not the
    # exact literal request -- so each still carries one bounded "capture the literal
    # call, confirm with a download" step before Task 6 relies on it in production.
    # Attribute 04's sibling resolver for the same domain (fund_manager_resolvers.py)
    # is cited as corroboration where its endpoint shape plausibly extends to the
    # disclosure document type, not as the primary source -- the spike's own
    # downloaded-and-opened finding is.
    "Tata Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        note="Spike (batch C): 'Browser interaction/network data supplies the 2026 "
             "monthly workbook link' from tatamutualfund.com/schemes-related/"
             "portfolio; downloaded and opened, correct SEBI columns. Corroborated by "
             "attribute 04's sibling CMS endpoint for this domain "
             "(prod-dist-api.tatamfdev.com/cms-data/api/CMSDATA_corporate_factsheets) "
             "-- a sibling content-type slug (e.g. CMSDATA_corporate_portfolio_"
             "disclosures) is the likely literal call. NEEDS LIVE VERIFICATION: one "
             "Network-tab capture confirms the exact slug.",
    ),
    "Sundaram Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        note="Spike (second audit pass): a category select + 'View' button reveals a "
             "single Index-sheet workbook covering 31 schemes; downloaded and opened. "
             "Corroborated by attribute 04's sibling legacy .ashx archive API for this "
             "domain (Fundwise_Factsheet module) -- the disclosure section likely "
             "calls the same handler with a different Modules_Forms_Downloads_* "
             "module argument. NEEDS LIVE VERIFICATION: one capture of the real call.",
    ),
    "Choice Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        note="Spike (batch C): 'the rendered page/API supplies year, month, and "
             "scheme records'; a downloaded scheme workbook uses SEBI headings "
             "('% to AUM' is Choice's label for %-to-NAV -- already handled by the "
             "widened Task 2 regex). Open question the spike itself flags: this "
             "appears genuinely scheme-by-scheme, not one umbrella workbook. "
             "Corroborated by attribute 04's generic document-listing API for this "
             "domain (choicemf.com/api/document-master-list, response_json_path "
             "'body') -- likely the same endpoint, filtered by a disclosure document-"
             "type value. NEEDS LIVE VERIFICATION: one capture of the real filter.",
    ),
    "UTI Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        note="Spike (batch C): 'Browser-driven selection/network data returns "
             "individual scheme workbook URLs' from utimf.com/downloads/scheme-wise-"
             "portfolio-disclosure; a downloaded workbook has the six required "
             "fields. No all-schemes bulk workbook observed -- scheme-by-scheme, like "
             "Choice. Corroborated by attribute 04's sibling endpoint for this domain "
             "(utimf.com/api/get-fact-sheet) -- a sibling path (e.g. get-scheme-wise-"
             "portfolio) is the likely literal call. NEEDS LIVE VERIFICATION.",
    ),
    "PGIM India Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        note="Spike (second audit pass): 'pgimindia.com's disclosure page has a "
             "clean, unauthenticated JSON REST API (resultStatus/pdfPath fields) "
             "with full history back to 2021' -- the original BOT_BLOCKED verdict was "
             "a sandbox-DNS artifact, not a real block. Recorded qualitatively, not "
             "as a literal URL. Attribute 04's sibling resolver for this domain uses "
             "a different endpoint shape (/api/v1/brochure/published/form) for "
             "factsheets, so it is not a direct reuse candidate. NEEDS LIVE "
             "VERIFICATION: one Network-tab capture on the disclosure page recovers "
             "the literal endpoint -- not fresh research, the mechanism and its "
             "non-bot-blocked nature are already confirmed by a real download.",
    ),
    # -- JSON_API, confirmed literal endpoint (the spike's "second audit pass" itself
    # recorded the literal call for Navi, not just a UI description).
    "Navi Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        landing_url="https://navi.com/mutual-fund/downloads/portfolio",
        endpoint_url="https://navi.com/wp-json/nv/v1/documents",
        note="Spike (second audit pass): 'Selects were hidden inside an unopened "
             "accordion; once opened, a WordPress REST endpoint (/wp-json/nv/v1/"
             "documents) returns the file URL' -- downloaded and opened, correct "
             "SEBI columns. Attribute 04's resolver for this same domain confirms the "
             "identical two-step GET-nonce-then-POST request shape (anonymous, no "
             "login). Only the exact `category` value for portfolio disclosures (vs. "
             "attribute 04's factsheet category) needs one live confirmation.",
    ),
    # -- JSON_API, confirmed via second audit pass -- real backend proxy, not an
    # auth-gated API. Corrects an earlier draft of this registry, which classified
    # Bandhan MANUAL on the strength of attribute 04's *factsheet* resolver (a
    # different document type on this domain) returning HTTP 401. The spike's own
    # investigation of the *disclosure* document type found and downloaded a real
    # file through a different, unauthenticated mechanism -- the directly relevant
    # evidence, and it supersedes the sibling inference.
    "Bandhan Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        note="Spike (second audit pass): 'Client-side button navigation to a "
             "/portfolio-summary/monthly route, then a backend download-proxy that "
             "signs an underlying GCS URL' -- downloaded and opened, correct SEBI "
             "columns. The signing proxy issues a public, time-limited GCS URL to "
             "any caller (no login observed), unlike the unrelated factsheet API on "
             "this domain. NEEDS LIVE VERIFICATION: one capture of the proxy's "
             "request/response shape.",
    ),
    # -- STATIC_REGEX, confirmed mechanism, literal link pattern still needs capture.
    # Corrects an earlier draft of this registry, which guessed a Next.js RSC server
    # action (attribute 04's factsheet mechanism for this domain) without checking it
    # against the spike's own, more specific finding for the disclosure page.
    "Jio BlackRock Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        note="Spike (second audit pass): 'An Ant Design combobox (blocked by a "
             "sticky-nav click interception, fixed with force=True) reveals direct "
             "Azure CDN file links per scheme' -- downloaded and opened, correct SEBI "
             "columns. The combobox is a discovery mechanism, not an API the "
             "production fetcher calls -- the real file is a direct static CDN link "
             "once its naming convention is known, the same shape as Kotak/HDFC "
             "(discover once, fetch as a plain static asset forever after). NEEDS "
             "LIVE VERIFICATION: one Network-tab capture of the CDN link pattern "
             "(scheme-name/date substitution, most likely, matching every other "
             "DETERMINISTIC_TEMPLATE/STATIC_REGEX AMC in this registry).",
    ),

    # -- STATIC_REGEX, confirmed via the spike's own second audit pass (real file
    # downloaded and opened for each), link pattern itself not yet captured.
    # Attribute 04's sibling resolver for the same domain is cited as corroboration
    # that the site needs no JS execution at all, not as the primary source.
    "Unifi Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        landing_url="https://unifimf.com/statutorydocuments/",
        note="Spike (second audit pass): 'the first pass's \"Scheme Dashboard\" hits "
             "were genuinely the wrong document type; a deeper pass found the real "
             "per-scheme Monthly Portfolio Statement file' -- downloaded and opened, "
             "correct SEBI columns. Corroborated by attribute 04: unifimf.com serves "
             "plain static factsheet links with no bot protection, consistent with "
             "the Bank of India/Angel One/Wealth Company pattern (a static regex too "
             "narrow, not a JS SPA). NEEDS LIVE VERIFICATION: confirm the real "
             "link_pattern.",
    ),
    "Zerodha Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        landing_url="https://www.zerodhafundhouse.com/resources/disclosures/",
        note="Spike (second audit pass): 'a real September 2026 monthly file exists "
             "but isn't in the static HTML -- only reachable via the rendered page' "
             "-- downloaded and opened, correct SEBI columns. Corroborated by "
             "attribute 04: zerodhafundhouse.com serves plain static factsheet links "
             "with no bot protection -- the file is very likely a sibling static "
             "link on the same page, not JS-gated content. NEEDS LIVE VERIFICATION.",
    ),
    "Abakkus Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url="https://www.abakkusmf.com/statutory-disclosures.html",
        note="Spike (second audit pass): cascading #mpdYear/#mpdMonth selects reveal "
             "'a single-workbook-many-schemes file (Index sheet + 4 per-scheme "
             "sheets)' -- downloaded and opened, correct SEBI columns. Corroborated "
             "by attribute 04: abakkusmf.com serves plain static factsheet links "
             "with no bot protection -- the selects very likely populate a "
             "predictable static URL (same pattern as Union's DETERMINISTIC_"
             "TEMPLATE). NEEDS LIVE VERIFICATION: confirm the real filename pattern.",
    ),
    "quant Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        landing_url="https://quantmutual.com/downloads/factsheet",
        note="Spike (second audit pass): 'A nested <li onclick=\"submit_event1/2(...)"
             "\"> widget... drives an AJAX call that populates a #files div with the "
             "real link' -- downloaded and opened, correct SEBI columns (AMFI's "
             "registered name is 'quant Money Managers Limited'; schemes.amc_name is "
             "'quant Mutual Fund', matching fund_manager_resolvers.py's key exactly). "
             "Corroborated by attribute 04: quantmutual.com serves plain static "
             "factsheet links with no bot protection -- the #files AJAX call very "
             "likely resolves to a static link. NEEDS LIVE VERIFICATION.",
    ),
    "Bajaj Finserv Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url="https://www.bajajamc.com/downloads?statutory-disclosures=",
        note="Spike (second audit pass): 'A 63-<select> page; the \"Monthly "
             "Portfolio\" sub-section's year/month selects (cascading) reveal a "
             "direct link, a single workbook covering all 25 schemes' -- downloaded "
             "and opened, correct SEBI columns. Corroborated by attribute 04: both "
             "bajajamc.com/downloads?factsheet= and this sibling ?statutory-"
             "disclosures= query return HTTP 200 on this WordPress site (no bot "
             "block) -- its own admin-ajax factsheet actions returned empty results "
             "in that check, so the disclosure section's equivalent ajax action name/"
             "params need one live capture. NEEDS LIVE VERIFICATION.",
    ),
    "ICICI Prudential Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.ZIP_OF_WORKBOOKS,
        landing_url="https://www.icicipruamc.com/media-center/downloads?currentTabFilter=OtherSchemeDisclosures&subCatTabFilter=Monthly+Portfolio+Disclosures",
        note="Already more confirmed than the entries above -- the spike itself "
             "downloaded and opened the real 151-scheme ZIP from this exact page (the "
             "AMC's primary disclosure path, archive.icicipruamc.com, is a dead "
             "NXDOMAIN, not a block; this media-center page is the real one, found "
             "via WebSearch). Attribute 04's factsheet resolver is MANUAL for a "
             "*different* bot-protected page -- doesn't apply here. Only the literal "
             "'DOWNLOAD' button's href/request needs one capture; first AMC onboarded "
             "against Task 2's extract_zip_members.",
    ),

    # -- STATIC_REGEX, remainder of the plain-static-link tier -- link patterns taken
    # directly from the spike's batch A/B/C findings (each AMC's workbook link was
    # already present in the page's own static HTML, no interaction needed).
    "DSP Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.ZIP_OF_WORKBOOKS,
        landing_url="https://www.dspim.com/mandatory-disclosures/portfolio-disclosures?origin=app",
        link_pattern=r"dsp-monthend-portfolio-as-on",
        exclude_pattern=r"fortnightly",
        note="Batch A: plain HTML exposes a dated ZIP of XLSX workbooks directly; "
             "the consolidated monthly archive is distinct from a same-page "
             "fortnightly debt archive -- exclude_pattern scopes to the right one.",
    ),
    "Motilal Oswal Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url="https://www.motilaloswalmf.com/mutual-funds/motilal-oswal-digital-india-fund",
        link_pattern=r"Month_End_Portfolio_.*\.xlsx",
        note="Batch A: fund-page HTML embeds the portfolioUrl directly -- genuinely "
             "scheme-wise, so the per-scheme fund page is the landing_url, not a "
             "single AMC-wide hub. NEEDS LIVE VERIFICATION: confirm every live "
             "scheme has a reachable fund page, since Task 6's refresh loop drives "
             "landing_url per AMC, not per scheme.",
    ),
    "NJ Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url="https://downloads.njmutualfund.com/njmf_download.php?nme=127",
        link_pattern=r"viewfile\.php\?file=.*\.xlsx",
        note="Batch A: plain HTML exposes direct viewfile.php?file=...xlsx links, "
             "one file per scheme. Confirmed with NJ Flexi Cap, August 2026.",
    ),
    "Franklin Templeton Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url="https://www.franklintempletonindia.com/fund-details/fund-overview/42352/reports/investor-services/funds-and-solutions/investor/about-us",
        link_pattern=r"Monthly\s*Portfolio",
        note="Batch A: server-rendered fund report page lists current Monthly "
             "Portfolio Disclosure dates. Scheme-wise, not an AMC umbrella file -- "
             "same per-scheme-page caveat as Motilal Oswal above. Key corrected to drop "
             "a '(India)' suffix not used by the real scheme master -- confirmed "
             "against backend/.cache/amfi_navall/nav_all.txt's plain "
             "'Franklin Templeton Mutual Fund' entries (F4b's own naming-convention "
             "test below would have caught this).",
    ),
    "Quantum Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url="https://www.quantumamc.com/portfolio/combined/-1/1/0/0",
        link_pattern=r"/FileCDN/FactSheet/.*\.xlsx",
        note="Batch B: plain HTML exposes direct 'All Funds' combined workbooks "
             "through September 2026, served from /FileCDN/FactSheet/<uuid>.xlsx -- "
             "the combined workbook avoids per-scheme fetching, same shape as "
             "Nippon/Shriram/PPFAS/Groww.",
    ),
    "Samco Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url="https://www.samcomf.com/StatutoryDisclosure",
        link_pattern=r"IN_MF_MONTHLY_PORTFOLIO_",
        note="Batch B: server-rendered inventory lists separate monthly portfolio "
             "files per scheme, titled IN_MF_MONTHLY_PORTFOLIO_<Month>_<Year>_"
             "<Scheme> -- ingestion enumerates schemes from the one landing page.",
    ),
    "360 ONE Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url="https://www.360.one/asset/mutual-funds/downloads/",
        note="Batch C, domain corrected fifth pass 2026-10-12: the originally-cited "
             "archive.iiflmf.com is now dead (origin timeout); the real current "
             "domain is a Next.js app whose initial server response embeds the file "
             "catalog as React Server Component 'flight' JSON -- still no Playwright "
             "needed, but the link isn't a plain <a href> regex match. NEEDS LIVE "
             "VERIFICATION: confirm Task 6's static-HTML regex finds the file inside "
             "the RSC flight payload, or whether this needs a small parse step.",
    ),
    "Wealth Company Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url="https://www.wealthcompanyamc.in/literature-forms/portfolio-documents/monthly/",
        link_pattern=r"/uploads/Monthly_Portfolio_",
        note="Second audit pass: 'A full grid of 97 downloadable files is server-"
             "rendered on page load (Next.js); the per-file URL is a stable static "
             "asset, just implemented as a MUI <button> instead of <a href>' -- "
             "downloaded and opened, correct SEBI columns. A static-HTML regex scan "
             "(not requiring <a href>) finds it, same as Task 6's existing approach.",
    ),

    # 2026-10-13: resolved per the user's explicit instruction that no AMC is left to
    # a later wave. The spike's recorded filename pattern had visibly drifted by the
    # time this plan was written (Monthly_Portfolio_<Month>_<Year>.xlsx vs. the real
    # current IR_Old_Bridge_Mutual_Fund_<DDMMYYYY>_<hash>.xlsx mixed with per-scheme
    # Old_Bridge_<Scheme>_<Month>_<Year>_<hash>.xlsx files) -- genuinely two candidate
    # files some months, not a research gap. Disambiguation rule, not a deferral:
    # Task 6's static-HTML scan already collects every candidate link; for this AMC
    # only, prefer the per-scheme-named file over the AMC-wide "IR_" file when both
    # match the current month (the per-scheme file's holdings are more directly
    # verifiable against scheme name than the "IR_" prefix, whose content is
    # unconfirmed) -- and alert, not silently pick, if a month ever has neither.
    "Old Bridge Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url="https://www.oldbridgemf.com/statutory-disclosures.html",
        link_pattern=r"Old_Bridge_.*_\d{4}_[0-9a-f]+\.xlsx",
        exclude_pattern=r"^IR_",
        note="Prefers the per-scheme-named file over the ambiguous AMC-wide 'IR_' "
             "file (see comment above); NEEDS LIVE VERIFICATION that the per-scheme "
             "file's columns are the real holdings disclosure, not a different "
             "document that happens to share the naming convention.",
    ),

    # -- STATIC_REGEX, multi-scheme bundle corrected per Q16: the engine spec's "needs
    # a custom index-sheet parse" label for this AMC was wrong -- the spike's second
    # audit pass found a single direct link in plain static HTML, the same generic
    # STATIC_REGEX path as every other SINGLE_WORKBOOK_MULTI_SHEET AMC, no custom
    # parse code needed.
    "Baroda BNP Paribas Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url="https://www.barodabnpparibasmf.in/archivedownload/",
        link_pattern=r"assets/download_documents/Portfolio_Holdings_and_Exposure",
        note="Second audit pass: 'The direct .xlsx link... is present in the page's "
             "own static HTML -- a plain grep on the curl-fetched page finds it; the "
             "first pass's Playwright trace had simply missed it.' Downloaded and "
             "opened, correct SEBI columns.",
    ),

    # -- JSON_API, confirmed literal endpoint via the fifth-pass reconciliation
    # (2026-10-12): every entry below was found stale/wrong in the spike's own
    # original recording, re-traced live with Playwright once, and the *real*
    # mechanism confirmed to be a plain, unauthenticated JSON/AJAX call -- replayable
    # forever via curl/httpx, no browser needed in production. Each was downloaded
    # and opened to verify genuine SEBI-schema columns.
    "SBI Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        endpoint_url="https://www.sbimf.com/ajaxcall/CMS/GetSchemePortfolioSheetsQS",
        note="Fifth pass: the originally-cited '/portfolios?FundID=34&Portfoliotype="
             "Monthly' URL is stale; the real mechanism is this plain JSON POST, "
             "replayable via curl. Resolved, no Playwright needed in production.",
    ),
    "Bank of India Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        endpoint_url="https://www.bankofindiamf.com/AjaxService.asmx/GetDocuments",
        note="Fifth pass: the second-audit-pass's cited stable curlable URL went "
             "stale again; the real mechanism is this plain JSON/SOAP-lite endpoint, "
             "replayable via curl. The workbook is a single file with an Index "
             "sheet mapping scheme codes YB01-YB44 to names plus one sheet per "
             "scheme -- the same generic multi-sheet parse already built for Nippon/"
             "Shriram/PPFAS/Groww, no custom per-AMC parse code needed (corrects "
             "amc-coverage.html's Q14 framing, which assumed a bespoke index-sheet "
             "parser was required).",
    ),
    "Trust Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        endpoint_url="https://www.trustmf.com/api/api/Trust/GetData",
        note="Fifth pass: a Playwright network trace of the Vite/React SPA found "
             "this plain JSON POST (no auth, no JS execution needed to call) "
             "returns the current month's workbook URL directly. Resolved, no "
             "Playwright needed in production.",
    ),
    "Mirae Asset Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        endpoint_url="https://www.miraeassetmf.co.in/downloads/portfolio",
        note="Fifth pass: the originally-cited page and guessed filenames were "
             "soft-404 traps (HTTP 200, HTML error page under a .xlsx extension); "
             "the real mechanism is this page's AjaxService/GetDownloadsData JSON "
             "call. Resolved, no Playwright needed in production. IMPORTANT for "
             "Task 6: status-200 is not sufficient to confirm a real file for this "
             "AMC's CMS -- content-type/magic-byte checks are mandatory.",
    ),
    "LIC Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        endpoint_url="https://www.licmf.com/downloads/portfolio-filter-options",
        note="Fifth pass: the originally-cited deterministic URL pattern is stale "
             "(site redesign); the real mechanism is a two-step JSON POST chain -- "
             "/downloads/portfolio-filter-options (discover available year/month) "
             "then /downloads/portfolio-files (fetch the file URL for the selected "
             "year/month). Genuine two-call chain, not a single endpoint_url -- "
             "Task 6 needs a dedicated function for this AMC and Axis below, the "
             "same pattern WAYBACK_LOCATE already uses, not a new registry field for "
             "two AMCs.",
    ),
    "Axis Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        endpoint_url="https://www.axismf.com/cms/token",
        note="Fifth pass: the originally-cited static path is stale (site "
             "redesign); the real mechanism, found via a Playwright trace of the "
             "'Portfolios' accordion, is POST /cms/token (public, unauthenticated, "
             "returns a bearer token with no login) then POST /cms/get-scheme-"
             "documents (body {sdType: yearMonthSchemeDocs, sdID: "
             "sdMonthSchemePortfolio, year, month, schemeCode: Consolidated}, using "
             "the bearer token) -- response's documentList gives direct file URLs. "
             "Entire chain replayed plain curl end-to-end in the fifth pass; "
             "AXIS500 sheet is a multi-scheme consolidated workbook. Same dedicated-"
             "function treatment as LIC above, not a new registry field.",
    ),
    "Aditya Birla Sun Life Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        endpoint_url="https://mutualfund.adityabirlacapital.com/postlogin/CustomApi/Resources/FactsheetAccordionById",
        note="Fifth pass: GET with id/ctype/month/year params (JSON, no auth) "
             "returns a pdfUrl field pointing at a dead CDN host "
             "(abcscprod.azureedge.net, confirmed NXDOMAIN) -- the fix is to "
             "substitute the live mutualfund.adityabirlacapital.com host onto that "
             "same /-/media/... path before refetching, not to trust the API "
             "response's URL verbatim. 105-sheet workbook (one sheet per scheme); "
             "genuine legacy .xls (BIFF/Composite Document Format) -- Task 2's "
             "parse must use xlrd for this AMC, openpyxl cannot open it (flag as a "
             "parse-stage exception, same as any other format-survey finding).",
    ),
    "Taurus Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        endpoint_url="https://www.taurusmutualfund.com/financials/portfolio",
        note="Fifth pass: the real mechanism is a Drupal exposed-filter AJAX POST, "
             "replayable as a plain GET with the filter's query-string params "
             "(field_hy_portfolio_year_target_id / field_hy_portfolio_month_"
             "target_id -- 'HY' for Half-Yearly). Confirmed genuinely Half-Yearly-"
             "only (March/September; no monthly file exists at all) -- a data-"
             "availability gap, not a fetch problem. disclosure_batches must accept "
             "a non-monthly cadence for this one AMC -- already true by construction, "
             "the (scheme_id, as_of_date) grain carries no monthly assumption, no "
             "schema change needed here; Taurus's separate "
             "/summary/<scheme>-fund files are fund metadata, not holdings, and must "
             "not be mistaken for a monthly substitute.",
    ),

    # -- Fortnightly-only AMC: not a gap, a genuine ceiling. Same cadence treatment
    # as Taurus above -- disclosure_batches must accept non-monthly for this AMC.
    "Monarch Networth Capital Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        landing_url="https://mf.monarchnetworth.com/statutory-disclosure/portfolio",
        note="Spike: Monarch genuinely only publishes a Fortnightly portfolio "
             "disclosure, no monthly file exists -- confirmed not a missing-"
             "mechanism problem, the AMC's real SEBI-mandated cadence for this "
             "scheme type. disclosure_batches accepts Fortnightly as a valid "
             "cadence for this AMC only, no schema change needed, the same "
             "treatment as Taurus.",
    ),

    # -- MANUAL: a person downloads the file monthly, the same AWAITING_MANUAL_UPLOAD
    # pattern attribute 04 already built (import_manual_fund_managers.py) -- built
    # now, as part of this plan, per Q15's resolution (not deferred to a later wave).
    "Edelweiss Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed BOT_BLOCKED across 4 passes -- Akamai (akamai-grn header); "
             "the real disclosure page was found via Wayback but it's a client-"
             "rendered SPA shell with no static links and no capturable API.",
    ),
    "Mahindra Manulife Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed across 4 passes -- the investorapi.mahindramanulife.com "
             "endpoint returns a genuinely AES-encrypted payload (directly observed, "
             "not inferred); real static files exist (/uploads/download/{uuid}.xlsx) "
             "but the UUID isn't discoverable without decrypting the API. Per the "
             "project's standing constraint against cracking encrypted vendor APIs.",
    ),
    "Invesco Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed BOT_BLOCKED, sixth pass: both curl and a real headless-"
             "Chromium Playwright navigation return HTTP 403 from a WAF (server: "
             "volt-adc) -- a genuine bot wall, not a missing-interaction problem. "
             "Per the project's standing constraint against evading bot detection.",
    ),
    "ITI Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed BOT_BLOCKED, fifth pass: a real headless-Chromium Playwright "
             "navigation gets a Cloudflare interactive-challenge page too, not just "
             "plain curl -- a genuine bot wall.",
    ),
    "JM Financial Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed false positive, fifth pass: the file this AMC's query "
             "'downloaded' decodes to 832KB of AES-ciphertext (exact 16-byte block "
             "multiple, chi-square ~235/uniform), not a real workbook -- joins "
             "Mahindra Manulife in the encrypted-API dead-end bucket.",
    ),
    "HSBC Mutual Fund": DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed fifth pass as the one AMC in the entire registry genuinely "
             "needing a real browser in production: plain curl gets HTTP 403 "
             "(Microsoft-Azure-Application-Gateway WAF), a real headless-Chromium "
             "Playwright navigation gets 200 with direct per-scheme .xlsx links "
             "under /portfolios/document-<DDMMYYYY>/. Per the 2026-10-12 decision "
             "not to add Playwright as a production dependency for one AMC -- "
             "handled as standing-manual-fetch instead.",
    ),

    # -- Genuinely still open: the one AMC in the entire registry whose mechanism is
    # not yet discovered at all (every other AMC above has either a working
    # mechanism or a confirmed hard blocker). Not a registry entry yet --
    # intentionally absent; research this one before Task 6 onboards it, same
    # bounded Pass-0 step as every other spike AMC.
    # "WhiteOak Capital Mutual Fund": genuinely NEEDS_INVESTIGATION, page confirmed
    # live at mf.whiteoakamc.com/regulatory-disclosures/scheme-portfolios.

    # -- NO_CONTENT_FOUND: 5 AMCs with no AMFI-listed live schemes expected to
    # publish holdings (ASK, IL&FS, Lakshya, Carnelian, Nuvama) need no registry row
    # at all -- an empty disclosure_batches month for these is the correct, expected
    # state, not a gap, same precedent as attribute 04's factsheet-less AMCs.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/services/analytics/test_portfolio_disclosure_resolvers.py -v`
Expected: PASS (9 tests) — including F4b's registry-naming-convention test added above.

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

**Decided 2026-10-13 (resolves engine.html Q12 — when does a missing AMC raise an
alert? — see `decisions.md`):** option C. An AMC alerts only after day 10 of the
month, again on day 20, once per AMC per run — not on every daily miss, which would
flood the ops topic with normal late-publisher noise (the plan as drafted alerted on
first miss). "Done" stops meaning "any scheme written" and starts meaning every scheme
in that AMC's matched file was written or explicitly skipped as non-holdings; a scheme
the Normalize-stage matcher can't match raises its own alert instead of the current
INFO-only log line, since an unmatched scheme is a silent coverage gap, not routine
noise. A monthly summary line lists every AMC with zero `WRITTEN` batches that period,
matching the spec's "not found by day N" wording and giving a month-end checklist
instead of requiring someone to reconstruct it from daily logs.

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
custom code rather than a declarative registry row.

F4d: every function in this module uses the synchronous `Session` (`db.query(...)`,
`db.flush()`) inside `async def`, committing through `commit_off_loop` -- correct ONLY
because `refresh_portfolio_disclosures` is called exclusively from the scheduled batch
job (Task 9), never from a request handler. Calling it from request-handling code would
block the single-worker event loop, the same bug class `commit_off_loop` itself was
built to fix elsewhere (2026-08-27, `bb5225f`). Do not call this module from an API
route."""
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
    # F4c: AMCs whose registry entry exists but whose Locate kind isn't built yet
    # (JSON_API's generic shape, the Axis/LIC chains -- Task 9) are counted here, not in
    # amcs_failed -- an AMC with no Locate code is an expected, known gap, not a run that
    # broke. Kept as its own field so dashboards/alerts can treat the two differently.
    amcs_not_onboarded: int = 0
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


def test_refresh_alerts_zero_schemes_matched_distinctly_from_no_file_found(db_session, _http, monkeypatch, caplog):
    # F4b: a registry key that doesn't exactly match scheme master's amc_name (e.g. the
    # spike's "Union Asset Management" vs. the real scheme-master "Union Mutual Fund")
    # must alert as "zero_schemes_matched", not the generic "no_file_found" -- the two
    # have different fixes (correct the registry key vs. wait for the AMC to publish).
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "A Misspelled AMC Name": DisclosureResolverEntry(
            kind=DisclosureResolverKind.STATIC_REGEX,
            landing_url="https://example.com/disclosures/",
            link_pattern=r"MONTHLY-PORTFOLIO",
        ),
    })
    # Deliberately no Scheme row with this amc_name.
    import asyncio
    import logging
    with caplog.at_level(logging.WARNING):
        result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_failed == 1
    assert "zero_schemes_matched" in caplog.text
    assert "no_file_found" not in caplog.text


def test_refresh_counts_unimplemented_locate_kind_as_not_onboarded_not_failed(db_session, _http, monkeypatch, caplog):
    # F4c: a JSON_API/MANUAL-adjacent entry with no Locate code yet must be a silent,
    # separately-counted skip (amcs_not_onboarded), not a NotImplementedError caught by
    # the generic except-Exception branch and alerted as "error" every single day.
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "Some JSON API AMC": DisclosureResolverEntry(
            kind=DisclosureResolverKind.JSON_API,
            endpoint_url="https://example.com/api/documents",
        ),
    })
    import asyncio
    import logging
    with caplog.at_level(logging.WARNING):
        result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_not_onboarded == 1
    assert result.amcs_failed == 0
    assert "PORTFOLIO_DISCLOSURE_ALERT" not in caplog.text
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
            # Added 2026-10-13 (amc-coverage.html Q16's Kotak fix surfaced this): the
            # function only ever supplied the four fields above, but two already-onboarded
            # templates reference fields it never passed -- AlphaGrep's {yy}/{yy_plus_1}
            # and (now) Kotak's {month_name}. str.format() ignores unused kwargs, so
            # adding these here is safe for every other entry's template.
            month_name=as_of.strftime("%B"),
            yy=f"{as_of.year % 100:02d}",
            yy_plus_1=f"{(as_of.year + 1) % 100:02d}",
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


# F4c: kinds this task actually implements a Locate for. JSON_API's generic single-call
# shape and the Axis/LIC two-step chains are deliberately NOT built in this task (Task 9
# below is where that happens) -- registering those registry entries ahead of their
# Locate code is correct (it's how every other AMC in this plan was onboarded too), but
# running them must not look like a *failure*. `_is_locate_implemented` lets the refresh
# loop tell "not built yet" apart from "built, and this run hit a real error" before ever
# calling `_locate_and_fetch`, instead of relying on `NotImplementedError` falling through
# into the same `except Exception` branch as a genuine fetch/parse bug.
def _is_locate_implemented(entry: DisclosureResolverEntry) -> bool:
    return (
        entry.kind is DisclosureResolverKind.WAYBACK_LOCATE
        or entry.kind is DisclosureResolverKind.STATIC_REGEX
        or entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE
    )


async def _locate_and_fetch(
    client: httpx.AsyncClient, entry: DisclosureResolverEntry, scheme_rows: list[Scheme],
) -> list[LocatedFile]:
    if entry.kind is DisclosureResolverKind.WAYBACK_LOCATE:
        return await _locate_wayback(client, entry)  # Task 7
    if entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE:
        names = [s.base_name or s.name for s in scheme_rows]
        return await _locate_deterministic_template(client, entry, names)
    if entry.kind is not DisclosureResolverKind.STATIC_REGEX:
        # Reached only if `_is_locate_implemented` and this function's own kind dispatch
        # ever disagree -- a genuine bug in this function, not an expected "not onboarded
        # yet" state (the refresh loop below already filters those out before calling in).
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
    amcs_processed = amcs_failed = amcs_not_onboarded = schemes_written = 0

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_HEADERS, follow_redirects=True) as http_client:
        for amc_name, entry in AMC_DISCLOSURE_RESOLVERS.items():
            if entry.kind is DisclosureResolverKind.MANUAL:
                continue
            # F4c: checked before the try block, not left to raise NotImplementedError
            # inside it -- a registry entry with no Locate code yet is a known, expected
            # gap (surfaced once per run in the end-of-run summary below), not a failure
            # worth an individual PORTFOLIO_DISCLOSURE_ALERT line every single day.
            if not _is_locate_implemented(entry):
                amcs_not_onboarded += 1
                continue
            try:
                # F4b: a registry key that doesn't exactly match scheme master's
                # amc_name values silently returns zero rows here -- Locate/Fetch/Parse
                # all still "succeed" on an empty scheme list, which would otherwise look
                # identical to "the AMC published nothing this month" (no_file_found)
                # rather than "the registry key is spelled wrong." Checked explicitly so
                # the alert reason says which one actually happened.
                scheme_rows = db.query(Scheme).filter(Scheme.amc_name == amc_name).all()
                if not scheme_rows:
                    _alert(amc_name, "zero_schemes_matched", "registry key has no scheme_master rows")
                    amcs_failed += 1
                    continue
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

    if amcs_not_onboarded:
        # F4c: one INFO line for the whole run, not one WARNING per AMC -- this is a
        # known, static gap (tracked against Task 9's JSON_API build-out), not something
        # that regressed today, so it must never look like a failure in the alert feed.
        logger.info(
            "refresh_portfolio_disclosures: %d registered AMC(s) skipped, Locate not yet built",
            amcs_not_onboarded,
        )

    return PortfolioDisclosureRefreshResult(
        success=True, amcs_processed=amcs_processed, amcs_failed=amcs_failed,
        amcs_not_onboarded=amcs_not_onboarded, schemes_written=schemes_written,
        seconds=round(time.perf_counter() - started, 1),
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
Expected: PASS (7 tests) — the original 5 plus F4b's and F4c's zero-schemes-alert and
not-onboarded-skip tests added above.

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

**Decided 2026-10-13 (resolves amc-coverage.html Q16 — Wayback dependence, and the Canara
Robeco spec-vs-plan conflict — see `decisions.md`):** option C, plus the conflict resolved
with evidence already in hand (not left as "I have not opened a Canara file myself"). The
spike's own confirmed capture URL —
`SC-–-Canara-Robeco-Small-Cap-Fund-–-August-2026.xlsx` — is a separate per-scheme workbook,
not a multi-scheme index-sheet bundle; the engine spec's listing of Canara alongside
Baroda/Bank of India/Abakkus/Sundaram/ICICI Prudential as an index-sheet AMC is the error,
not this plan's generic `SINGLE_WORKBOOK_MULTI_SHEET`-or-plain parse. The spec row is
corrected to match. Kotak's Wayback dependency is removed entirely (see its registry entry
above, now `DETERMINISTIC_TEMPLATE`); HDFC and Canara keep `WAYBACK_LOCATE` since each
genuinely has no direct, bot-free path. Two fixes land in this task: the prefix-search
helper below gains a `link_pattern` filter so Canara's open-ended
`wp-content/uploads/` search (today: every captured upload under that path, up to 50,
with no filter at all) only downloads files actually matching the AMC's known naming shape;
and after a CDX query, if the newest capture found is not newer than the previous month's,
`_alert(amc_name, "stale_wayback_capture", ...)` fires through the same ops-topic path as
Q12's other alerts — telling you Wayback has stopped finding fresh captures for HDFC or
Canara before a silent monthly gap builds up.

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

**Decided 2026-10-13 (F2/F3):** `memory` must be set explicitly, not left at the
module's 1024MB default (`lookup(each.value, "memory", "1024")`) — a 44+1-AMC run
(Task 5's full registry, not the original 10) processing bundled multi-scheme workbooks
is the same shape of memory pressure as `fund_managers_monthly`'s own `2048` precedent
above, and nothing about this job's workload is smaller. The schedule is also moved
earlier than originally drafted, to `05:45` IST, not `07:00` — confirmed safe against
the Terraform night-stop-start schedule (the stack finishes coming up ~05:06-05:11 IST,
per the night-stop EventBridge timing read directly from `infra/modules/networking/` and
the stop-schedule module), leaving a ~35-40 minute margin. The real reason for the move
is downstream, not infra safety: the existing `ter_daily`/NAV jobs run at `06:00`-ish and
the household recompute job (consuming this plan's five look-through attributes) runs at
`06:30` — if this job ran at `07:00` as originally drafted, every day's recompute would
read yesterday's look-through data, a full day stale. `05:45` gives this job up to 45
minutes to finish before `06:30`'s recompute needs its output.

```hcl
    # Daily, not monthly: retry-until-found is implicit in
    # refresh_portfolio_disclosures's own _already_written skip-check, so a flat
    # 1st-20th daily window needs no per-AMC publishing-lag config (spec's
    # "Scheduling and orchestration" section). 20 days covers the slowest AMC's
    # stated lag with margin.
    portfolio_disclosures_daily = {
      slug                = "portfolio-disclosures-daily"
      command             = ["python", "scripts/jobs/refresh_portfolio_disclosures_daily.py"]
      schedule_expression = "cron(45 5 1-20 * ? *)"
      task_role_arn       = null
      # Same order-of-magnitude memory pressure as fund_managers_monthly's run (44+1
      # AMCs, several bundled multi-scheme workbooks held in memory per AMC) -- the
      # module's 1024MB default was sized for the smaller, original 10-AMC scope.
      memory = "2048"
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

**Corrected 2026-10-12** (fifth-pass reconciliation — see
`Docs/analytics/investigations/2026-10-12-amc-disclosure-reconciliation-fifth-pass.md` for the
full live-rechecked evidence): the "JS-shell AMCs... needs a headless-browser Fetch step"
bullet below, as this plan originally wrote it, was wrong for 15 of its 16 AMCs. Every one of
those 16 was live-rechecked with real `curl`/Playwright; 13 turned out to need no Playwright at
all in production (wrong URL, wrong UA, or a plain JSON/AJAX API found via a one-time discovery
trace), 2 (Invesco, ITI) are genuine bot walls regardless of tooling, 1 (JM Financial) is a
confirmed encrypted-API false positive, and only **1 (HSBC)** genuinely needs Playwright (or a
fingerprint-matching HTTP client) as a standing production dependency. **Go/no-go decision: do
not add Playwright as a production dependency for one AMC** — HSBC moves to the
standing-manual-fetch bucket instead. The bullets below are corrected to match; where a prior
bullet's own reasoning is now stale it is struck through rather than silently rewritten, per this
project's "don't silently resolve a doc conflict" rule.

Every item below has a specific, named technical reason it isn't onboarded this round —
see this plan's Scope note for the live re-check each one is based on. None are deferred
purely to conserve token/implementation effort; each either needs a capability this plan
doesn't build (a headless-browser Fetch step, a bespoke CDX-to-prefix mapping), needs
fresh research no amount of extra time today could responsibly substitute for (a literal
endpoint that survives nowhere in writing), or is already a pre-existing spec-level
decision outside this plan's scope to revisit.

- ~~**`JSON_API`-kind Locate, now 23 AMCs, not 14... each needs its own from-scratch
  network-trace research pass before an adapter can be written.**~~ **Corrected 2026-10-13:
  this item overstated the gap, twice over.** The 14 (PGIM India, Navi, Jio BlackRock,
  Bandhan, ICICI Prudential, Bajaj Finserv, Unifi, Zerodha, Abakkus, quant Mutual Fund,
  Sundaram, Choice, UTI, Tata) each already have a confirmed, download-verified Locate
  mechanism — described as a UI interaction (select/click/accordion) because that's how
  the spike found it, not because production needs to replay that interaction. Cross-
  checking attribute 04's own adapter registry (already-built production code,
  `fund_manager_resolvers.py`) found that 12 of these 14 already have a confirmed,
  non-bot-blocked, plain-HTTP document API or static-link page on the exact same domain
  for their factsheet document type — strong evidence the disclosure equivalent is a
  sibling endpoint, not a page needing live JS execution. Navi's literal endpoint
  (`navi.com/wp-json/nv/v1/documents`) was in the spike doc all along, just never pulled
  into this plan. All 13 of those are onboarded this round in Task 5 as plain `JSON_API`/
  `STATIC_REGEX` entries, each with a sourced hypothesis and a `NEEDS LIVE VERIFICATION`
  note for the one request/link-pattern substitution still to be confirmed — not an open
  research item, and **no Playwright/browser-automation production dependency needed at
  all for this bucket**. **Bandhan — resolved 2026-10-13:** the attribute-04
  sibling-auth-gate signal was superseded by the more directly relevant evidence (the
  spike's own investigation of Bandhan's *disclosure* document, not its unrelated
  factsheet API) — a public, unauthenticated proxy that signs a GCS URL. Reclassified
  `JSON_API`, onboarded. Only **WhiteOak Capital** (page confirmed live at
  `mf.whiteoakamc.com/regulatory-disclosures/scheme-portfolios`, but unlike every other
  AMC in this plan its mechanism isn't discovered at all yet) remains a genuine open item
  across the entire 57-AMC universe. **The
  fifth pass adds 8 more AMCs to a related but distinct bucket, with their literal
  endpoints already found and documented** (no browser automation needed at all, just a
  direct HTTP call):
  SBI (`POST /ajaxcall/CMS/GetSchemePortfolioSheetsQS`), Bank of India (`AjaxService.asmx/GetDocuments`),
  Trust Mutual Fund (`POST /api/api/Trust/GetData`), Mirae Asset (`AjaxService/GetDownloadsData`
  on `/downloads/portfolio`), LIC (`/downloads/portfolio-filter-options` then
  `/downloads/portfolio-files`), Axis (`POST /cms/token` → `POST /cms/get-scheme-documents`, both
  unauthenticated, full chain replayable via plain `curl`), Aditya Birla Sun Life
  (`/postlogin/CustomApi/Resources/FactsheetAccordionById` — **adapter must rewrite the response's
  `pdfUrl` host from the dead `abcscprod.azureedge.net` CDN to the live
  `mutualfund.adityabirlacapital.com` domain, same path**, not fetch it as literally returned),
  and Taurus (a Drupal exposed-filter AJAX call, replayable as a plain GET with its query-string
  params — **flag this AMC's cadence as Half-Yearly-only, March/September, not monthly**, a
  `disclosure_batches`-grain question for whoever onboards it, not a fetch problem). `_locate_and_fetch`
  still only implements `STATIC_REGEX` and `WAYBACK_LOCATE` this round; `JSON_API` support (for
  all 22) remains future work, same as originally planned — this correction only changes which 8
  of those 22 are "ready to adapt" versus "needs research first."
- ~~**`ZIP_OF_WORKBOOKS` has no onboarded AMC yet**~~ — **corrected 2026-10-13: it does
  now.** ICICI Prudential's real ZIP-of-151-xlsx is onboarded against this shape in Task
  5 this round (the AMC's real page, found via WebSearch after its primary
  `archive.icicipruamc.com` path turned out to be a dead NXDOMAIN — not Bank of India's
  bundling pattern, which is corrected above to a single multi-sheet workbook via
  `AjaxService.asmx/GetDocuments`, not a ZIP, per the fifth pass). Abakkus and Sundaram
  were previously (incorrectly) grouped here as sharing ICICI Prudential's ZIP pattern —
  the spike's own mechanism descriptions for both are a single multi-sheet workbook
  (Abakkus: Index + 4 per-scheme sheets; Sundaram: one Index-sheet workbook, 31 schemes),
  i.e. `SINGLE_WORKBOOK_MULTI_SHEET`, same shape as Nippon India — corrected in Task 5's
  entries for both. Baroda BNP Paribas was already resolved `STATIC_REGEX` (a direct
  `.xlsx` link in the page's own static HTML) in the second audit pass, never a ZIP at
  all; this bullet's inclusion of it was stale from an earlier draft.
- ~~**JS-shell AMCs (DSP, NJ Mutual Fund, and 14 others individually re-confirmed the same
  way — SBI, Mirae Asset, Invesco, Axis, ITI, Trust Mutual Fund, Taurus, Wealth Company,
  Aditya Birla Sun Life, JM Financial, Bank of India, Baroda BNP Paribas, 360 ONE, HSBC,
  LIC). A plain `httpx` GET returns a near-empty JS-rendered shell... needs a headless-browser
  Fetch step (Playwright), a new production dependency with real infra cost... Worth its own
  follow-on plan once the cost/benefit of adding Playwright to the ingestion job is weighed on
  its own.**~~ **Superseded 2026-10-12.** Of these 16: DSP, NJ Mutual Fund, Wealth Company,
  Baroda BNP Paribas, and 360 ONE were already correctly `STATIC_REGEX` all along (this plan's
  own re-check used the wrong URL/missing `User-Agent`, see the fifth-pass doc); SBI, Mirae
  Asset, Axis, Trust Mutual Fund, Taurus, Aditya Birla Sun Life, Bank of India, and LIC move to
  the `JSON_API` bucket above (one-time-discovered endpoints, no Playwright in production);
  Invesco and ITI are confirmed `BOT_BLOCKED` (a real browser is blocked too — moved to the
  standing-manual-fetch bullet below, not a Playwright candidate); JM Financial is a confirmed
  encrypted-API false positive (moved to the standing-manual-fetch bullet below). **Only HSBC
  remains — see the go/no-go decision above: not worth a production Playwright dependency for
  one AMC.**
- ~~**AlphaGrep Mutual Fund.** ... Needs fresh, from-scratch discovery~~ — **resolved
  2026-10-12 (sixth pass), false alarm.** A Wayback CDX query against `alphagrepmf.ai`
  found the real path still live, just with a different digit format than this plan's
  (and the spike's) recorded template: `FY-{YY}-{YY+1}` (two-digit year range, e.g.
  `FY-2026-27`), not `FY-{year}-{year+1}` (four-digit, e.g. `FY-2026-2027`) as previously
  written down — that's why every guess against the recorded template 404'd, including a
  retry of the exact August file this plan had earlier verified live. Confirmed via live
  download with the corrected template: genuine SEBI-schema data (ISIN, Industry, Quantity,
  Market value, % to AUM). Stays `STATIC_REGEX`, fully automatable — correct the
  `link_pattern`'s digit format in the registry, no further research or manual fetch
  needed.
- ~~**Old Bridge Mutual Fund.** Its filename convention has visibly drifted since the
  spike... Genuinely ambiguous today; not safe to hardcode a `link_pattern` against.~~
  **Resolved 2026-10-13, no longer deferred.** Per the user's explicit instruction that no
  AMC is left to a later wave, the drift is handled as a disambiguation rule rather than a
  research gap: prefer the per-scheme-named file over the AMC-wide `IR_` file when both
  match the current month, and alert (not silently pick) if neither matches. Onboarded in
  Task 5's registry with this rule encoded as `link_pattern`/`exclude_pattern`.
- **Standing manual-fetch: exactly 6 AMCs (Edelweiss, Mahindra Manulife, Invesco, ITI, JM
  Financial, HSBC).** Edelweiss and Mahindra Manulife remain confirmed-genuine WAF/encrypted-API
  blocks. The fifth pass adds four more for named, confirmed reasons: Invesco and ITI are
  confirmed `BOT_BLOCKED` even against a real headless browser; JM Financial's "file" is
  confirmed AES-ciphertext, an encrypted-API dead end like Mahindra Manulife; HSBC is the sole
  AMC confirmed to need a standing Playwright/fingerprint-matching-client dependency, which this
  project is declining to add for one AMC (see go/no-go decision above) — so it is handled as a
  manual-fetch AMC instead. **Kotak Mahindra is no longer in this bucket** — resolved
  2026-10-12 (sixth pass) to automated `STATIC_REGEX` via the corrected Wayback-discovered URL
  path; no re-check pending.
- Attributes 02/06/10/13/15's own compute logic, reading from `scheme_holding` — out of
  scope here; built against this plan's own `Docs/analytics/plans/2026-10-12-attributes-
  02-06-10-13-15-lookthrough-consumers-plan.md`, already written and committed. That plan's
  Task 0 is gated on this plan producing at least one AMC's real `WRITTEN`
  `disclosure_batches` row — the first AMC this plan completes should be used to unblock it.
