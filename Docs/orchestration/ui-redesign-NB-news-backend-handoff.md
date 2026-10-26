# Handoff: ui-redesign NB (Home News backend: runs NB1, NB2, NB3 in one session)
**Status:** READY FOR A SONNET TERMINAL (written 26 Oct 2026, not yet run). **Worker:** Claude Code (Sonnet), one session, in the WSL shell. **Orchestrator:** Claude Code (this chat); it verifies, merges docs, never pushes without the owner.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-news-plan.md` (T1 to T9). **Decisions:** `Docs/orchestration/2026-10-23-portfolio-snapshot-decisions-v21.html` (v21 is current; the plan still cites v20): L9-L18, L40, L41, L50, E4, E8, E9, E11 (owner chose B), E12, E13, E14 (owner chose B), E15, E16, E18, E19, E20, E22, N5 B. Spec: `2026-10-23-home-functionality-backend-spec.md` section 8 and 10; register `ui-redesign-decisions-register.md`. Front-end consumer: `Docs/superpowers/plans/2026-10-23-home-frontend-plan.md` T10.
**Precondition T1 (VM dry run, done by the OWNER with `Docs/orchestration/news-dry-run/gdelt_dry_run.py`):**
`T1 RESULT: PENDING` (the orchestrator pastes the script's output and the GO / NO-GO line here before the session starts). **If this line still says PENDING or says NO-GO, stop at once and report; do not start anything.** T1 is not part of your work.

## 1. Purpose and non-goals
Build the shared GDELT news feed and the per-user news section of Home: migration `0044`, ingest, tagging, request-time matching and scoring, the job `refresh_news.py` with its cron lines, kill switch and Healthchecks.io heartbeat, the endpoint (two scoped routes), the copy strings, and golden fixtures for the front end. **Non-goals:** any front end; the About page; AWS EventBridge/Terraform; populating `stock_master.nse_symbol` (column only); fund-level event cards (L36); images (E3: icon keys only); Hindi (E16); a response cache; changing any Dashboard/Home/Portfolio/MF behaviour or cache key; the staging run (T9 is the owner's; you only prepare it).

## 2. Setup and baseline (run, record the output in the report; red means STOP)
The orchestrator tells you when PRs #10 (Home), #12 (Mutual Funds) and #15 (Portfolio) are merged into `leapswitch-redesign`. Then:
```
cd /home/ayush/wt/docs && git log --oneline -1 leapswitch-redesign
git worktree add /home/ayush/wt/home-news -b feat/home-news leapswitch-redesign
cd /home/ayush/wt/home-news/backend
test -f app/api/home.py && test -f app/api/portfolio.py && test -f alembic/versions/0045_benchmark_index_new_members.py && echo BASE-OK   # else STOP
PY="/mnt/d/Unifolio code/backend/.venv/bin/python"          # shared venv, Python 3.14, quote it (the path has a space)
git log --oneline -5 ; "$PY" -m alembic heads               # expect exactly: 0045 (head)
"$PY" -m pytest tests/api tests/services/home tests/services/dashboard -q -p no:cacheprovider --disable-warnings
```
All three must be green and `alembic heads` must print `0045 (head)`; anything else: stop and report. Every later pytest command uses `"$PY" -m pytest -p tests.offline_http <files> -q -p no:cacheprovider --disable-warnings` (the plugin forbids real HTTP). Windows and `.venv/Scripts` do not apply. Do not run the full suite.

## 3. Rules
- **Tests first, red first**: write the tests of a task, run them, see them fail for the right reason, then implement. List which were RED in the report.
- **No live network anywhere in tests**: GDELT, Healthchecks and publishers are faked (`httpx.MockTransport`, monkeypatched functions, committed fixtures). Do not download anything, not even a sample file.
- **No `float`** in `app/services/news` or `app/api/home_news.py` (a test greps for it). Percentages and exposures are `Decimal`, quantized `0.01` `ROUND_HALF_UP`, serialized as strings through `PlainDecimal`. Ranking uses tiers, timestamps and ids only (no numeric relevance score).
- **Additive only.** Exactly two existing test assertions may change (section 6, items 2 and 5); nothing else. Home routes never write (a test asserts it) and never recompute Analytics.
- **No edits outside the file map** (section 7). **No push, no merge, no checkout of another branch, no stash/reset/rebase.** Allowed git writes: `add` and `commit` on `feat/home-news`, one commit per task (section 12).
- When the plan, the decisions and the code disagree, or a shape cannot work, **stop and report under Open questions instead of improvising**. Where this handoff says "decided", it is final (section 3b); do not re-litigate.
- LF endings, UTF-8, comment density like the surrounding code. No new dependency (PyYAML exists but lists are Python constants in `config.py`).

## 3b. Decisions fixed by the orchestrator for this run (to be logged as register C116 onward; the owner may veto)
D1 Two scoped routes, like every Home route (`/household/aggregate/home/news`, `/household-members/{member_id}/home/news`), in a new file `app/api/home_news.py` (`router = APIRouter(tags=["home"])`); `app/api/home.py` is not touched; `get_now_ist` is imported from it (same override point as the other Home routes).
D2 Settings (`app/config.py`): `news_enabled: bool = False` (the VM `.env` sets `NEWS_ENABLED=true` at T9 = going live under N5 B), `news_disabled_sources: str = ""` (comma-separated domains, per-source kill list), `healthcheck_news_url: str = ""`. The disabled-source list applies at ingest AND at request time.
D3 Ladder tiers (L40): 1 stock, 2 fund category, 3 fund house, 4 asset class or commodity, 5 sector, 6 rates and macro, 7 general. Asset-class topics are only `gold_silver` (E18, one topic) and `debt`. Market-wide equity headlines (Sensex, Nifty), SEBI, AMFI, budget, GDP are **general (tier 7)** (E20: general never triggers an update). Rates and macro (RBI, repo, inflation, bond yield, rupee) are specific only when the debt share is at least the debt threshold, else they are general fill.
D4 Watch list (L17, E20): per kind take the user's **top 5 by exposure**, then keep those at or above the minimum. **Starting values (NOT locked; calibration step in section 9): stock 1.00 percent of portfolio (look-through), fund house any held (> 0), fund category 10.00, gold_silver 5.00, debt 20.00, sector 10.00 (my proposal; E20 gives no sector number).** All in `config.py` as `MIN_SIZE_PCT`, `TOP_N = 5`, with a comment "starting values, not locked".
D5 Selection (T5): 3 slots. Candidates: specific items published at most 24 hours ago (inclusive); general items at most 72 hours ago. Fill tier 1 to 6 from the highest tier that has a match, inside a tier newest first (`published_at` desc, then `id` asc), no two items about the same entity key and never the same URL; then general items, newest first. An item's matched tag is its best-tier tag that is in the user's watch list (tie inside a tier: larger exposure). No per-user state, no timer: the same inputs give the same card.
D6 Majority override (L41), decided reading: when `gold_silver` or `debt` is **strictly more than 50 percent** of the portfolio (allocation class percentage), the newest eligible item of that class takes slot 1 before the ladder; if it has none, the ladder applies (a debt-only user falls through to rates). Equity majority does not trigger an override (equity-market news is general). Owner may veto (O3).
D7 Freshness flags are feed-level: `feed_as_of` = newest `ingested_at` over all `news_items`; `stale` when `now - feed_as_of > 36 h`; `hidden` when `> 72 h` (then `items = []`). No rows at all: `state = "empty"`. Kill switch off: `state = "disabled"`, `enabled = false`, no news read.
D8 Exposure chip (E9): look-through-derived entities (stock, sector, and asset class when `allocation.source == "analytics"`) get `exposure_pct` only when the stored `stock_holdings` section is fresh, `hide_headlines` is false and `coverage.covered_value_pct >= 50` (boundary 50.00 shows, 49.99 hides); then `exposure_as_of = holdings_as_of` and the text says "holdings as of Mon YYYY" and, when coverage is below 100, "from the holdings we can see". Holdings-derived entities (fund house, fund category, asset class from the Dashboard-bucket fallback, rates) are always shown, with no "as of". Text format (in `copy.py`): `About {p}% of your portfolio` + `, from the holdings we can see` when coverage is below 100 + ` (holdings as of {Mon YYYY})` for look-through entities; `{p}` is the 2-place percentage rounded `ROUND_HALF_UP` to one decimal with a trailing `.0` dropped (6.2, 30).
D9 Retention 14 days (E11), purged by the job after a successful ingest. No `--check-only` cron line (the Healthchecks heartbeat replaces it; plan T6 omits it). Ingest keeps Indian business sites only (plan T3 list, `config.py`): `moneycontrol.com`, `livemint.com`, `business-standard.com`, `thehindubusinessline.com`, and `economictimes.indiatimes.com` only for URL paths starting `/markets` or `/mf`; global allow-list (foreign names only, L18): `reuters.com`, `bloomberg.com`, `cnbc.com`, `marketwatch.com`. Subdomains match on a label boundary (`m.moneycontrol.com` yes, `fakemoneycontrol.com` no).
D10 Copy lives in one file, `app/services/news/copy.py`; title = the PDF title (E8 c) "News affecting top holdings"; the GDELT credit is NOT on the card (E14 B) and is carried in the response only for a future About page.

## 4. What exists (verified against the code on `feat/home-snapshot` and `feat/mf-backend`; read these, do not re-derive)
- Migrations: head is `0045` (`revision = "0045"`, `down_revision = "0043"`; 0044 does not exist). **`0044` must be numbered below its parent: `revision = "0044"`, `down_revision = "0045"`.** Alembic follows `down_revision`, not file order, so the chain is `0043 -> 0045 -> 0044` and `alembic heads` must then print `0044 (head)`. `tests/test_migrations.py::test_0045_is_head_and_sqlite_upgrade_then_downgrade_to_0043` asserts `heads.stdout.strip() == "0045 (head)"` and must change (section 6). Migration style: see `0041_stock_master_and_index_valuation.py` (Postgres-only parts guarded by `op.get_bind().dialect.name`); SQLite cannot `DROP COLUMN`, use `op.batch_alter_table`.
- Models: `app/models/__init__.py` imports every module (add `news`). `StockMaster` in `app/models/reference.py`: `isin` (PK, String(12)), `name`, `sector`, `pe_ratio`, `pb_ratio`, `as_of_date`, `source`, `pb_source`, `footnote`; no symbol column. `Scheme` has `amc_name`, `sebi_category`. `SchemeHolding`: `instrument_name`, `isin`, `asset_type` (`AssetType.EQUITY_INTERNATIONAL = "equity_international"`), `pct_to_nav`. JSON column pattern: `JSON().with_variant(postgresql.JSONB(astext_type=String()), "postgresql")`. Base: `app.db.base.Base`.
- Settings: `app/config.py` `Settings(BaseSettings)`, instance `settings`; env names are the upper-cased field names.
- Home pieces to IMPORT (never edit):
  - `app.api.home.get_now_ist() -> datetime` (aware IST)
  - `app.services.home.context.resolve_scope(db, user, member_id) -> ScopeContext(scope, member_id, member_ids: tuple[UUID], members: tuple[MemberOut], member_name)` (404 for a foreign member through `require_member`)
  - `app.services.home.schemas`: `HomeModel` (extra forbid), `Envelope` (scope, member_id, nav_as_of, partial, missing_funds, computed_at), `MissingFund`, `PlainDecimal`
  - `app.services.dashboard.holdings.compute_holdings(db, household_member_ids, *, scheme_ids=None, allow_stale_today=False, stored_only=False) -> list[HoldingRow]` (async; Home passes `allow_stale_today=True, stored_only=True`; HoldingRow has `scheme_id, scheme_name, amc_name, sebi_category, current_value, current_nav_date, nav_unavailable`)
  - `app.services.home.allocation.load_allocation(db, user_id, *, scope, household_member_ids, members: Sequence[tuple[UUID, str]]) -> Allocation` (async; `source`, `approximate`, `total_value`, `classes: tuple[ClassRow(key, label, status, value, percentage)]` with keys `equity, debt, gold, others`, `covered_pct`, `mix_as_of`; `members` = `[(UUID(m.id), m.name) for m in ctx.members]` in aggregate scope, `[]` in member scope, as `app/api/home.py::_allocation` does)
  - `app.services.home.allocation.bucket_class(sebi_category)`
  - `app.services.home.stored.load_fresh_sections(db, user_id, *, scope_key, sections, household_member_ids) -> dict[str, StoredSection(section, payload, computed_at)]` and `scope_key_for(scope, household_member_ids)`
  - stored `stock_holdings` payload keys: `rows[]` (`isin`, `instrument_name`, `sector_raw`, `asset_type`, `exposure_pct`, `exposure_value`, `contributing_funds[]` with `scheme_id`, `scheme_name`, `stock_weight_pct`), `holdings_as_of`, `coverage.covered_value_pct`, `hide_headlines`
  - `app.services.home.movers.load_sector_weights(db, scheme_ids, as_of) -> {scheme_id: {sector_label: pct_to_nav}}`
  - `app.core.decimal_utils.quantize_amount`.
- Do NOT call `get_lookthrough_table`, `compute_asset_allocation`, `compute_stock_holdings`: they call `compute_holdings` without `stored_only` (live price fetch and writes), which Home GETs forbid (section 6, item 7).
- Jobs: `scripts/jobs/*.py` pattern (`sys.path.insert`, `main_async(db)`, `main()` with `SessionLocal`, `raise SystemExit(code)`); tests load a job with `tests.scripts.test_background_jobs._load_job(name)` and use the `db_session` fixture. VM cron: `deploy/leapswitch/crontab.leapswitch` (`CRON_TZ=Asia/Kolkata`, `RUN=.../run-job.sh`, a line is `<cron> $RUN <job-name> scripts/jobs/<file>.py [args]`; the 05:40 to 06:35 window is memory-watched; 08:00 and 19:00 are taken). The `.env` on the VM reaches the container through `env_file: .env`.
- Home test harness to IMPORT (never edit):
  - `tests/api/home_fixture.py` `build_home_fixture(*, variant="base", now=FIXED_NOW, fund_count=4) -> HomeFixtureRuntime(client, household, engine)` with `.close()`, `HomeHousehold(user_id, asha_id, dev_id)`, `FIXED_NOW` (Fri 2026-10-23 18:30 IST), `uid(name)`
  - Base household: Asha (self) Large Cap 1210.00 and Flexi Cap 990.00, Dev Short Duration Debt 2002.00 and Gold ETF 1010.00, total 5212.00, all `amc_name = "Home Test AMC"`; stored sections written for 2026-10-23: allocation equity 2200 / debt 2002 / gold 1010, `stock_holdings` rows "Top Stock 1..5" at 5.00 each, `holdings_as_of 2026-09-30`, coverage 100.00
  - Pattern for goldens: `scripts/write_home_fixtures.py` and `test_generated_golden_fixtures_equal_live_routes` in `tests/api/test_home_routes.py`; statement counting: the `before_cursor_execute` listeners in the same file (copy the pattern, 3 versus 9 funds through `fund_count`).
- Local synthetic household for the calibration: `/home/ayush/s25/s25.db` (SQLite at migration 0043, 2 members, 9 funds: HDFC, Mirae, Axis x2, Kotak, UTI, Nippon, ICICI; **no** `stock_master`, analytics sections or disclosures). **Never modify it**: the script copies it. It has no `news_items` table; the calibration script does not need one.

## 5. Contract: the endpoint (exact; the front end is built against it, Gemini packet for Home T10)
`GET /household/aggregate/home/news` and `GET /household-members/{member_id}/home/news`; 401 without a session, 404 for a foreign member, otherwise always 200. Models in `app/services/news/schemas.py` (Pydantic v2, `HomeModel`, `Envelope` imported). Field names, order and optionality are final:
```python
Kind = Literal["stock","fund_category","fund_house","asset_class","sector","rates_macro","general"]
IconKey = Literal["banks_financials","it_tech","pharma_health","auto_ev","consumer_fmcg","energy","metals_mining","realty_infra","gold_silver","rates_rbi","funds_amc","markets","regulation","general"]
class NewsFundOut(HomeModel): scheme_id: str; name: str
class NewsItemOut(HomeModel):
    id: str; kind: Kind; tier: int; specific: bool; source: str; headline: str; url: str
    published_at: datetime; icon_key: IconKey; entity_label: str | None; reason: str
    exposure_pct: PlainDecimal | None; exposure_text: str | None; exposure_as_of: date | None
    funds: list[NewsFundOut]                     # at most 5, by value desc then name
class NewsTextsOut(HomeModel): title: str; subtext: str; disclaimer: str; about_credit_text: str; about_credit_url: str
class NewsResponse(Envelope):
    enabled: bool; state: Literal["items","empty","hidden","disabled"]
    feed_as_of: datetime | None; stale: bool; hidden: bool
    texts: NewsTextsOut; items: list[NewsItemOut]      # 0 to 3, in slot order
```
`nav_as_of` = latest `current_nav_date` of valued holdings; `partial`/`missing_funds` = holdings with `nav_unavailable`, named and sorted by name then id (as Home does); `computed_at` = the clock in UTC. Datetimes serialize UTC with `Z`. Illustrative example (the generated fixtures are authoritative; ids and numbers will differ):
```json
{"scope":"aggregate","member_id":null,"nav_as_of":"2026-10-23","partial":false,"missing_funds":[],"computed_at":"2026-10-23T13:00:00Z",
 "enabled":true,"state":"items","feed_as_of":"2026-10-23T12:15:04Z","stale":false,"hidden":false,
 "texts":{"title":"News affecting top holdings","subtext":"Headlines about companies your funds hold","disclaimer":"Headlines are from third-party sources and shown for information. They are not investment advice or research.","about_credit_text":"News index: GDELT Project","about_credit_url":"https://www.gdeltproject.org/"},
 "items":[
  {"id":"5f0c9d4e-0b2a-5c1e-9a57-3d1f2c8e7a10","kind":"stock","tier":1,"specific":true,"source":"Moneycontrol","headline":"HDFC Bank Q2 profit rises 11% as loan growth picks up","url":"https://www.moneycontrol.com/news/business/example.html","published_at":"2026-10-23T09:40:00Z","icon_key":"banks_financials","entity_label":"HDFC Bank","reason":"Mentions HDFC Bank, which your funds invest in","exposure_pct":"6.20","exposure_text":"About 6.2% of your portfolio (holdings as of Sep 2026)","exposure_as_of":"2026-09-30","funds":[{"scheme_id":"54b8755e-6b2b-5f4f-a8fe-b41125031af6","name":"Asha Large Cap"}]},
  {"id":"a1c2e3f4-1111-5222-8333-444455556666","kind":"fund_house","tier":3,"specific":true,"source":"Mint","headline":"HDFC Mutual Fund launches new index fund NFO","url":"https://www.livemint.com/money/example.html","published_at":"2026-10-23T07:05:00Z","icon_key":"funds_amc","entity_label":"HDFC","reason":"About HDFC, a fund house you invest with","exposure_pct":"30.00","exposure_text":"About 30% of your portfolio","exposure_as_of":null,"funds":[{"scheme_id":"fe06ac21-f8c7-5dbf-a877-5c703ddbcdef","name":"Asha Flexi Cap"}]},
  {"id":"b7d8e9f0-7777-5888-8999-aaaabbbbcccc","kind":"general","tier":7,"specific":false,"source":"Business Standard","headline":"Sensex ends flat as investors await RBI policy","url":"https://www.business-standard.com/markets/example.html","published_at":"2026-10-23T06:30:00Z","icon_key":"markets","entity_label":null,"reason":"General market and economy news","exposure_pct":null,"exposure_text":null,"exposure_as_of":null,"funds":[]}]}
```
**Golden fixtures** `backend/tests/fixtures/news/news_<case>.json` are generated from the real routes by `backend/scripts/write_news_fixtures.py` (copy `write_home_fixtures.py`: `REQUESTS`, `write_fixture_set(destination, write=True)`, parsed-JSON equality, deterministic ids and times, sets and restores `settings.news_enabled` / `settings.news_disabled_sources` itself), builder `tests/api/news_fixture.py` (wraps `build_home_fixture`, then inserts `NewsItem` rows with `uuid5` ids and fixed times, and rewrites AMC names and the stored `stock_holdings` rows to realistic ones).
  - Cases: `news_specific_three` (aggregate, now 2026-10-23 18:30 IST, one stock, one fund house, one general), `news_member_debt` (Dev: rates and gold items), `news_general_only` (variant `empty`), `news_low_coverage` (coverage 40.00: stock item has `exposure_pct` null), `news_stale` (feed 40 h old), `news_hidden` (feed 80 h old, `items: []`), `news_disabled`, `news_empty` (no rows).
  - Test `tests/api/test_news_routes.py::test_generated_golden_fixtures_equal_live_routes` compares read-only (as the Home one) and a second test asserts each item's key set equals exactly the 14 names above, so a field that moves, is renamed, added or dropped fails. A fixture is never hand-edited; regenerate and review.

## 6. Differences between the plan and the code (the code wins)
1. Plan `GET /home/news` (unscoped): the code scopes every Home route; two routes (D1).
2. Plan "0044 pre-assigned, stop if taken": 0044 is free, but the head is `0045`; chain `0044` after it (section 4) and change the one head assertion in `tests/test_migrations.py` (name `test_0045_is_head_...` becomes `test_0045_is_in_the_chain_and_sqlite_upgrade_then_downgrade_to_0043`, expected `"0044 (head)"`; the downgrade-to-0043 half stays).
3. Plan cites decision record v20; v21 is current (adds L50).
4. Plan says "legal page credit"/`frontend/src/features/legal/ About text`: no About page exists; the Terms and Privacy texts are versioned, hashed consent documents (`app/services/legal/registry.py`), so editing them forces every user to re-consent. **Do not touch `app/services/legal` or any front end**; the credit string goes in `copy.py` and the response (D10). Open for the owner (O2).
5. `tests/api/test_home_routes.py::test_openapi_registers_exactly_twelve_home_paths` asserts the set of paths containing `/home/` is exactly the twelve; adding news breaks it. Change only its `expected` set (add the two news paths) and rename it `test_openapi_registers_exactly_the_home_paths`. No other Home test changes.
6. Plan T6 mentions neither retention nor a per-source list; the artifact (E11) does: included (D2, D9). The artifact's `--check-only` cron line is not built (D9).
7. Plan T5 "from stored holdings and look-through": the look-through helpers are not GET-safe (section 4); use stored sections and `load_allocation` as Home does.
8. The plan puts the lists in `config.py`; the decision artifact says two YAML files: the plan wins (Python constants, no YAML). Plan test commands use `.venv/Scripts`; here it is the WSL venv (section 2).
9. Nothing in the code fills `stock_master.nse_symbol` (the daily stock job has the symbol in `symbols.get(isin)` but is out of scope): the column stays NULL; the matcher uses names and ISINs and uses `nse_symbol` only when present (O5).

## 7. File map
**Create:** `backend/app/models/news.py`; `backend/alembic/versions/0044_news_items_and_nse_symbol.py`; `backend/app/services/news/{__init__,config,copy,ingest,normalise,match,score,schemas}.py`; `backend/scripts/jobs/refresh_news.py`; `backend/app/api/home_news.py`; `backend/scripts/{news_calibration,write_news_fixtures,review_news_matches}.py`; tests `backend/tests/models/test_news_model.py`, `tests/functional_postgres/test_news_migration_0044.py`, `tests/services/news/{__init__,factories,test_ingest,test_normalise,test_match,test_score,test_copy,test_no_float}.py`, `tests/scripts/test_refresh_news.py`, `tests/api/{news_fixture,test_news_routes}.py`; fixtures `tests/fixtures/gdelt/*.gkg.csv`, `tests/fixtures/news/{labelled_headlines,sebi_categories}.json` and `news_*.json`.
**Modify (small, named):** `backend/app/models/__init__.py` (+`news`); `backend/app/models/reference.py` (`StockMaster.nse_symbol`); `backend/app/config.py` (D2 settings); `backend/app/main.py` (import and `include_router(home_news.router)` only); `backend/tests/test_migrations.py` (section 6 item 2 plus the new 0044 test); `backend/tests/api/test_home_routes.py` (section 6 item 5 only); `deploy/leapswitch/crontab.leapswitch` (T6 lines); `deploy/leapswitch/.env.example` and `backend/.env.example` (3 commented lines each: `NEWS_ENABLED`, `NEWS_DISABLED_SOURCES`, `HEALTHCHECK_NEWS_URL`); `database.md` (one dated entry, T2).
**Do not touch:** every other file, especially `app/api/home.py`, `app/services/home/*`, `app/services/dashboard/*`, `app/services/analytics/*` (including `stock_fundamentals_client.py`), `app/services/legal/*`, `alembic/versions/0001`-`0045`, `tests/api/home_fixture.py`, `scripts/write_home_fixtures.py`, `infra/`, `frontend/`, `Docs/`, `~/s25/s25.db`.

## 8. NB1: T2, T3, T4
**T2 Model and migration.** Tests first (`tests/test_migrations.py`, `tests/models/test_news_model.py`, `tests/functional_postgres/test_news_migration_0044.py`):
  - (a) `alembic heads` prints `0044 (head)`; `ScriptDirectory` shows `0044.down_revision == "0045"` and `0045.down_revision == "0043"`; upgrade head on a tmp SQLite gives table `news_items` (`id` Uuid PK, `source` String not null, `title` String not null, `url` String not null with unique `uq_news_items_url`, `published_at` and `ingested_at` DateTime(timezone) not null, `language` String(8) not null default `"en"`, `entity_tags` JSON(B) not null default `[]`, `tier` Integer not null with `CHECK (tier BETWEEN 1 AND 7)`, index `ix_news_items_published_at`) and `stock_master.nse_symbol` String(32) nullable; downgrade to `0045` removes both; downgrade to `0043` and upgrade head again work.
  - (b) Model: a tag list of dicts round-trips; a duplicate `url` raises `IntegrityError`; tiers 0 and 8 raise; `StockMaster(...).nse_symbol is None`.
  - (c) Settings defaults: `news_enabled is False`, the other two are `""`.
  - (d) Postgres test (skipped without `TEST_DATABASE_URL`, say so): upgrade, insert, `downgrade 0043`, upgrade.
Then implement; then the one head-assertion edit; write the `database.md` entry (what 0044 does, chain `0043 -> 0045 -> 0044`, Postgres test not run here if skipped).
**Checkpoint T2:** `"$PY" -m pytest -p tests.offline_http tests/test_migrations.py tests/models/test_news_model.py tests/functional_postgres/test_news_migration_0044.py -q ...` all green (Postgres file skipped), and `"$PY" -m alembic heads` = `0044 (head)`. Commit `feat(news): T2 news_items table, nse_symbol column, migration 0044 after 0045`.

**T3 Ingest** (`ingest.py`, `config.py` site lists and display names, fixtures `tests/fixtures/gdelt/`). GDELT 2.1 GKG layout, 27 tab-separated columns (as `news-dry-run/gdelt_dry_run.py` reads them): 0 record id, 1 DATE `YYYYMMDDHHMMSS` (UTC), 3 source domain, 4 URL, 25 translation info (empty means English), 26 extras containing `<PAGE_TITLE>...</PAGE_TITLE>` and sometimes `<PAGE_PRECISEPUBTIMESTAMP>YYYYMMDDHHMMSS</PAGE_PRECISEPUBTIMESTAMP>` (the precise-timestamp tag is from the GDELT codebook and **unverified** by the dry run: use it when present, valid and not after DATE; otherwise DATE).
  - Files: `http://data.gdeltproject.org/gdeltv2/<YYYYMMDDHHMMSS>.gkg.csv.zip`, 15-minute stamps.
  - Hand-write the fixtures from this table (committed TSV, about 14 rows, original headlines in the style of Indian business news, no copied real headlines); tests zip them in memory.
  - Contract (new code, names fixed):
```python
@dataclass(frozen=True) class RawArticle: url: str; title: str; domain: str; source: str; published_at: datetime; origin: Literal["indian","global"]
@dataclass class IngestStats: files_ok: int; files_missing: int; files_failed: int; rows_seen: int; rows_kept: int; skipped_non_english: int; skipped_site: int; skipped_dup: int
def window_stamps(now_utc: datetime, hours: int) -> list[str]            # newest first; newest = floor15(now_utc - 1h)
def iter_gkg_zip(data: bytes) -> Iterator[str]                            # a generator: decompressed text line by line, never whole
def parse_gkg_line(line: str, *, disabled_sources: Collection[str] = ()) -> RawArticle | None   # None = skipped (reason counted by the caller)
async def fetch_file(client: httpx.AsyncClient, stamp: str, *, tries: int = 3, retry_sleep: float = 2.0) -> bytes | None   # None after a 404 retry
async def ingest_window(client, now_utc, hours, *, disabled_sources=(), retry_sleep=2.0) -> tuple[list[RawArticle], IngestStats]
```
Tests (all with `httpx.MockTransport`):
  - (1) `window_stamps(datetime(2026,10,23,9,7,tzinfo=UTC), 1) == ["20261023080000","20261023074500","20261023073000","20261023071500"]`; `hours=5` gives 20 stamps.
  - (2) Fixture rows parse to the expected articles (assert the exact list).
  - (3) Non-English skipped: non-empty translation info, and an empty-info row whose title is Devanagari (a title with under 80 percent ASCII letters is skipped).
  - (4) Allow-list: the four sites and the ET path rule accepted, `/news/economy` on ET rejected, `m.moneycontrol.com` accepted, `fakemoneycontrol.com` rejected, a global-site row has `origin == "global"`, a disabled source is skipped.
  - (5) Dedup: the same URL twice in one file and across two files, and the same (domain, normalised title) with different URLs, give one article; URLs are stored without fragment and `utm_*` parameters.
  - (6) Title cleanup: HTML entities unescaped, whitespace collapsed, a trailing ` - Moneycontrol`-style publisher suffix removed, a row without `<PAGE_TITLE>` skipped.
  - (7) `published_at` rule above, with a precise timestamp later than DATE ignored.
  - (8) A 404 stamp is requested twice (retry), counted `files_missing`, the other files still read.
  - (9) A zip cut at 60 percent counts `files_failed`, no exception, other files read.
  - (10) `iter_gkg_zip` is a generator and a 60,000-row random-text zip is consumed with a `tracemalloc` peak under 25 MB (loose; if flaky on this machine report it, do not delete it).
  - (11) A network error three times counts `files_failed`.
**Checkpoint T3:** `... tests/services/news/test_ingest.py -q` green. Commit `feat(news): T3 GDELT ingest`.

**T4 Normalise and tag** (`normalise.py`, `config.py` tables, `tests/fixtures/news/{labelled_headlines,sebi_categories}.json`).
Contract:
  - `normalise_title(text) -> str` (NFKC, lower case, `&` to `and`, punctuation to spaces, collapsed)
  - `EntityTag(kind, key, label, tier, foreign=False)` frozen with `as_json()`
  - `Dictionaries` built by `load_dictionaries(db) -> Dictionaries` from `StockMaster` (name, ISIN, `nse_symbol` when not NULL), distinct `Scheme.amc_name`, the static category, sector, asset-class, rates and general tables, and foreign names from `SchemeHolding` rows with `asset_type == equity_international` (distinct names, top 300 by `market_value`)
  - `tag_title(title, dictionaries) -> list[EntityTag]`
  - `fund_house_key(amc_name) -> str`, `category_key(sebi_category) -> str | None` (None for gold and silver funds, which are asset-class `gold_silver`), `sector_key(label) -> str | None`: **the same three functions are used by the tagger and by the request-time watch list** so both sides agree (a test asserts it)
  - `store_items(db, articles, dictionaries, now) -> StoreResult(inserted, skipped_untagged, skipped_global_untagged, skipped_existing)` (item `tier` = the minimum tag tier; an Indian-site article with no tag is not stored; a global-site article is stored only with a foreign-stock tag; existing URLs are skipped in batches of 500 so it is portable; ids are `uuid5(NAMESPACE_URL, url)`; `ingested_at = now`).
Rules:
  - stock aliases come from `stock_master.name` minus legal suffixes (Limited, Ltd), at least 4 characters unless in a short allow-set (`itc`, `ongc`, `sbi`...)
  - group names (`tata`, `adani`, `birla`, `hdfc`, `bajaj`, `reliance` alone) never tag a stock alone
  - `AMBIGUOUS_ALIASES` (`titan`, `trent`, `eternal`, `jio`...) need a context word from the same title (shares, stock, Q1-Q4, results, Sensex, Nifty, NSE, BSE, the company's product words)
  - a fund house needs a fund context (`mutual fund`, `amc`, `asset management`, `fund house`, `nfo`, `mf`)
  - gold and silver are one asset class `gold_silver` (E18) with negative phrases (`gold medal`, `silver medal`, `gold standard`)
  - rates need phrases (`repo rate`, `rate cut`, `bond yield`, `inflation`, `rupee`, `RBI`), never a bare "rate"
  - general: Sensex, Nifty, SEBI, AMFI, GDP, budget (tier 7).
  - `ICON_FOR` in `config.py` maps each tag to one of the 14 icon keys (sector tag to its sector icon, stock to its sector's icon else `markets`, house and category to `funds_amc`, gold to `gold_silver`, rates and debt to `rates_rbi`, SEBI to `regulation`).
Tests first:
  - (1) stock by name with `nse_symbol` NULL, symbol match only when the column is set, ISIN as the tag key;
  - (2) ambiguity: "Titan submarine search ends" no tag, "Titan shares jump after Q2 results" stock tag, "Eternal love story" none, bare "Tata" or "HDFC" no stock, "HDFC Mutual Fund launches NFO" gives fund house HDFC and no stock;
  - (3) fund house needs context;
  - (4) category phrases ("small cap funds", "ELSS", "liquid funds") and every string in `sebi_categories.json` (write the standard SEBI categories, about 40) maps to a key or an explicit None without raising;
  - (5) gold and silver positives and the three negatives;
  - (6) rates positives, "run rate", "strike rate" negatives;
  - (7) sector and general tags; a headline with a stock tag and a general tag has tier 1;
  - (8) foreign tag with a dictionary holding "Apple Inc" and "Microsoft Corp";
  - (9) speed: 5,000 titles against 2,000 aliases in under 5 s;
  - (10) `store_items`: inserts, second run inserts 0, untagged skipped, tier is the minimum, global rule;
  - (11) **labelled set**: at least 150 headlines you write yourself (about 10 per topic, 25 negatives with look-alike traps), `expected` as (kind, key) pairs; overall precision at least 0.95 and recall at least 0.80 and per-topic precision at least 0.95 for gold, rates, financials sector, categories; print and record every number in the report; if unmet, improve aliases and context words, and **if still unmet after one honest round report the numbers; never lower the bars or drop headlines**;
  - (12) `fund_house_key`, `category_key`, `sector_key` agree between tagger output and a watch-list entity built from the same strings.
**Checkpoint T4:** `... tests/services/news/test_normalise.py -q` green. Commit `feat(news): T4 normalise and tag`. Then run `... tests/test_migrations.py tests/services/news -q` once and record it.

## 9. NB2 part 1: T5 Match and score (request time, read-only)
`match.py` builds the watch list; `score.py` is a pure function. Names fixed:
```python
@dataclass(frozen=True) class WatchEntity: kind: Kind; key: str; label: str; exposure_pct: Decimal; chip: Literal["none","holdings","lookthrough"]; funds: tuple[tuple[str, str], ...]
@dataclass(frozen=True) class WatchList: entities: tuple[WatchEntity, ...]; majority_class: str | None; coverage_pct: Decimal | None; holdings_as_of: date | None
def build_watchlist(db, user, ctx, holdings, allocation, sections, *, today) -> WatchList     # read-only; D4 top-5 then minimum
def select_items(rows: Sequence[NewsRow], watch: WatchList, now_utc: datetime, *, slots: int = 3) -> list[Selected]   # pure, no DB; D5 and D6
```
`NewsRow(id, url, title, source, published_at, tags: tuple[EntityTag, ...], tier)` and `Selected(row: NewsRow, entity: WatchEntity | None, specific: bool)` are plain frozen dataclasses, so `score.py` tests need no database. Entity sources: stock = stored `stock_holdings` rows (domestic and `equity_international`, key = ISIN or `name:<normalised>`); fund category and fund house = valued holdings grouped by `category_key` and `fund_house_key`; asset class `gold_silver` and `debt` = `allocation` classes `gold` and `debt`; sector = sum over funds of value x `load_sector_weights` percent / total value, label through `sector_key`, excluding "Other"; rates_macro = the debt percentage, key `rates`. The route's whole news read is one `news_items` query for `published_at >= now - 72h` and one aggregate for `feed_as_of`; statement count must not grow with the number of funds.
Tests first, with plain factories (`tests/services/news/factories.py`: `row(...)`, `watch(...)`); now = 2026-10-23T13:00Z; each is given/when/then:
  - R1 ladder: items stock (2 h old), fund category (1 h), fund house (30 min), gold (10 min), general (5 min); watch has all four entities; result is [stock, category, house].
  - R2 empty top tiers: watch has gold and a sector; items gold, sector and general only: result [gold, sector, general].
  - R3 newest first inside a tier.
  - R4 two items about HDFC Bank: only the newer, the next slot goes down a tier.
  - R5 24 h boundary: a specific item 23 h 59 m old is specific, 24 h 01 m old is not eligible as specific and is replaced by general; a general item 71 h old is eligible, 73 h old is not.
  - R6 top 5 and minimum: 7 stocks at 9, 8, 7, 6, 5, 4 and 3 percent gives only the first 5 entities; a stock at 0.99 is out and 1.00 in (boundary of D4); 6th is out even above the minimum.
  - R7 majority: gold at 60.00 puts the newest gold item in slot 1 above a newer stock item; gold at exactly 50.00 does not; debt at 55 with no debt-class item falls to the ladder; equity at 70 does not override.
  - R8 debt-only user: watch debt 100, category `short_duration` 70, house X 100, items a rates item and a general one: result [rates item, general].
  - R9 no match: empty watch gives general items only.
  - R10 foreign: an item tagged foreign stock Apple appears only when the watch holds that key.
  - R11 chip: look-through entity with coverage 49.99 has `exposure_pct` None, 50.00 has it, with "holdings as of Sep 2026" from `holdings_as_of`, and the "from the holdings we can see" wording below 100; a fund house always has its percentage and no "as of".
  - R12 ties: equal `published_at` orders by `id`; two calls give identical output.
  - R13 sector arithmetic: fund A 600 with {Financial Services 40, Information Technology 20}, fund B 400 with {Information Technology 50} gives financials 24.00 and IT 32.00.
  - R14 `build_watchlist` on `build_home_fixture()` family scope: house `home test` 100.00; categories `large_cap` 23.22, `flexi_cap` 18.99, `short_duration` 38.41 (gold ETF is not a category); asset classes gold_silver 19.38, debt 38.41; stocks "Top Stock 1..5" 5.00 each; rates entity 38.41 (check three of these by hand in the report).
  - R15 disabled sources are excluded; a user with no holdings gets an empty watch.
**Checkpoint T5:** `... tests/services/news/test_match.py tests/services/news/test_score.py -q` green. Commit `feat(news): T5 watch list and selection`.
**CALIBRATION, then STOP (E20: the owner locks the numbers, you do not).** Write `backend/scripts/news_calibration.py <db_path>` (copy to a temp file, never write the source; pattern of `scripts/home_synthetic_gate.py`) and run it on `/home/ayush/s25/s25.db`. For aggregate and each member it prints, per kind, every entity (label, exposure percent), its rank, whether it survives top-5 and the current minimum, and the count of survivors; fund house, category and asset class are real, stock and sector print `n/a (no disclosures in this file)`. Print the `MIN_SIZE_PCT` table in force. The script is part of the T5 commit. Paste the full output in the report block `CALIBRATION`, write "STOPPED FOR OWNER" and **do not start T6 until the orchestrator replies `CALIBRATION: KEEP` or `CALIBRATION: SET <kind>=<value>...`**. On the reply, change only `MIN_SIZE_PCT` (and its comment to "locked <date> by owner"), re-run the T5 tests, add `fix(news): T5 locked thresholds` as a separate commit, and continue.

## 10. NB2 part 2: T6 Job
`scripts/jobs/refresh_news.py` (`main_async(db)`, `main()`, `--hours N` default 5, `--dry-run`).
Order:
  - (1) `settings.news_enabled` false: log "news disabled", exit 0, no ingest, no ping
  - (2) `ingest_window` with a real `httpx.AsyncClient(timeout=60, follow_redirects=True, headers={"User-Agent": "Unifolio news refresh (contact: ops)"})`, 1 s pause between files
  - (3) `load_dictionaries`, `store_items`, commit
  - (4) purge `published_at < now - 14 days`, commit
  - (5) log one line `news_refresh files_ok= missing= failed= rows= kept= inserted= purged= seconds= peak_mb=` (`resource.getrusage`, guarded for platforms without it)
  - (6) exit 0 and ping Healthchecks only when `files_ok >= 1` and the commit succeeded; exit 1 when `files_ok == 0` or on any exception (rollback, log, no ping).
Partial failure (some files missing or failed) exits 0 with a logged warning. `_ping(url)` is a module function: GET with 10 s timeout, no body, no query, never user data; a ping error is logged and never changes the exit code; an empty URL skips it. `--dry-run` reads and tags, writes nothing, never pings, and prints counts, 20 sample titles per tag kind and 20 untagged Indian-site titles (the dark-launch review aid).
Tests first (`tests/scripts/test_refresh_news.py`, `_load_job`, `db_session`, `ingest_window` and `_ping` monkeypatched):
  - kill switch skips ingest and ping
  - success path pings exactly once and inserts
  - `files_ok == 0` exits 1 with no ping
  - an exception exits 1 with no ping and a rolled-back session
  - partial failure exits 0 and pings
  - empty URL does not call `_ping`
  - a ping that raises still exits 0
  - purge removes a 15-day-old row and keeps a 13-day-old one
  - `--dry-run` leaves `news_items` empty
  - running twice inserts each article once
Crontab test (read the file): exactly one line `15 7,10,13,16,19,22 * * *  $RUN news-refresh scripts/jobs/refresh_news.py --hours 5` and one `30 23 * * *  $RUN news-refresh-catchup scripts/jobs/refresh_news.py --hours 26`, no news line inside 05:40 to 06:35, none at 08:00 or 19:00; add a comment block above them in the file's style (windows, why those minutes). Add the three env lines to both `.env.example` files, commented, with a one-line meaning each.
**Checkpoint T6:** `... tests/scripts/test_refresh_news.py -q` green. Commit `feat(news): T6 refresh_news job, cron lines, kill switch, heartbeat`.

## 11. NB3: T7, T8, T9 preparation
**T7 Endpoint** (`home_news.py`, `schemas.py` per section 5, `main.py` registration; also create `copy.py` with the T8 constants now, because the response carries them). Flow: `resolve_scope`, `compute_holdings(..., allow_stale_today=True, stored_only=True)`, `load_allocation`, `load_fresh_sections(sections=["stock_holdings"])`, `build_watchlist`, one query for items in the last 72 hours excluding disabled sources, `select_items`, map to models. Kill switch off returns `state: "disabled"` before any news read.
Tests first (`tests/api/test_news_routes.py`, fixtures from `news_fixture.py`, `monkeypatch.setattr(settings, "news_enabled", True)`):
  - 401 on both routes
  - 404 for a foreign member id
  - kill switch off gives `enabled false`, `items []`, `state "disabled"` and no `news_items` statement executed
  - `empty` with no rows
  - stale at 36 h 01 m and not at exactly 36 h
  - hidden at 72 h 01 m with `items []` and `state "hidden"`
  - member scope uses the member's own stored sections
  - disabled source hidden at request time
  - family scope gives the three items of `news_specific_three`
  - low coverage hides the chip
  - every route statement is a SELECT (no writes) and patching every `compute_*` of `app.services.analytics`, the snapshot rebuild and `dispatch` to raise leaves the route passing (copy the Home test)
  - statement counts equal for 3 and 9 funds
  - OpenAPI: both paths present, tagged `home`, `exposure_pct` typed string (no number)
  - golden and key-set tests (section 5)
  - the one edited Home OpenAPI test passes.
Generate the goldens with `"$PY" scripts/write_news_fixtures.py`, then review: hand-check one stock exposure and one fund-house percentage against your own arithmetic and say which in the report.
**Checkpoint T7:** `... tests/api/test_news_routes.py tests/api/test_home_routes.py -q` green; then `... tests/api tests/services/news tests/services/home tests/services/dashboard tests/scripts/test_refresh_news.py tests/test_migrations.py -q`. Commit `feat(news): T7 GET home/news (aggregate and member), response models, golden fixtures`.
**T8 Copy** (`copy.py` was created in T7; T8 adds `test_copy.py`, the wording pass and the review list): constants `TITLE`, `SUBTEXT` ("Headlines about companies your funds hold", E8 c), `DISCLAIMER` (the E8 draft text in section 5), `ABOUT_CREDIT_TEXT`, `ABOUT_CREDIT_URL`, the reason templates per kind (neutral: "Mentions {entity}, which your funds invest in"; "About {entity} funds, a category you invest in"; "About {entity}, a fund house you invest with"; "About gold and silver, which your funds invest in"; "About the {entity} sector, where your funds invest"; "Interest rates and the economy can affect debt funds like yours"; "General market and economy news"), the exposure-text templates (D8). Tests: the response `texts` equal the constants; no reason template contains a word from `buy sell hold accumulate recommend target bullish bearish outperform opportunity` (whole-word, case-insensitive; the E8 c subtext is exempt and asserted verbatim); every string is in `copy.py` and nowhere else (grep test on the news package for the title and disclaimer literals). Add to the report a list "F5 copy review list" of every string, for the owner and counsel. Commit `feat(news): T8 copy strings and disclaimer`.
**T9 is the owner's staging check; you prepare it.** Write read-only `backend/scripts/review_news_matches.py` (prints counts per tier and per tag kind from `news_items`, 20 sample headlines per tag, rows per source, the oldest and newest `published_at` and the `ingested_at` range; untagged titles are not stored, so for those it tells the reader to use the job's `--dry-run`) and put this command sheet in the report for the owner (VM, `/opt/unifolio/deploy/leapswitch`, root): (1) `git pull`, then `docker compose run --rm backend alembic upgrade head`; (2) dry run: `docker compose run --rm -T backend python scripts/jobs/refresh_news.py --dry-run --hours 5`; (3) real runs twice by hand with `NEWS_ENABLED=true` in `.env` and `HEALTHCHECK_NEWS_URL` set: `docker compose run --rm -T backend python scripts/jobs/refresh_news.py --hours 26` then `--hours 5`, watching `/usr/bin/time -v` memory and duration; (4) `docker compose run --rm -T backend python scripts/review_news_matches.py`; (5) after review, `crontab deploy/leapswitch/crontab.leapswitch`. Commit `feat(news): T9 prep, review script`.

## 12. Commits and checkpoint lines
One commit per task in the order T2, T3, T4, T5 (+ lock commit), T6, T7, T8, T9-prep, message `feat(news): T<n> <what>` as above, each only after its checkpoint is green and `git diff --check` is clean; never commit a red or partial task. The final report carries, per task, a line: `CHECKPOINT T<n> | command | <N> passed, <M> skipped | files changed: <list> | commit <short hash>`.

## 13. Stop conditions (stop, commit nothing further, report under Open questions)
T1 line PENDING or NO-GO; baseline red or head not `0045`; `0044` already exists; a shape in section 5 cannot be produced from the real code; an edit outside the file map seems necessary; any existing test other than the two named must change; the Postgres roundtrip fails; labelled-set bars unmet after one honest round (report numbers, continue only if the orchestrator says so); calibration reached (section 9); a test needs live network; anything in this handoff contradicts the code in a way not listed in section 6.

## 14. Report (fill in at the end, one fenced block)
```
SONNET REPORT — ui-redesign — NB1/NB2/NB3
Date/time:    Branch/HEAD:    Baseline (git log -1, alembic heads, baseline pytest last line):
1. TASK STATUS (T2..T9 prep; STOPPED FOR OWNER at calibration yes/no):
2. CHECKPOINT LINES (one per task, section 12 format):
3. FILES (added / changed, with line counts):
4. TESTS: RED list per task; final command and last line for each; labelled-set precision/recall (overall and per topic); the CALIBRATION output in full
5. HAND CHECKS (which numbers recomputed by hand, with the arithmetic):
6. DEVIATIONS (mechanics only) and DIFFERENCES FOUND beyond section 6:
7. OPEN QUESTIONS / BLOCKERS:
8. F5 COPY REVIEW LIST and T9 COMMAND SHEET:
9. CONFIRMATIONS: no push/merge/other-branch git writes: ___  edits only in the file map: ___  only the two named existing assertions changed: ___  ~/s25/s25.db sha256 before/after: ___  no float in news code: ___  no live network used: ___
```

## 15. Orchestrator notes (not for the worker)
**Verify after the session:**
  - (a) scope diff `git diff --stat leapswitch-redesign..feat/home-news` against section 7, and `git diff` of `tests/test_migrations.py` and `tests/api/test_home_routes.py` shows only the two named edits
  - (b) `alembic heads` is `0044 (head)`, SQLite `upgrade head`, `downgrade 0045`, `downgrade 0043`, `upgrade head` round trip, and if Docker Postgres is available run the Postgres file
  - (c) full backend suites: `tests/api tests/services tests/scripts tests/test_migrations.py` (excluding the `xlwt` file)
  - (d) **differential checks**: an independent oracle of `select_items` (about 40 lines, written by me from D4 to D6) over 1,000 random watch lists and item sets must agree exactly; an independent brute-force substring tagger over the same dictionaries must agree with `tag_title` on the labelled set and on 2,000 generated titles; the exposure chip against hand arithmetic on `build_home_fixture`
  - (e) **injected-bug checks**, each must turn a test red: swap category and fund-house tiers; `>=` to `>` in the minimum size and the 24 h and coverage 50 boundaries; top 5 to top 6; drop the same-entity rule; reverse newest-first; majority `>` to `>=`; equity majority override on; remove the ambiguity context for `titan`; remove the gold-medal negative; keep untagged global-site items; show a foreign-stock item to a non-holder; request-time disabled-source filter removed; stale/hidden boundaries; ping on failure; purge cutoff; `nse_symbol` required
  - (f) fixtures guard: `news_*.json` regenerate byte-identical twice, and a renamed/dropped/added field fails `test_generated_golden_fixtures_equal_live_routes` and the key-set test
  - (g) no write and no recompute on the news routes
  - (h) read the F5 list and send it to the owner and counsel
  - (i) log D1 to D10 in the register (C116 onward), add the NB record to the delegation log, update `session.md`, `database.md` check, `Docs/PRDs/Database-Schema-Unifolio.md` (`news_items`, `stock_master.nse_symbol`), and copy `news_*.json` to the Home front end for packet T10 once reviewed; a Sonnet review of the PR before it is raised (Opus only if the owner asks, C111); Codex as adversarial reviewer on matching and scoring (C115).
**Open owner decisions (defaults in brackets):**
  - O1 `news_enabled` default in code [False; the VM `.env` turns it on at T9]
  - O2 where the GDELT credit lives, since no About page exists and Terms and Privacy cannot change without forcing re-consent [string in `copy.py` and the response only]
  - O3 reading of L41 [only gold or debt majority, one slot; equity majority no override]
  - O4 E20 numbers, calibrated and shown before locking, including the sector 10 percent that E20 does not give
  - O5 fill `stock_master.nse_symbol` from the daily stock job (one line, `row.nse_symbol = symbol`) [not now]
  - O6 the ET path prefixes and the global allow-list sites [as in D9]
  - O7 stale and hidden are feed-level [yes]
  - O8 14-day retention [yes]
  - O9 no response cache [none; revisit at the integration timing run]
  - O10 E20 says sector-only headlines are general while L17 and L40 make sector a kind [sector kept as tier 5 with its own minimum]
  - O11 equity-market headlines are general [yes]
  - O12 the heartbeat is one URL for both the 3-hourly and the catch-up runs [yes]
  - O13 `--check-only` line dropped [yes]
**Known risks:** the GKG `PAGE_PRECISEPUBTIMESTAMP` tag and the exact column positions are taken from the codebook and the dry-run script, not verified on a real file here; GDELT titles can include publisher suffixes beyond the stripped patterns; single-stock coverage is thin by nature (ladder and general fallback are the mitigation); advice-wording and publisher-copyright exposure stay with counsel (N5 B: live from day one, kill switch kept); `get_now_ist` and the 15-minute per-worker holdings cache can make the card and the other Home sections differ by one price date (register L10).

## 16. Prompt for the owner to paste into the Claude Code terminal (WSL, any directory)
```
You are the Sonnet worker for the Unifolio Home News backend (runs NB1 to NB3, one session).
Read /home/ayush/wt/docs/Docs/orchestration/ui-redesign-NB-news-backend-handoff.md completely, then follow it exactly. It is self-contained.
First check the "T1 RESULT" line in its header: if it says PENDING or NO-GO, stop and tell me. Then do section 2: create the worktree ~/wt/home-news on branch feat/home-news, run and record the baseline; if anything is red, stop.
Tests first and red first, no live network, no float, additive only, no edits outside the file map, no push or merge. One commit per task, message "feat(news): T<n> <what>", and one CHECKPOINT line per task.
Do T2, T3, T4, T5. After T5 run the calibration script and STOP: paste the printed numbers and wait for my "CALIBRATION: KEEP" or "CALIBRATION: SET ..." reply before T6. Then T6, T7, T8 and the T9 preparation.
Stop and report (do not improvise) on any conflict between the handoff, the plan, the decisions and the code.
Finish with the report block from section 14, filled in, as your last message.
```
