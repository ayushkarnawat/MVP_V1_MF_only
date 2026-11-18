# Session state — 2026-11-04

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history — the
permanent, append-only record is `log.md` (session-by-session),
`backend.md`/`database.md` (backend/schema changes only), and `decisions.md`.
Older "Latest"/"Previous" sections were dropped from here on 2026-11-03; their full detail lives in `log.md` and, for the UI
redesign, in `Docs/orchestration/ui-redesign-decisions-register.md`.

## Latest (2026-11-18): release program waves 1 to 5 started (wave 1 set up, nothing built or committed in code yet)
The program planned on 17 Nov (`Docs/orchestration/2026-11-17-program-execution-and-deployment-plan.html`; map: `2026-11-17-wave-0-handoff-for-managers-claude.md`) is now being run by the manager's Claude (this orchestrator). Four lane worktrees exist on branches cut from `leapswitch-redesign`: `D:\unifolio-b-journey` (`batch/b-journey`), `D:\unifolio-c-hygiene` (`batch/c-hygiene`), `D:\unifolio-a-numbers` (`batch/a-numbers`), `D:\unifolio-l-audit` (`batch/l-audit`). Backend tests run from a lane with `D:\Unifolio code\backend\.venv-win\Scripts\python.exe -m pytest` (imports the lane's own code, checked); frontend checks run through `Docs/orchestration/cr-r6-fe-check.sh` with `CR6_SRC`/`CR6_DST` set per lane.
- **Wave-start drift found and recorded** (plans vs repo): the 429 reply cannot be an `HTTPException` (it becomes a `JSONResponse`; `parseErrorDetail` drops extra keys, so `features/auth/api.ts` reads them on a 429); `AuthEntryFlow.tsx` is in `features/auth/`, not `redesign/`; no `MemberNotInFileDialog.test.tsx` (its tests are in `import/prompts/prompts.test.tsx`); ledger folio field is `folio` (`InvestmentWithdrawalEntry`, `analytics/schemas.py`); `load_category_pool` and `get_category_peers` are async; LibreOffice is not installed (RK-9, CA-6 need it; to be installed when RK-9 starts).
- **Colours:** `Docs/Unifolio Colour Palette.pdf` is the bible; extracted to `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`. The plan's `#22C55E` and `#15803D` are both in the palette (button default; pressed and positive text), so the B-12 green-switch check is closed. One PDF slip noted there (positive border label).
- **Client address behind the proxy, verified on both hosts** (`2026-11-18-client-address-verification.md`): AWS has an internet-facing ALB in append mode with private tasks; LeapSwitch Caddy v2.11.7 replaces the header. B-2 keeps "last entry" and adds tests and a docstring fix.
- **Owner decisions of 18 Nov:** Antigravity (Gemini) sessions up to four at once, as much frontend work as sensible goes to Gemini (Codex stays one task at a time, backend); adversarial reviews only where most necessary (risky security, data or numbers tasks, and the whole-batch review), the orchestrator reviews every other diff itself; Batch L's server queries are run by this Claude as the manager's Claude (read-only); the observation-backlog review waits until the program ends; Batch B screen red tests are written by the orchestrator.
- First Codex task: `Docs/orchestration/2026-11-17-b1-structured-429-handoff.md` (B-1, B-3), relayed 18 Nov, report pending; next in the Codex queue B-2 (`2026-11-18-b2-address-guard-handoff.md`, after B-1 is committed) then C-5 (`2026-11-18-c5-folio-number-handoff.md`). Wave 1 plan of work: `Docs/orchestration/2026-11-18-wave-1-lane-plan.md`.
- **State at the end of 18 Nov (nothing pushed):** red tests and contract code committed on `batch/b-journey` (B-4 contract green; B-5 9 red, B-8 12 red, B-7a/B-10 14 red) and `batch/c-hygiene` (C-2 2 red, C-6 store green, C-7 33 red, C-9 25 red). Gemini packets ready for B-6 (`ag-b6`), B-8 (`ag-b8`), C-2 (`ag-c2`), C-7 (`ag-c7`), C-9 (`ag-c9`) and B-10 (clone made after B-8 merges). Not yet written: B-7b (onboarding layout tests; the chosen workbook layout is two-column goal chips and a grouped option list, to be checked in a browser first), B-9 (emails) and B-11 (email assets). Found while writing tests: leaving `/import` resets a household of two or more to Family Combined, so C-9 exempts the import-done navigation; the workbook fit test for onboarding cannot run in jsdom (no layout), so B-12's gate is a browser measurement at five window sizes; the 429 seconds ride as a property on the error so no other screen's wording changes.
- **Priority 1 below:** the 10 Nov 2026 date has passed; the outcome of that monthly run is not recorded in this checkout. Confirm with the owner before treating it as open or closed. Also unknown here: whether the 10 Nov "QA fixes round 2" lane was merged (no `qa-fixes-2-lane` branch is visible).

