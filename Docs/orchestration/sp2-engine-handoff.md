# Handoff: sp2-engine (look-through engine ingestion, Sub-project 2 plan 1)
**Status:** IN_PROGRESS — Pass 0 (Task 0 done, Task 12 capture running); Run 1 not yet issued, 2026-10-13
**Parent plan:** `Docs/analytics/plans/2026-10-10-sub-project-2-lookthrough-ingestion-plan.md` (binding, as revised 2026-10-13: read its **Revision 2026-10-13** block first, then the tasks)
**Spec:** `Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md` · execution map: `Docs/analytics/artifacts/subproject2-execution/engine.html`
**Orchestrator:** Claude Code (pre-flight, capture pass, WSL verification, review, commits, staging guide) · **Worker:** Codex (one run per prompt, test-first, self-review, prints a report)
**Review baseline:** HEAD when the user pastes the prompt (`git log -1 --format=%h`, put it in the report)

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming the run (**Run 1** … **Run 5**).
2. Codex reads this file and the named plan tasks, implements them in order, test-first, self-reviews, and ends by printing the **CODEX REPORT** (template at the bottom) in one fenced code block.
3. The user pastes the report to Claude Code, which re-runs the touched tests in WSL, reviews the diff, fixes small findings, and commits **one commit per plan task** (never pushed).
4. Run N+1 is issued only after Run N is reviewed and committed.

## Runs

| Run | Plan tasks | What | Gate reviewer |
|---|---|---|---|
| **Run 1** | 1, 2, 3, 4, 5 | Schema + migration, Parse (tuned on real fixtures), Normalize, Write (+ sum check), registry (51 rows) | Opus |
| **Run 2** | 6, 7, 8 | Orchestrator, Wayback (+ Canara `link_pattern`), isolation tests | Codex |
| **Run 3** | 11 | JSON_API Locate, four dedicated functions, index-sheet names, magic-byte check, registry completion, WhiteOak | Codex |
| **Run 4** | 13, 14, 15 | Manual intake, refresh-loop rework, retention + failed-file archive | Opus |
| **Run 5** | 9, 10 | Job script, Terraform text | Codex |

Tasks 0 and 12 are Claude-only (network). Task 16 (documents) is already done. Execution order in the plan: `0, 12, 1–8, 11, 13, 14, 15, 9, 10`.

## Where things stand — 2026-10-13

- Task 0 (AWS egress): done by the user's manager, result in `Docs/orchestration/sp2-egress/aws-result.txt`. Every source reachable from the jobs' address that is reachable from a laptop; one open item (Wayback CDX returned 503 once from AWS).
- Task 12 (capture pass): fixtures land in `backend/tests/fixtures/portfolio_disclosures/` with a `README.md`; the findings are in `Docs/analytics/investigations/2026-10-13-sub-project-2-capture-log.md`. **Where the capture log contradicts a registry entry or a header/section assumption in the plan, the capture log wins** — adapt minimally and record it under "Deviations".
- Latest migration is `0038_nav_history_wider_nav`. Read the real head with `alembic heads` immediately before writing the migration (F1); it should be `0039`.
- Staging is not touched in any run. Everything is deployed once, at the end.

## Pre-flight findings (Claude, checked against the code 2026-10-13)

