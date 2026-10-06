# CAS Import Fixes — Phase 5: Fund Identity (#8, option D) and Direct/Regular (#7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** Every fund on a CAS is identified from AMFI's own data without asking the user — by ISIN against a local daily AMFI master, confirmed by matching the CAS's NAV — its plan type comes from AMFI's Plan column, closed funds import as "closed fund", and an mfapi.in outage no longer blocks anything.

**Architecture:**
- **Master:** a daily scheduled job upserts AMFI `NAVAll.txt` (~14,354 live schemes) into the existing `schemes` table (option D), adding `isin_reinvest`, `base_name`, `plan_type`, `is_active`, `source`; `amfi_code` becomes nullable for CAS-only closed funds.
- **Identification (`services/import_/identify.py`, new)** replaces `enrich.MfApiClient.resolve_scheme` in the preview: ISIN → master candidate → NAV fingerprint (CAS valuation NAV equals the candidate's NAV that day) → same-AMC siblings when the candidate's NAV disagrees → closed fund when units are 0 → otherwise "ask" (the rare fallback; phase 7's small dialog).
- **Plan type:** AMFI Plan column → AMFI name (Direct/Dir, Regular/Reg) → a Direct sibling with a different NAV means Regular → otherwise Regular with `plan_verified = false` (decided). The adviser code never decides.
- mfapi.in remains only for NAV history.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic, httpx, EventBridge Scheduler → ECS Fargate RunTask (existing pattern, `infra/modules/scheduler/main.tf`), Terraform.

**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` #7 and #8 (the "Is a daily scheme master actually correct and required?" analysis; option D decided 6 Oct; closed funds decided 5 Oct). Master index Global Constraints apply.

## Changes since this plan was written (2026-10-06, read first; binding)

Phases 3–4 changed interfaces this plan touches. Where a step below conflicts with this block, this block wins:
1. **Folios are found by `folio_key`.** `confirm_people._folio_for` already looks folios up by `normalise_folio_key(parsed_scheme.folio)`. Task 4's closed-fund scheme creation must keep going through `_folio_for` (it creates the folio with `folio_key`) and must not query by `folio_number`.
2. **`_all_rows_exist` and `_folio_for` look the Scheme up by `amfi_code`.** A closed CAS-only fund has `amfi_code = NULL`, so Task 4 must resolve the scheme from the session's `Identification` in **both** places: `scheme_id`, or the CAS-only lookup by `(isin, source=cas_only)` / `(name, amc_name, source=cas_only)`. Otherwise "already imported" and folio creation break for closed funds. Add a test: re-uploading a statement whose only fund is a closed fund raises `AlreadyImportedError`, and adds no duplicate scheme or folio.
3. **Rows are matched with `_match_rows` and linked in `transaction_imports`.** Nothing in this phase may write transactions any other way.
4. **Lot arithmetic only via `app/services/lot_rules.py`.**
5. **Migration number:** this phase's migration is `0028_scheme_master_and_plan_verified` with `down_revision = "0027"` (unchanged from the index).
6. **Test helpers that exist now** (`backend/tests/services/import_/test_confirm_people.py`):
   - `_solo(open_units=…, start=…, cost=…, rows=[(date, units[, balance])])` builds a one-fund `ParseResult` with a casparser-shaped `raw_json`.
   - `_upload(db, me, result)` patches `app.services.import_.service._fetch_nav_history` and confirms.

   If identification uses a different NAV-fetch seam, keep that patch target working, or update `_upload` in one place.
7. **Carry-overs 5 and 7 are acceptance criteria for this phase.** In Task 3 add identification tests for:
   - **Franklin:** a main fund `INF090I01HG7`/`118530` and its segregated portfolio `INF090I01UD7`/`147989` under one folio must resolve to **two different schemes**; the segregated one is a master row if NAVAll has it, otherwise a closed/CAS-only fund.
   - **Unifund:** a fund with an ISIN not in the master and 0 units must import as a closed fund under its CAS name, never matched to another AMC's scheme.

   The Task 5 checkpoint must show both `kfin_pk_10yr` Franklin rows and the p20 Unifund row as `match` (or the Unifund row as a correctly-named closed fund with 0 units both sides).
8. **Postgres is mandatory** for Task 1 and Task 5 (see the handoff doc's carry-over 6).

## Global Constraints

See the master index. Additionally:
- Migration **`0028_scheme_master_and_plan_verified`** (down_revision `0027`). `schemes` is a normal table; `folios` too — ordinary Alembic ops with SQLite batch mode.
- The job runs **as a scheduled ECS task, never on the web worker**, after `nav_daily` (06:00 IST) — schedule it `cron(15 6 * * ? *)`, `Asia/Kolkata`. If it fails, yesterday's master stays in use.
- **No NAV history for all 14k schemes.** NAV history is fetched only for the 1–5 candidate funds of an upload (existing `nav._fetch_nav_history`), in memory at preview time (no DB writes before the PAN claims — see `start_import_session`'s docstring).
- `NAV_ALL_URL` moves to `https://portal.amfiindia.com/spages/NAVAll.txt` (the www URL redirects there today; `follow_redirects=True` stays).
- **Deviation from the artifact, recorded:** AMFI's TER feed carries only a plan-generic `Scheme_Name`, no AMFI code, so "TER joined by AMFI code" isn't possible. This phase stores AMFI's bare base name (`schemes.base_name`, the 8-field NAVAll format's `name` column); phase 6 (#17) matches TER rows by exact normalised base name within the AMC instead of fuzzy matching full plan names.

## Review Focus

1. **mfapi.in down during an upload.** Funds with an ISIN in the master are still identified (ISIN match accepted without the NAV check, recorded as `identified_by="isin"`); nothing is "pending". Test: `test_isin_match_survives_nav_outage` (Task 3).
2. **casparser's AMFI code is wrong (one of the 449).** ISIN finds the right master row; if the CAS has no ISIN and casparser's code's NAV disagrees, siblings are tried; never the wrong fund's NAV. Test: `test_wrong_casparser_code_is_corrected_by_nav` (Task 3).
3. **A merged-away fund with an unknown ISIN, units 0.** Imports as a closed fund (`amfi_code NULL`, `source="cas_only"`, CAS name), never blocks, never borrows another AMC's fund. Test: `test_unknown_isin_with_zero_units_is_closed_fund` (Task 3), `test_closed_fund_is_saved_and_never_blocks` (Task 4).
4. **Direct plan held through a registered adviser (ARN/INA code present).** Classified Direct, verified. Test: `test_adviser_code_never_decides_plan` (Task 3).
5. **The master job fails halfway or AMFI returns an empty/garbled file.** No scheme is marked inactive and nothing is deleted. Test: `test_refresh_aborts_on_tiny_file` (Task 2).

---

## File map

- Modify `backend/app/models/reference.py` (`Scheme`), `backend/app/models/folio.py` (`plan_verified`), `backend/app/models/enums.py` (`SchemeSource`, `SchemePlanType`).
- Create `backend/alembic/versions/0028_scheme_master_and_plan_verified.py`.
- Modify `backend/app/services/analytics/scheme_universe.py` (`UniverseRow`, `_parse_nav_all`, URL).
- Create `backend/app/services/analytics/scheme_master.py`, `backend/scripts/jobs/refresh_scheme_master_daily.py`.
- Modify `infra/modules/scheduler/main.tf` (new job).
- Create `backend/app/services/import_/identify.py`.
- Modify `backend/app/services/import_/service.py` (`build_import_preview`), `schemas.py` (`SchemeMatchPreview`), `confirm_people.py` (`_validate_schemes`, scheme/folio creation).
- Modify `backend/app/services/dashboard/holdings.py`, `schemas.py` (`HoldingRow.plan_verified`).

---

### Task 1: Schema — migration 0028

**Files:**
- Modify: `backend/app/models/enums.py`, `backend/app/models/reference.py:17-26`, `backend/app/models/folio.py`
- Create: `backend/alembic/versions/0028_scheme_master_and_plan_verified.py`
- Test: `backend/tests/test_migrations.py`

**Interfaces:**
- Produces: `SchemeSource.{AMFI="amfi", CASPARSER="casparser", CAS_ONLY="cas_only"}`; `SchemePlanType.{DIRECT="direct", REGULAR="regular"}`; `Scheme.amfi_code: str | None` (unique, nullable), `Scheme.isin_reinvest: str | None`, `Scheme.base_name: str | None`, `Scheme.plan_type: SchemePlanType | None`, `Scheme.is_active: bool` (default True), `Scheme.source: SchemeSource` (default AMFI); `Folio.plan_verified: bool` (NOT NULL, default False). Index `ix_schemes_isin` on `isin`, `ix_schemes_isin_reinvest` on `isin_reinvest`, `ix_schemes_amc_base` on `(amc_name, base_name)`.

- [ ] **Step 1: Write the failing test:**

```python
def test_0028_scheme_master_columns_and_nullable_code(tmp_path, monkeypatch):
    import sqlite3
    db_path = tmp_path / "master.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0027").returncode == 0
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s1', '100001', 'X', 'A', 'E')")
    conn.commit(); conn.close()
    up = _alembic("upgrade", "0028")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT source, is_active FROM schemes WHERE id='s1'").fetchone() == ("amfi", 1)
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category, source, is_active) "
                 "VALUES ('s2', NULL, 'Closed', 'A', 'E', 'cas_only', 0)")
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category, source, is_active) "
                 "VALUES ('s3', NULL, 'Closed 2', 'A', 'E', 'cas_only', 0)")   # two NULL codes allowed
    cols = {r[1] for r in conn.execute("PRAGMA table_info(folios)")}
    assert "plan_verified" in cols
    conn.commit(); conn.close()
    # Downgrade drops CAS-only schemes first (amfi_code back to NOT NULL).
    assert _alembic("downgrade", "0027").returncode == 0
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Model (`reference.py`):

```python
class Scheme(Base):
    __tablename__ = "schemes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Nullable since #8: a closed fund that exists only on a CAS has no code.
    amfi_code: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    isin: Mapped[str | None] = mapped_column(String, index=True)
    isin_reinvest: Mapped[str | None] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # AMFI's plan-generic base name (NAVAll 8-field format); TER rows match on it.
    base_name: Mapped[str | None] = mapped_column(String)
    amc_name: Mapped[str] = mapped_column(String, nullable=False)
    sebi_category: Mapped[str] = mapped_column(String, nullable=False)
    plan_name_variant: Mapped[PlanNameVariant | None] = mapped_column(enum_column(PlanNameVariant))
    plan_type: Mapped[SchemePlanType | None] = mapped_column(enum_column(SchemePlanType))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa.true())
    source: Mapped[SchemeSource] = mapped_column(enum_column(SchemeSource), nullable=False,
                                                 default=SchemeSource.AMFI, server_default="amfi")
```

Migration: `add_column` for each new column (`server_default` for `is_active`/`source`/`plan_verified`), create the three indexes, and in a `batch_alter_table("schemes", recreate="always")` set `amfi_code` nullable. On Postgres, `source` and `plan_type` are native enums created with `postgresql.ENUM(..., create_type=True)` (schemes isn't partitioned). Downgrade: `DELETE FROM folios WHERE scheme_id IN (SELECT id FROM schemes WHERE amfi_code IS NULL)` is **not** acceptable (data loss) — instead downgrade fails loudly if any `amfi_code IS NULL` row exists:

```python
    nulls = op.get_bind().execute(sa.text("SELECT count(*) FROM schemes WHERE amfi_code IS NULL")).scalar()
    if nulls:
        raise RuntimeError(f"{nulls} closed-fund schemes have no AMFI code; downgrade would orphan their folios")
```

and the test above deletes `s2`/`s3` before its downgrade call (adjust the test: `conn.execute("DELETE FROM schemes WHERE amfi_code IS NULL")` before `downgrade`).

- [ ] **Step 4: Run, expect PASS.**

---

### Task 2: NAVAll master — parser, refresh service, daily job

**Files:**
- Modify: `backend/app/services/analytics/scheme_universe.py:31,37-108`
- Create: `backend/app/services/analytics/scheme_master.py`, `backend/scripts/jobs/refresh_scheme_master_daily.py`
- Modify: `infra/modules/scheduler/main.tf` (`locals.jobs`)
- Test: `backend/tests/services/analytics/test_scheme_universe.py`, `backend/tests/services/analytics/test_scheme_master.py` (new), `backend/tests/scripts/` (the jobs' existing test file — grep `refresh_ter_monthly` there), `backend/tests/test_deployment_config.py` (if it asserts the job list)

**Interfaces:**
- `UniverseRow` gains: `isin_reinvest: str | None`, `base_name: str | None` (8-field rows only), `plan: str | None` ("Direct Plan"/"Regular Plan"/None), `nav: Decimal | None`, `nav_date: date | None`.
- Produces: `scheme_master.refresh_scheme_master(db: Session, text: str | None = None) -> MasterRefreshResult` (`inserted`, `updated`, `deactivated`, `rows`); raises `MasterRefreshAborted` when the parsed file has fewer than 5,000 rows (a sanity floor ~⅓ of today's 14,354).
- `plan_type_for(row: UniverseRow) -> SchemePlanType | None`: `plan` column first; else name contains ` DIRECT`/`- DIRECT`/` DIR ` (word-bounded, case-insensitive) → DIRECT; `REGULAR`/` REG ` → REGULAR; else `None`.

Upsert rules: key `amfi_code`. Insert new codes with `source=AMFI`, `is_active=True`. Update `name, isin, isin_reinvest, base_name, amc_name, sebi_category, plan_type, is_active=True` on existing codes. Codes with `source=AMFI` absent from the file → `is_active=False` (never deleted). `source=CAS_ONLY` and `CASPARSER` rows are untouched. One commit at the end; batched `bulk_insert_mappings`/`bulk_update_mappings` in chunks of 1,000.

- [ ] **Step 1: Write the failing tests:**

```python
# test_scheme_universe.py
NAVALL_8 = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Mid Cap Fund)