## Latest (2026-11-09): staging VM network fixed, QA-fixes deploy still waiting
The staging VM's public interface was detached by mistake; fixed and verified (new public IP `45.64.107.180`, DNS and `unifolio-web` restored, spare interface removed). **Use the hostname `ls-redesign.unifolio.in` and run SSH from WSL; run the pre-flight in `Docs/orchestration/2026-11-09-runbook-staging-network-and-access.md` before any staging task.** The QA-fixes deploy (`2026-11-06-staging-deploy-guide-qa-fixes.md`) is paused at Step 3 done / Step 4 not started: the VM is at `39a67410`, clean, 0 recompute rows, 9.8 GB free; origin's `leapswitch-redesign` has moved since (re-run Step 1 against the final head); the owner's yes is needed before Step 4 and again before Step 6. No CI run exists for the head (CI only runs on pull requests); the owner accepted the local gate evidence instead.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## ⚠ FIRST — Priority 1 open item (deadline 10 Nov 2026, 06:00 IST)

**Fund-manager factsheet access gaps (attribute 04).** When asked "what's left / what do I need to do", lead with this.
- 10 fund houses need a monthly hand import (ICICI, Kotak, HDFC ×2 files, Axis, Bandhan, Invesco, WhiteOak, ITI, JM, Trust; 689 live funds); 5 have no factsheet (Bajaj, AlphaGrep, IL&FS, Lakshya, Monarch; 33 funds).
- Evidence so far (28 Oct, from the LeapSwitch VM's Indian IP): the monthly job processed 34 of 40 automatic houses (Angel One 403, HSBC timeout, Sundaram 500, three stale-month); HDFC 403 and JM 406 still blocked from that address. The missed-month alert is now built (Run 2); the run of 10 Nov 06:00 IST needs a read-only check afterwards (a scheduled reminder exists).
- Detail and the ordered to-do table: `DEFERRED_FEATURES.md` (top section). Background and options: `Docs/orchestration/subproject1-execution/a04-factsheet-access-gaps.html`.

## Latest (2026-11-10): QA fixes round 2 built on `qa-fixes-2-lane`, front end only, not deployed

From the 9 Nov QA report: View new funds pop-up overflow fixed (names wrap), "N duplicates skipped" added to the Import complete summary line, Enter on the Head of Family code steps. Front end suite 5986 passed, type check clean, no migration (Alembic 0053). Left out by the owner: the email wording, the stray Go to dashboard pop-up, the post-import landing page. Next: the owner's go to merge the lane into `leapswitch-redesign` and run `Docs/orchestration/2026-11-10-staging-deploy-guide-qa-fixes-2.md`, then the checklist `2026-11-10-staging-qa-checklist-qa-fixes-2.md` and the new QA report.

## Latest (2026-11-04): UI round 2 is built and tagged; D.1 done; the staging deploy guide is drafted, nothing deployed

**Branch:** `ui-round-2` (shared integration branch; Alembic head **0053**, `down_revision` `0052`). Stages S0 to S6 are built and tagged `ui-s0-done` to `ui-s6-done` (local tags on the merge commit `1aad77c2`, which merged `release/change-requests` into `ui-round-2`). `leapswitch-redesign` is frozen at `8dc7d9ba` until the owner's final merge. Staging runs `release/change-requests` (Alembic 0052) until the UI round 2 rollout.

**Done on the backend:** Home greeting, Home allocation funds, new funds after an upload, add-as-family (with the Self PAN guard), `benchmark_label`, the six life goals (migration 0053), the sign-up notice flag; baselines and review gates recorded in `Docs/orchestration/ui-run-log.md` and `delegation-log.md`. Full backend suite on the merged head: 5755 passed, 5 failed (known, they read the untracked `backend/.cache/amfi_navall/nav_all.txt`), 6 skipped. D.1 (this documentation update) is done.

**Open:**
1. **Final merge and S7** (owner's explicit go): merge `ui-round-2` into `leapswitch-redesign` as a reviewed merge commit, then run `Docs/orchestration/2026-11-04-staging-deploy-guide-ui-round-2.md` (backup first; stop old backend, deploy, migrate 0053 at once, restart), then the QA checklist (Task 7.2, not yet written) and close-out (7.3).
2. **Parked decision, owner:** the opening-cost convention for a partly sold opening lot (3 of 88 synthetic gate runs fail, older than this round): `Docs/investigations/2026-11-03-p20-opening-cost-convention-gate-failure.md`, `DEFERRED_FEATURES.md`.
3. Accepted risks: the Self PAN guard has no row lock; `0053` drops `users.primary_goal` in the same release that stops using it (the guide stops old tasks first); the staging timing check on real data at S7 (`measure_home_staging.py`).
4. The change-requests release items below (QA by the intern, the CA Excel, owner decisions O6 and O7, the hand imports) are unchanged.

## Latest (2026-11-03, evening): the change requests release is DEPLOYED to staging; QA and the CA Excel are next

**Branch:** `release/change-requests` (worktree `D:/unifolio-release`, pushed to origin as a new branch), deployed commit `0dfd1261` (first deploy `e45ecfe7` at 17:40 IST). The VM's `/opt/unifolio-redesign` is on this branch; Alembic head **0052** on the VM. `leapswitch-redesign` is frozen shared history; UI round 2 continues on `ui-round-2` and takes the release in with a merge (prompt and pack: `Docs/orchestration/2026-11-03-prompt-for-ui-round-2-after-release.md`, `2026-11-03-intern-handover-after-staging.md`). Full evidence: `Docs/orchestration/2026-11-03-staging-deploy-record-change-requests.md`; what came after and what is open: `2026-11-03-post-staging-work.md`; O6 and O7 readings for the owner: `2026-11-03-o6-o7-readings.md`.

**Done on the VM:** backup (`unifolio-20261103T120419Z.sql.gz`), migrations 0046 to 0052, `FRONTEND_BASE_URL` set to `https://ls-redesign.unifolio.in`, forced recompute twice (5 min 21 s and 5 min 11 s; 17 scopes x 15 sections, 0 failed), benchmark job (87 of 87 after the NSE echo-name fix), factsheet capture (37 of 40 houses), four `--this-month-only` imports, Sundaram reader fix, book-value job (829 of 914) and the daily stock job (805 filing-based P/B), two cron lines, L7 (28 of 28 indices pass). Found and fixed on the VM: the Nifty LargeMidcap 250 echo name, the Sundaram manager reader. Honest slips: about 4 minutes of old code on the new schema while the disk guard stopped the first deploy; `deploy.sh` stops at its `:previous` retag when the old image is gone.

**Open:** the manual QA (`2026-11-03-manual-qa-checklist.md`); timing slightly over the 10% rule on a few scripts and the fund page first call 86 to 108 ms against 100 (re-measure after 23:00 IST); the CA Excel (a worker is building the export script); Priority 1 above; the hand imports for the ten houses (owner's word).

## Exact next steps, in order

1. **Manual QA** of the deployed release (`Docs/orchestration/2026-11-03-manual-qa-checklist.md`; sections 8 to 10 need real inboxes). The owner decides who does it.
2. **Send the intern block** (`2026-11-03-prompt-for-ui-round-2-after-release.md`) so UI round 2 merges `origin/release/change-requests`.
3. **CA Excel** (six funds, all three Motilal momentum funds, Direct and Regular, 30 Sep 2026 holdings): review the export script, run it on the VM, build the workbook, verify (runbook Phase 5), hand over. Never commit the `.xlsx`.
4. Owner decisions owed: O6 and O7 (`2026-11-03-o6-o7-readings.md`, notably the Motilal index funds' "Debt Component" main manager and ICICI Aggressive Hybrid counted at 0.0% equity); the hand imports for the ten hand-import houses (their files are on the VM); who does QA.
5. Small repo fix before the next deploy: `deploy.sh` must not stop at the `:previous` retag, and the wrapper must stop when the deploy step fails.
6. **Priority 1** runs as a separate track (10 Nov 06:00 IST); then check the four `--this-month-only` houses after the 10 Nov job.

## Still open, carried forward from earlier phases

A dead `HoldingsTable.tsx` field reference; a non-index-seek-bounded SQLite scan in `category_ranking.py` (Postgres has been live in staging since 2026-09-09); an ARIA IDREF gap on the SIP tab switcher (accepted limitation); the backend API domain naming decision (§19/§22 Phase 5); Profile plan T8 and T10; the Individual Fund release staging run and its owner sign-offs (`Docs/orchestration/2026-10-29-orchestrator-handoff-7.md`; folded into the combined deployment above) and the housekeeping branch deletions awaiting the owner's word; the 2026-10-20 Chandra Tripathi fix (PR #8) awaiting manager review. Scorer V2 planning is paused (2026-10-22). Deferred features: `DEFERRED_FEATURES.md`.