- `enum_column`, `FundFamily`, `build_families`, the `db_session` fixture (SQLite, foreign keys enforced) and `tests/test_migrations.py` all exist as the plan assumes.
- **`openpyxl` and `xlrd` are not installed by `casparser`** (the plan's claim was wrong). The user has installed `openpyxl==3.1.5`, `xlrd==2.0.2`, `xlwt` into the Windows venv. Task 2 Step 1 still pins them in `requirements.txt` (and `xlwt` in `requirements-dev.txt`).
- `tests/test_migrations.py::test_alembic_upgrade_creates_all_tables` lists tables by name: add `disclosure_batches` and `scheme_holdings` (plan Task 1 Step 7a).
- Registry keys were corrected against AMFI's names: `"The Wealth Company Mutual Fund"` and `"Monarch Mutual Fund"` (not "Wealth Company" / "Monarch Networth Capital"). Do not revert them.

## Rulings from the capture pass (2026-10-13) — binding for Run 1

Read `Docs/analytics/investigations/2026-10-13-sub-project-2-capture-log.md` (cross-cutting section first, then the per-AMC sections for any AMC you touch). It overrides the plan's registry text and parser assumptions where they differ.

1. **Weight scale (new behaviour, Tasks 2 and 4).** `% to NAV` is a fraction in many files (0.0567 = 5.67%) and percent points in others, even within one AMC. Detect the scale **per sheet** before the sum check (total of the sheet's weights near 1.0 means multiply by 100; prefer the sheet's own Grand Total row when present). The 90–101% band applies after scaling and stays a named constant. Never loosen it.
2. **Stop at `GRAND TOTAL`.** Rows after it (annexures, second tables with ISIN-like rows) are never holdings. When a sheet has a Grand Total row, reconcile to it instead of summing section subtotals (negative derivative short legs sit outside it).
3. **Real-fixture test.** Add a parametrized test over every holdings sheet of every fixture in `backend/tests/fixtures/portfolio_disclosures/` (skip `Index`/non-holdings sheets by the plan's rule). It must assert: no crash, a non-empty holdings list, the scaled weights inside the band. Sheets that legitimately fall outside (overnight/liquid/ISIN-less funds, Choice Overnight, Monarch Overnight, Helios Overnight) go in a named allowlist **with a one-line reason each**; list every allowlisted sheet in the report. Parse bytes by magic, not extension (OOXML under `.xls`, a ZIP wrapping an xls for Aditya Birla).
4. **Header vs data offsets.** Several files have an unlabelled leading code column or ISIN before the name (HDFC). Locate columns from the header row's own cell positions and ISINs by pattern per row when the header is offset (UTI). Report each fixture that needed special handling under "Fixture findings".
5. **Registry rows (Task 5).** Use the capture log's corrected hosts, patterns and shapes. Two key names are fixed: `The Wealth Company Mutual Fund`, `Monarch Mutual Fund`. **Monarch is monthly** (host `www.monarchamc.in`), not fortnightly-only. **Bandhan is a `MANUAL` row** (its listing is encrypted; pending your manager's confirmation) — keep its fixture for parser tests. Rows whose Locate needs JSON/POST chains or a page-embedded payload (Task 11: Franklin, AlphaGrep manifest, Tata, Jio, quant, ICICI, Abakkus, WhiteOak, Navi, PGIM, Sundaram, Bajaj, UTI, SBI, LIC, Axis, Trust, Mirae, ABSL, Bank of India, Taurus) get their `kind` and a note quoting the capture log, nothing more in Run 1. Update the plan's registry tests to assert the corrected values (they are Task 5's own tests).
6. **Not in Run 1:** Index-sheet name translation, JSON_API Locate, WhiteOak row, manual intake, anything in Tasks 6–15.

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Never `commit`, `add`, `rm`, `mv`, `reset`, `checkout`, `stash`, `rebase`, `push`.