Edelweiss Mutual Fund

140228;INF754K01KO2;-;Edelweiss Mid Cap Fund;Direct Plan;Growth Option;128.3011;05-Oct-2026
140225;INF754K01KN4;-;Edelweiss Mid Cap Fund;Regular Plan;Growth Option;108.5602;05-Oct-2026
"""


def test_parse_nav_all_keeps_plan_base_name_and_nav():
    rows = _parse_nav_all(NAVALL_8)
    d = next(r for r in rows if r.amfi_code == "140228")
    assert d.plan == "Direct Plan" and d.base_name == "Edelweiss Mid Cap Fund"
    assert d.nav == Decimal("128.3011") and d.nav_date == date(2026, 10, 5)
```

```python
# test_scheme_master.py
def test_refresh_inserts_updates_and_deactivates(db_session):
    db_session.add(Scheme(id=uuid.uuid4(), amfi_code="999999", name="Gone Fund", amc_name="A",
                          sebi_category="E", source=SchemeSource.AMFI))
    db_session.add(Scheme(id=uuid.uuid4(), amfi_code=None, name="Closed CAS fund", amc_name="A",
                          sebi_category="E", source=SchemeSource.CAS_ONLY, is_active=False))
    db_session.commit()
    with patch("app.services.analytics.scheme_master.MIN_ROWS", 1):
        result = asyncio.run(refresh_scheme_master(db_session, NAVALL_8))
    assert result.inserted == 2 and result.deactivated == 1
    direct = db_session.query(Scheme).filter_by(amfi_code="140228").one()
    assert direct.plan_type == SchemePlanType.DIRECT and direct.base_name == "Edelweiss Mid Cap Fund"
    assert db_session.query(Scheme).filter_by(amfi_code="999999").one().is_active is False
    assert db_session.query(Scheme).filter_by(source=SchemeSource.CAS_ONLY).count() == 1


def test_refresh_aborts_on_tiny_file(db_session):
    db_session.add(Scheme(id=uuid.uuid4(), amfi_code="999999", name="Live", amc_name="A", sebi_category="E"))
    db_session.commit()
    with pytest.raises(MasterRefreshAborted):
        asyncio.run(refresh_scheme_master(db_session, NAVALL_8))     # 2 rows < MIN_ROWS
    assert db_session.query(Scheme).filter_by(amfi_code="999999").one().is_active is True


def test_plan_type_from_name_when_plan_column_blank():
    row = UniverseRow(amfi_code="1", isin=None, isin_reinvest=None, name="DSP Small Cap Fund - Dir - Growth",
                      base_name=None, plan=None, amc_name="DSP", sebi_category="E", nav=None, nav_date=None)
    assert plan_type_for(row) == SchemePlanType.DIRECT
```

Plus a job test mirroring the existing TER job test: `refresh_scheme_master_daily.main_async(db)` calls `refresh_scheme_master` and logs counts.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - `scheme_universe.py`: URL → `https://portal.amfiindia.com/spages/NAVAll.txt`; extend `UniverseRow` and `_parse_nav_all` (6-field rows: `base_name=None`, `plan=None`; parse `nav` via `Decimal` unless `N.A.`, date `%d-%b-%Y`). `get_category_universe` is unchanged except it now also passes the new fields when it creates a `Scheme`.
  - `scheme_master.py`: `MIN_ROWS = 5000`; `async def refresh_scheme_master(db, text=None)`: `text = text or await SchemeUniverseClient()._fetch_nav_all_text()` (fresh fetch, not the 24 h disk cache), parse, abort below `MIN_ROWS`, upsert per the rules, `await commit_off_loop(db)`.
  - `scripts/jobs/refresh_scheme_master_daily.py`: copy `refresh_ter_monthly.py`'s shape.
  - `main.tf`, inside `locals.jobs`:

```hcl
    scheme_master_daily = {
      slug                = "scheme-master-daily"
      command             = ["python", "scripts/jobs/refresh_scheme_master_daily.py"]
      schedule_expression = "cron(15 6 * * ? *)"
      task_role_arn       = null
    }
```

- [ ] **Step 4: Run, expect PASS**; `cd infra && terraform fmt -check modules/scheduler` and `terraform validate` in the staging env folder (report output; don't apply).

---

### Task 3: Identification

**Files:**
- Create: `backend/app/services/import_/identify.py`
- Test: `backend/tests/services/import_/test_identify.py` (new)

**Interfaces:**
- Consumes: `Scheme` master rows (Task 1/2), `ParsedScheme` (phase 2 fields `valuation_nav`, `valuation_date`, `close_units`, `isin`, `amfi`, `name`, `amc`).
- Produces:

```python
NavSeriesFetcher = Callable[[str], Awaitable[list[tuple[date, Decimal]] | None]]  # amfi_code -> series or None

@dataclass
class Identification:
    status: Literal["verified", "closed", "ask"]
    scheme_id: uuid.UUID | None         # existing master row, or None for a closed fund to create
    amfi_code: str | None
    name: str                           # master name, or CAS name for closed
    category: str
    plan_type: Literal["direct", "regular"]
    plan_verified: bool
    identified_by: Literal["isin+nav", "isin", "sibling_nav", "casparser_code+nav", "closed", "none"]
    candidates: list[tuple[str, str]]   # (amfi_code, name) offered when status == "ask"

async def identify_scheme(db: Session, scheme: ParsedScheme, fetch_series: NavSeriesFetcher) -> Identification
def classify_plan(master: Scheme | None, siblings_direct_nav_differs: bool, cas_name: str) -> tuple[str, bool]
```

Algorithm (artifact #8 "After the fix" flow, #7 plan flow):
1. `candidates` = master rows (any `is_active`) with `isin == scheme.isin` or `isin_reinvest == scheme.isin`; else, when no ISIN hit and `scheme.amfi`, the row with `amfi_code == scheme.amfi`.
2. For the first candidate: `nav_ok = _nav_matches(candidate, scheme)` where `_nav_matches` fetches the series once per code (memoised per call), finds the NAV on `scheme.valuation_date` (exact date) and compares with `scheme.valuation_nav` at 4 dp (`abs(diff) <= 0.0001`). Returns `True`, `False`, or `None` (series unavailable or no point that day).
   - `True` → verified (`isin+nav` or `casparser_code+nav`).
   - `None` and the candidate came from an **ISIN** hit → verified (`isin`) — outage-proof (Review Focus 1).
   - `False`, or `None` for a casparser-code-only candidate → step 3.
3. Siblings: master rows with the same `amc_name` and the same `base_name` as the candidate (or, without a candidate, whose normalised name shares the CAS name's normalised base — strip plan/option words `DIRECT|DIR|REGULAR|REG|PLAN|GROWTH|IDCW|DIVIDEND|OPTION|PAYOUT|REINVEST(MENT)?`). Exactly one sibling with `_nav_matches == True` → verified (`sibling_nav`).
4. No verified match and `scheme.close_units in (None, 0)` → `closed` (`scheme_id=None`, CAS name, category `scheme.scheme_type or "Unclassified"`).
5. Otherwise `ask`, with up to 5 `candidates` (the candidate + siblings).
- Plan (`classify_plan`): master `plan_type` if set → verified; else name rule on master name (or the CAS name for closed funds), word-bounded `DIRECT|DIR` / `REGULAR|REG` → verified; else if a Direct sibling exists whose NAV on the CAS date differs from this fund's → `regular`, verified; else `regular`, `plan_verified=False`. ARN never consulted.

- [ ] **Step 1: Write the failing tests** (in-memory DB with master rows; `fetch_series` is a plain async stub returning dict lookups):

```python
def _master(db, code, isin, name, base, plan, amc="Edelweiss Mutual Fund"):
    s = Scheme(id=uuid.uuid4(), amfi_code=code, isin=isin, name=name, base_name=base, plan_type=plan,
               amc_name=amc, sebi_category="Equity Scheme - Mid Cap Fund", source=SchemeSource.AMFI)
    db.add(s); db.flush(); return s


def _cas(isin, nav, close="100", amfi=None, name="Edelweiss Mid Cap Fund - Direct Plan - Growth", amc="Edelweiss Mutual Fund"):
    return ParsedScheme(name=name, isin=isin, amfi=amfi, scheme_type="EQUITY", folio="1/1", amc=amc, transaction_count=0,
                        close_units=Decimal(close), valuation_nav=Decimal(nav), valuation_date=date(2026, 10, 5))


def _series(table):
    async def fetch(code):
        return table.get(code)
    return fetch


DAY = date(2026, 10, 5)


async def test_isin_and_nav_verified(db_session):
    _master(db_session, "140228", "INF754K01KO2", "Edelweiss Mid Cap Fund - Direct Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
    ident = await identify_scheme(db_session, _cas("INF754K01KO2", "128.3011"), _series({"140228": [(DAY, Decimal("128.3011"))]}))
    assert (ident.status, ident.amfi_code, ident.plan_type, ident.plan_verified, ident.identified_by) == \
        ("verified", "140228", "direct", True, "isin+nav")


async def test_isin_match_survives_nav_outage(db_session):
    _master(db_session, "140228", "INF754K01KO2", "Edelweiss Mid Cap Fund - Direct Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
    ident = await identify_scheme(db_session, _cas("INF754K01KO2", "128.3011"), _series({}))
    assert ident.status == "verified" and ident.identified_by == "isin"


async def test_wrong_casparser_code_is_corrected_by_nav(db_session):
    _master(db_session, "140228", None, "Edelweiss Mid Cap Fund - Direct Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
    _master(db_session, "140225", None, "Edelweiss Mid Cap Fund - Regular Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.REGULAR)
    series = _series({"140228": [(DAY, Decimal("128.3011"))], "140225": [(DAY, Decimal("108.5602"))]})
    ident = await identify_scheme(db_session, _cas(None, "108.5602", amfi="140228"), series)
    assert ident.amfi_code == "140225" and ident.identified_by == "sibling_nav" and ident.plan_type == "regular"


async def test_unknown_isin_with_zero_units_is_closed_fund(db_session):
    ident = await identify_scheme(db_session, _cas("INF999X01ZZ9", "10", close="0", name="HDFC Old Small Cap - Dir"), _series({}))
    assert ident.status == "closed" and ident.scheme_id is None and ident.plan_type == "direct"


async def test_unknown_isin_with_units_asks(db_session):
    ident = await identify_scheme(db_session, _cas("INF999X01ZZ9", "10", close="5"), _series({}))
    assert ident.status == "ask"


async def test_adviser_code_never_decides_plan(db_session):
    # ParsedScheme.arn_code set; plan still from the master
    _master(db_session, "140228", "INF754K01KO2", "Edelweiss Mid Cap Fund - Direct Plan - Growth", "Edelweiss Mid Cap Fund", SchemePlanType.DIRECT)
    cas = _cas("INF754K01KO2", "128.3011"); cas.arn_code = "INA000012345"
    ident = await identify_scheme(db_session, cas, _series({"140228": [(DAY, Decimal("128.3011"))]}))
    assert ident.plan_type == "direct" and ident.plan_verified


async def test_neither_word_no_sibling_is_regular_unverified(db_session):
    _master(db_session, "100100", "INF100A01AA1", "Old Plan Fund - Growth", "Old Plan Fund", None, amc="HDFC Mutual Fund")
    ident = await identify_scheme(db_session, _cas("INF100A01AA1", "50", name="Old Plan Fund - Growth", amc="HDFC Mutual Fund"),
                                  _series({"100100": [(DAY, Decimal("50"))]}))
    assert ident.plan_type == "regular" and ident.plan_verified is False
```

(Mark the module `pytestmark = pytest.mark.asyncio` if the repo uses pytest-asyncio; otherwise wrap each in `asyncio.run` like `test_confirm_people.py` does — check `backend/pytest.ini`/`pyproject.toml` for `asyncio_mode`.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `identify.py` per the algorithm.
- [ ] **Step 4: Run, expect PASS.**

---

### Task 4: Preview and confirm use identification; closed funds; `plan_verified`

**Files:**
- Modify: `backend/app/services/import_/schemas.py` (`SchemeMatchPreview`), `service.py:164-235` (`build_import_preview`), `confirm_people.py` (`_validate_schemes`, scheme get-or-create, folio creation)
- Modify: `backend/app/services/dashboard/holdings.py`, `backend/app/services/dashboard/schemas.py` (`HoldingRow.plan_verified: bool = True`)
- Test: `test_service.py`, `test_confirm_people.py`, `tests/api/test_imports_routes.py`, `tests/api/test_imports_people_routes.py`, `test_holdings.py`; update `tests/api/import_helpers._parse` (it patches `MfApiClient._get_json`; replace with seeding a master `Scheme` row for `SCHEME_NAME`/`INF123`/`125497` and patching `identify`'s NAV fetcher)

**Interfaces:**
- `SchemeMatchPreview` gains `identification: Literal["verified","closed","ask"]`, `plan_verified: bool`, `identified_by: str`; `match_status` = `"confirmed"` for verified/closed, `"pending"` for ask (kept for the current review UI until phase 7); `suggested_amfi_code` = `Identification.amfi_code` (None for closed); `plan_type` = `Identification.plan_type`; `category` = master `sebi_category`.
- Session: `"identifications": dict[str, Identification]` (temp_id →).
- `build_import_preview(..., client=None)` keeps its signature (tests pass `client`), but `client` is now only used as the NAV fetcher source: default fetcher is `nav._fetch_nav_history` wrapped to return `None` on `httpx.HTTPError`.

Confirm rules:
- `_validate_schemes`: a temp_id whose identification is `verified` or `closed` never raises; `ask` needs an override (as today). The DATA-001 override check uses the master (`db.query(Scheme).filter_by(amfi_code=override.amfi_code)`), not `mfapi_client.cached_scheme_list()`. Remove the plan-type-override 409 backstop's dependency on `plan_name_variant` only if a test proves it's dead; otherwise leave it.
- Scheme for a row: `verified` → the master row by `scheme_id` (it exists — no more create-from-CAS for coded funds); `closed` → get-or-create `Scheme(amfi_code=None, isin=cas isin, name=cas name, amc_name, sebi_category, source=CAS_ONLY, is_active=False, plan_type=<classify_plan>)`, looked up by `(isin, source=CAS_ONLY)` or, without an ISIN, by `(name, amc_name, source=CAS_ONLY)`; an override → the master row for that code.
- Folio: `plan_type = Identification.plan_type`, `plan_verified = Identification.plan_verified` (override: verified=True).
- `holdings.compute_holdings` groups by `(member, scheme, plan_type)` as today and sets `plan_verified = all(f.plan_verified for f in member_folios)`.
- **Closed funds valuation:** a `cas_only` scheme has no AMFI code, so `get_navs_on_or_before` must skip it (no fetch) — its units are 0 by definition; if not, the row shows `nav_unavailable` (never another fund's NAV). Guard in `nav.py`: `if scheme.amfi_code is None: return None`.

- [ ] **Step 1: Write the failing tests:**

```python
# test_confirm_people.py
def test_closed_fund_is_saved_and_never_blocks(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    result = _solo(start=date(2010, 1, 1), rows=[(date(2010, 2, 1), "10"), ])
    result.schemes[0].isin, result.schemes[0].close_units = "INF999X01ZZ9", Decimal("0")
    for t in result.transactions:
        t.isin = "INF999X01ZZ9"
    result.transactions.append(replace(result.transactions[0], txn_date=date(2012, 1, 1),
                                       txn_type=TransactionType.REDEMPTION))
    response = _upload(db_session, me, result)          # no override supplied
    scheme = db_session.query(Scheme).filter_by(isin="INF999X01ZZ9").one()
    assert scheme.amfi_code is None and scheme.source == SchemeSource.CAS_ONLY
    assert response.added == 2


def test_folio_gets_plan_verified_from_identification(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    db_session.add(Scheme(id=uuid.uuid4(), amfi_code="125497", isin="INF123", name=SCHEME_NAME,
                          base_name="HDFC Flexi Cap Fund", plan_type=SchemePlanType.DIRECT, amc_name="HDFC AMC",
                          sebi_category="Equity Scheme - Flexi Cap Fund", source=SchemeSource.AMFI))
    db_session.commit()
    result = _solo(start=date(2024, 1, 1), rows=[(date(2024, 1, 2), "10")])
    result.schemes[0].plan_type = "unclassified"        # whatever the parser guessed is ignored now
    _upload(db_session, me, result)                     # _upload patches the NAV fetcher to return None
    folio = db_session.query(Folio).one()
    assert folio.plan_type == PlanType.DIRECT and folio.plan_verified is True
```

```python
# test_service.py
async def test_mfapi_outage_does_not_make_isin_funds_pending(db_session):
    seed_master_scheme(db_session)            # INF123 → 125497
    result = family_result([{"name": "ADITI SHARMA", "pan": "ABCDE1234K"}])
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(side_effect=httpx.ConnectError("down"))):
        preview = await build_import_preview(result, "cas.pdf", b"%PDF", db=db_session)
    assert preview.schemes[0].match_status == "confirmed"
```

(`build_import_preview` needs `db` for master lookups: add a keyword `db: Session | None = None`; `start_import_session` passes its `db`. When `db` is None (old direct test callers), fall back to today's `client.resolve_scheme` path so those tests keep passing until updated — delete that fallback in this task once every caller passes `db`.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** — every file in **Files**, plus `grep -rln "resolve_scheme\|cached_scheme_list\|mfapi_client" backend/app backend/tests` and fix each caller.

---

### Task 5: Checkpoint (Postgres + daily jobs)

- [ ] **Step 1: Postgres** — `upgrade head` / `downgrade 0027` (with no closed funds) / `upgrade head`; `tests/functional_postgres/` in full.
- [ ] **Step 2: Load the master locally** — `python3 scripts/jobs/refresh_scheme_master_daily.py` against the dev DB. Expected log: ~14,000+ rows, `inserted` large on first run, `deactivated` 0 on a fresh DB. Run it twice: second run `inserted == 0`.
- [ ] **Step 3: Daily jobs against the changed `schemes`** (decided checkpoint): run each once against the dev DB after the master load and confirm it exits 0 and its table changes look sane:
  `scripts/jobs/refresh_nav_daily.py`, `refresh_benchmark_daily.py`, `refresh_ter_monthly.py`, `refresh_aaum_quarterly.py`, `scripts/run_analytics_recompute.py --all`, `scripts/jobs/delete_expired_accounts_daily.py`, `python -m app.scripts.expire_cas_files`. Special attention: `refresh_nav_daily` must not try to fetch NAVs for 14k newly-inserted master schemes (it should only warm held schemes — verify its query; if it iterates all `schemes`, restrict it to schemes referenced by a folio in this task and add a test). `refresh_ter_monthly` iterates `Scheme.plan_name_variant in (direct, regular)` — master rows have `plan_name_variant=None`, so no behaviour change until phase 6. Record runtimes and row counts in the baseline doc.
- [ ] **Step 4: Synthetic** (to `/tmp/p5_*.json`), with network **blocked for mfapi.in** in one run (`export HTTPS_PROXY=http://127.0.0.1:9` for that run) and normal in another:
  - Zero `pending` schemes across all files, except intended `ask` cases (there should be none in the suite; list any).
  - p20's merged-away fund and old HDFC Liquid ISIN import as closed funds.
  - p10's adviser-held Direct funds and DSP "Dir"/"Reg" funds classified correctly; nothing `unclassified`.
  - Units/value results ≥ phase 4.
- [ ] **Step 5:** Stop and fix any failure before phase 6.