**Never touch:** `infra/`, existing files under `backend/alembic/` (Task 1 *creates* one new migration file, nothing else there), `backend/.env`, real CAS PDFs, `Docs/CAS Files/`, `Docs/` (the plan and artifacts are Claude's). No Postgres, no AWS, no staging — the migration is tested on SQLite via `tests/test_migrations.py`; Claude runs it on Postgres.

**Existing code is read only.** Import `FundFamily`/`build_families` from `amfi_factsheet_client`, `commit_off_loop` from `app.db.session`; never edit `amfi_factsheet_client.py`, `fund_manager_*`, `allocation.py` or `holdings.py`.

**Follow the plan literally.** If the code contradicts it in *mechanics* (a name, an import path, a fixture field), adapt minimally and record under "Deviations". If it would change *behaviour, a formula or an interface*, stop that part, record it under "Open questions", and continue with what doesn't depend on it.

**Test-first.** Write the test → run it → see it fail for the right reason → implement → green.

**Tests: only the named files, never a full suite.** Backend on Windows, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`. Before each run's final pass, `git grep` the tests for every symbol you changed and add the matching test files.

**Project rules** (`AGENTS.md`): `Decimal` for money and weights (no float maths); LF line endings, UTF-8; no new dependencies beyond the plan's pins; the engine's sync `Session`-inside-`async def` pattern is intentional (batch job only, never a request handler).

## Approaches considered and rejected (don't re-litigate)

- **Per-run second migration for `asset_type`** — rejected (Q8): the column and the 8-value enum are in Task 1's migration.
- **Dropping a batch whose weights don't sum to ~100%** — rejected (Q9): the batch is marked `FAILED` and its rows are kept; consumers read `WRITTEN` only. Band is 90–101%, a named constant.
- **Playwright / proxies / fingerprinting in production** — rejected (decision 2026-10-12).
- **Keeping the original files for every batch** — rejected (Q11): only `FAILED` batches' files are archived (Task 15).
- **A manual-AMC table** — rejected: `AWAITING_MANUAL_UPLOAD` batches are the queue (Task 13).
- **Matching on `sheet.sheet_name` only** — insufficient for code-named sheets (Bank of India `YB01`…): Task 11 adds the Index-sheet lookup. Do not build it in Run 1.

## Open questions (Codex: flag back, don't guess)

- If a fixture in `backend/tests/fixtures/portfolio_disclosures/` has a header spelling, section header, unit text or total/sub-total row the plan's parser patterns do not handle: list the file, the exact text, and what you changed — fix the pattern, never loosen the 90–101% band.
- If `FundFamily`/`build_families` differ from the plan's usage.
- If any existing test other than `test_migrations.py` breaks because two tables or an enum were added — list it; fix only fixture data.

---

## Self-review (before printing the report)

1. `git diff --stat` and `git status --porcelain`: every changed or new file belongs to this run's tasks. Undo anything else.
2. `git diff --cached --stat` is empty.
3. Review the diff as a hostile reviewer against the plan's **Review Focus** (including the 2026-10-13 additions): ambiguous sheet names resolve to no match; Crores and Lakhs multiply, an unknown unit raises; non-holdings sheets are skipped silently; `Sub Total` never becomes a holding; `"2.50%"` text parses; `% to AUM` header matches; a batch whose weights total outside 90–101% is `FAILED` with its rows kept; every parsed row has an `asset_type` (default `OTHER` before the first recognised section header).
4. Fix what you find, re-run the affected tests, list every finding in the report.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — sp2-engine — Run <1..5>
Run date/time: <…>    Environment: Windows    Python: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task <n>: DONE | PARTIAL | BLOCKED — <one line>   (one line per task in this run)

2. FILES (grouped by plan task, so the orchestrator can commit per task)
   Task <n>: <files>
   New (untracked):     <from git status --porcelain>
   Staged (must be empty): <git diff --cached --stat>

3. TESTS (exact command + last 3 lines of output)
   RED:   <command> → <failed as expected because …>   (per task)
   GREEN: <command> → <N passed …>
   Extra files added via grep: <files>

4. DEVIATIONS FROM THE PLAN (mechanics only)
   - <task/step> — said <…>; code/fixture needed <…>; file:line — why

5. FIXTURE FINDINGS (Run 1)
   - <fixture file> — <what the parser had to handle that the plan did not say>

6. OPEN QUESTIONS / BLOCKERS
   - <question> — what I'd need decided

7. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — <finding> — FIXED | NOT FIXED (why)

8. CONFIRMATIONS
   - No git write commands used: YES/NO
   - Full suites not run: YES/NO
   - Docs/, infra/, existing alembic files untouched: YES/NO
   - amfi_factsheet_client.py / fund_manager_*.py / allocation.py unchanged: YES/NO
```

## Run 1 — FIX ROUND 1 (2026-10-13, after the Opus review; Codex builds, same uncommitted tree)

Run 1 passed WSL (1032) and the Postgres 0038→0039→0038→0039 round trip. The Opus review returned CHANGES NEEDED. Fix **all** of the following test-first, in the same files, then re-run the Run 1 test files and print a CODEX REPORT (same template; section 4 "Deviations" = the fix round's interface changes). Evidence scripts (run from `backend/` with any python that has openpyxl/xlrd): `/tmp/claude-1000/-mnt-c-Users-Dell-Desktop-MVP-v1-MVP-V1-MF-only/d9d231cb-0a46-4984-b30e-ba7952224e69/scratchpad/{recon,dump,neg,unit}.py` (WSL path; if you cannot read it, reproduce from the descriptions).

**High**
- **H1 (parsing.py ~177).** A row is never a section header if it has an ISIN match or numeric market value and weight. ICICI Banking & PSU (BANPSU) has 9 real central G-sec rows literally named "Government Securities" (e.g. IN0020250018, 28,597 lakh, 3.56%) currently dropped (sheet sum 90.29 vs Grand Total 100, still WRITTEN). Add a test on that fixture sheet.
- **H2 (writer.py ~35 + fixture test ~399).** A declared Grand Total must be **reconciled to the parsed rows, not substituted for them**. Rule: the signed sum of all parsed holdings (after per-sheet scaling, derivative rows included once H3 types them) must match the declared total within a named constant tolerance (start 1.5 percentage points) AND the declared total must itself sit in the 90–101% band, else the batch is FAILED (rows kept). Where a sheet legitimately cannot reconcile (memo exposure rows outside the Grand Total), say so in a named allowlist with a one-line reason per sheet and list them in the report; do not widen the tolerance to hide failures. The fixture test must assert the reconciled sum for every Grand-Total sheet (today it only asserts "no error, non-empty"). The writer test that bakes in the old behaviour (`test_declared_total_controls_check…`, ~:131) must be rewritten. Sheets the reviewer found that would wrongly be WRITTEN today (holdings sum vs declared 100): DSP DAAF 83.09, ESF 66.93, ARBITRAGE 32.31; ICICI BANPSU 90.29, ARBITRAGE 114.94; Tata TMAOF 90.07, TAF 34.95; ABSL BSLIF 96.91; quant qMES non-derivative 115.74.
- **H3 (parsing.py ~33-42, 184-187).** Derivative short legs must be typed `DERIVATIVE`: an "ARBITRAGE" section header matches nothing today, and ISIN-less futures rows ("Tata Steel Limited Oct26", sector "Stock Futures"; Tata "…LTD^") inherit the equity type. Add: ISIN-less rows whose sector or name shows a futures/options contract (month-year suffix; sector "Stock Futures"/"Index Futures"/options) or that have negative quantity inside an equity section become DERIVATIVE; an ARBITRAGE/hedge section header sets DERIVATIVE only for such rows, not for the long equity. Add a commodities section pattern: physical gold/silver ("…COMMODITY" rows, Tata TMAOF) → `GOLD_SILVER`. Known negatives to cover: DSP ARBITRAGE 121 rows (−66.15, typed OTHER), DSP DAAF −16.91 and VALUE −1.03, Tata TAF 132 rows (−63.52 typed EQUITY_DOMESTIC), Tata TMAOF −9.92.

**Medium**
- **M1 (~175).** `^`, `$`, `*` in the weight cell mean weight 0 whatever the market value (ICICI marks tiny weights with `^`; 14 ICICI Arbitrage equities such as Oil India at 157 lakh and a BANPSU G-sec at 24.04 lakh are dropped today).
- **M2 (~195).** The scale decision and the 90–101% band use the same total (circular). Decide the scale from the row values (max |w| ≤ 1 and sum ≈ 1) and require a declared total's scale to agree; a text "100%" Grand Total over fraction rows must not leave weights 100× too small as WRITTEN.
- **M3 (matching.py 52-60).** The fuzzy fallback must be vetoed when number tokens or key words differ (GOLD/SILVER, ETF/INDEX/FOF, "100" vs "50" vs "Next 50"). Verified wrong picks: "ICICI Prudential Silver ETF FOF"→Gold ETF FOF (0.867); "HDFC Nifty 100 Index Fund"→Nifty 50 Index (0.923); "SBI Nifty 50 Index Fund"→SBI Nifty 50 ETF (0.824). An ambiguous or vetoed match returns None.

**Low (do these too; they are small)**
- **L1** the `.xls` reader skips `derivative*`/`performance` sheets like the `.xlsx` reader. **L2** the `.xlsx` reader stops at the first terminal-looking row only **after** the header row (a banner above the header must not drop the sheet). **L4** Canara's `link_pattern` gets an `exclude_pattern` for the mid-month fortnightly file (`BP-…-15th-September-2026` shape) — Task 6's date filter is planned but the registry should not rely on it alone. **L5** allowlisted fixture sheets must still assert their expected FAILED status and their numeric sum (not just a non-empty reason string).
- **L3 (accepted, document only):** a failed re-parse of an existing `(scheme, as_of_date)` batch replaces it with FAILED (consumers read WRITTEN only, so a fund drops out of analytics rather than serving wrong data). Task 6 never re-parses a WRITTEN source URL. Make the writer also update `amc_name` on an existing batch.

**Still forbidden:** widening the 90–101% band, proportional reweighting, fabricated weights. Report any fixture sheet that stays FAILED with its numbers.

## Run 2 — Tasks 6, 7, 8 (2026-10-13; Run 1 committed `2ab4daa`…`2204c7d`)

Plan: Tasks 6 (orchestrator), 7 (Wayback + Canara `link_pattern`), 8 (isolation tests). Read the plan's Revision block, Tasks 6–8 and the capture log's cross-cutting section plus the sections for HDFC, Canara, Wealth Company, 360 ONE, Old Bridge, Helios, Unifi (filename shapes).

**What Run 1 changed that the plan's Task 6 code does not know (binding adaptations):**
1. `parse_workbook(data) -> list[ParsedSheet]` now has `ParsedSheet.declared_total` (optional) and keeps holdings on a sheet error. The refresh loop must pass `declared_total=sheet.declared_total` to `write_disclosure_batch`, and a sheet with `error` **and** holdings is written as a `FAILED` batch (with `parse_errors`), not skipped. A sheet with an error and no holdings is only recorded in `parse_errors`.
2. ZIP bundles: use `extract_zip_members(data)` and parse each member with `parse_workbook`; a bad member never stops the others. Detect format by magic bytes (`sniff_workbook_format`), never by extension (OOXML under `.xls`, a ZIP wrapping an xls).
3. `write_disclosure_batch(db, family, as_of, amc_name, source_url, holdings, match_method, confidence, parse_errors=None, declared_total=None)`; `declared_total_reconciles` is public in the writer. The 90–101% band and the 1.5-point tolerance are constants; do not touch them.
4. `match_scheme_name(raw_name, families)` returns `(family, method, confidence)` or `None`; ambiguous or vetoed means `None`, which the loop reports as unmatched (alerts come in Task 14).

**Capture-log facts Task 6/7 must respect:**
- Embedded-JSON links: HDFC's cached page, Wealth Company (paginated escaped JSON) and 360 ONE (React payload) carry **absolute URLs inside JSON**, with `\/` and `\u0026` escapes. `_extract_links` must unescape and still find them. Test with a trimmed real snippet.
- HDFC's plan landing URL has no Wayback captures; the capture log gives the URL that has one (`…/statutory-disclosure/portfolio/monthly-portfolio`, last capture 2026-09-10, which lists the **August** files). Use the capture log's URL in the registry/test. Whether HDFC should instead fetch a direct URL pattern is an open decision (orchestrator will settle it); build Task 7 as planned and do not invent a direct-pattern path.
- Canara: the month folder is the **upload** month (`2026/10` holds September data); `link_pattern` filter plus the Task 5 `exclude_pattern` apply to the prefix search; the CDX call is `limit=-50`, so say in a test that older months may be absent.
- `_filename_as_of_date` must parse the real filename shapes in the capture log: `30st`/`30th` ordinals (Helios), `DDMMYYYY` (Unifi), `Sept_26`/`September 2026`, `30-Sep-26`, `30-09-2026`. Add a parametrized test with the real file names from the log. No guessing: an undated file returns `None`.

**Not in Run 2:** per-file skip, day-10/20 alert gating, one-file-at-a-time generator (Task 14); JSON_API Locate, Index-sheet names, WhiteOak (Task 11); manual intake (Task 13); job script/Terraform (Tasks 9–10). Task 6 keeps the plan's list-returning `_locate_and_fetch`; Task 14 reshapes it.

**Tests:** MockTransport only (no live network, Codex has none). Windows command as before; add every test file that `git grep` shows importing the changed modules. Report format as the template; add section "Fixture/log findings" if a capture-log filename or link shape needed handling.

## Run 3 — Task 11a (2026-10-13; Run 2 committed `114a0f2`) — JSON/POST Locates

**Why the plan's Task 11 is split.** The plan assumed one generic `JSON_API` Locate plus four dedicated functions. The capture log shows ~25 AMCs with ~15 different mechanisms. Task 11 is therefore built as a **per-AMC locator registry**: `custom_locator: str | None` on the registry row names an entry in a `_CUSTOM_LOCATORS` dict of `async def(client, entry, scheme_rows) -> list[LocatedFile]`; a small generic `_locate_json_api` (GET/POST + `response_json_path` + `documents` regex + `rewrite_host`, per the plan's Step 3–4) serves the AMCs it fits. Run 3 = **11a**, Run 3b = **11b** (next).

**Run 3 scope (11a): AMCs whose file list comes from a plain HTTP request chain.** Franklin Templeton (JSON GET per fund id from `sitemap.xml`; filter `contentGrouping=='Dis-Portfolio-Monthly'`, file on widen.net, date from `dctermsTitle` not `frkReferenceDate`), Axis (token + `get-scheme-documents`, key spelled `docuementURL`, filter `documentName` on "Monthly Portfolio"), LIC (form POSTs returning HTML; consolidated route exists), SBI (`GetSchemePortfolioSheets` returning an HTML fragment), Trust (`GetData`, `fileurl` with a space, apex 307→www), Mirae (`GetDownloadsData`, per-scheme, 302 for a missing file), Bank of India (host `www.boimf.in`, `folderName:"MONTHLY PORTFOLIO"` case-sensitive), Taurus (GET with `field_hy_portfolio_*` ids; half-yearly, September 2026 not published, files are xlsx), Aditya Birla (API → ZIP wrapping one legacy xls; host rewrite `abcscprod.azureedge.net`→`mutualfund.adityabirlacapital.com`; file name varies by month so take it from the API), Navi (scrape WP nonce, POST with header `WP-NONCE`, `category=884`, `financial_year`, `value`, `type=Monthly`), PGIM (POST `…/brochure/published/disclosure` with the body in the log), WhiteOak (Strapi `cms.whiteoakamc.com/api/scheme-portfolios`; **User-Agent gate**: the project's Chrome UA works, curl-style UAs get 403), ICICI Prudential (`apimf.icicipruamc.com/nms/v1/downloads/files`, then `https://www.icicipruamc.com/blob<url>`; the API serves an F5 JS-challenge HTML page to an incomplete header set — assert a JSON content type and treat HTML as blocked, never try to bypass), UTI (`get-consolidate-portfolio-disclosure?year=&month=` → `rows[0].doc` ZIP; holdings member is one sheet with `SCHEME CODE0xxSTARTS/ENDS` blocks: Run 1's parser already returns `EXPOSURE:<code>` logical sheets; map a block to a scheme **only** through an exact, tested name source from the log, otherwise leave unmatched and report it).

**Not in Run 3:** page-payload/state AMCs (Jio, quant, Abakkus, Zerodha, Unifi, Tata, Sundaram, Bajaj, AlphaGrep manifest, Wealth Company, 360 ONE, Motilal sitemap) and Index-sheet name translation → Run 3b. HDFC discovery (open decision). Bandhan stays `MANUAL`.

**Rules:** each locator takes a trimmed **real response** from the capture log as its test fixture (quote the log section in a comment); MockTransport only; the registry row sets `kind`, `custom_locator`, `file_shape`, `cadence` (`half_yearly` for Taurus; Monarch is monthly), and the "NEEDS LIVE VERIFICATION" note is replaced by the captured literal request; `_is_locate_implemented` gains the new kinds; add the invariant test from the plan (every non-manual row implemented **after Run 3b**, so in Run 3 assert only for the rows you completed and list the rest). A locator that cannot produce a dated file returns `[]` (no_file_found), never today's date. Do not reshape the refresh loop (Task 14).

---

## Round log (orchestrator appends after each report)

| Round | Run | Result | Notes |
|---|---|---|---|
| — | Pass 0 | done 2026-10-13 | Task 0 egress OK (Wayback 503 once from AWS, CDX OK from dev later); Task 12 committed `fef039e`. |
| 1 | Run 1 | built 2026-10-13 (Codex, baseline `083d5d6`) | Tasks 1–5 reported DONE; WSL 1032 passed; Postgres round trip clean. Opus review: CHANGES NEEDED (3 High, 3 Med, 5 Low) → Fix round 1 section above. Nothing committed yet. |
| 1 | Run 1 fix | committed 2026-10-13 | Fix round 1 (Codex) + orchestrator fix: declared total reconciles on the signed or the hedge-balanced non-derivative basis (allowlist 23→7 sheets); scoped Sonnet re-review found one masking case (netted-futures arbitrage with equity dropped), closed by a net-risk-exposure guard; FOF singular. Commits `2ab4daa` T1, `5d8b148` T2, `1aa3701` T3, `6ba24b6` T5 (+T4 writer files, swept in by a git-lock retry), `2204c7d` review fix. WSL 1070 passed; Postgres round trip clean. |
| 2 | Run 2 | built + committed 2026-10-13 (Codex, baseline `6c72823`) | Tasks 6–8 in one commit (one shared file pair). WSL 95 passed. Sonnet review: 1 High, 4 Med, 3 Low. Fixed by the orchestrator: H1 prefix search now requires .xls/.xlsx/.zip (a dated PDF could beat or break every workbook), M2/F18 `_download_workbook` returns None for a body without workbook magic bytes, L6 parse_errors are per sheet (one empty broken sheet no longer FAILs good neighbours). Tests added/updated. |

**Carried forward (not fixed in Run 2, by design):**
- *Task 14:* M3 rerun re-downloads every file (per-file skip by `source_url` before download); M4 a partially fetched AMC counts as done and per-file failures are silent (alerts + per-file skip fix this); M5 a failed newest download in SINGLE_WORKBOOK mode silently falls back to an older month under the older as-of date (alert `stale_fallback`); L7 with a `scheme_hint` only the first holdings sheet of a file may match (a second sheet overwrites the first batch for the same scheme and date) — guard it.
- *Task 11:* **Wealth Company** (97 files) has opaque undated attachment names, so filename dating returns nothing; use the page payload's `uploadDate`/name (capture log). HDFC discovery (direct URL pattern vs Wayback) is still an open decision for the manager.
- *Task 7 unverified:* `web/2id_/` is not pinned to the CDX timestamp; all cached-page link hosts are rewritten to `cdn_domain`; `keep_all` keeps only the single newest date, so one stray later-dated file discards the month — revisit with Task 14's per-file logic.
