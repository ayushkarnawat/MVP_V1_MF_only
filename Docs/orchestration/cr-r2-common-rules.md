# Run 2 common rules (read once; every `cr-r2-*` handoff points here)

Run 2 of 7. Plan: `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md` (Revision 3), section "Run 2". Commit prefix `cr-r2:`. The orchestrator (Claude) commits; Codex implements in `~/cr-run-N` (a clone synced by the orchestrator) and never runs `git add` or `git commit`.

## Setup the worker needs (the same as Run 1)
- Python: `/home/delladiti/cr-venv/bin/python -m pytest <files>` from `backend/`. Frontend: `export PATH=/home/delladiti/.nvm/versions/node/v20.20.2/bin:/usr/bin:/bin` first (Windows npx otherwise), then `npx --no-install vitest run <files> --maxWorkers=2`, `npx --no-install tsc -b`, `npx --no-install oxlint`, `npx --no-install vite build`.
- Real PDFs are never committed; use the small text snippets in `backend/tests/fixtures/factsheets/`. The real files are at `C:\Users\Dell\Desktop\Unifolio\Factsheets\` (WSL `/mnt/c/Users/Dell/Desktop/Unifolio/Factsheets/`) for local read-only checks only.

## Method per task (short)
1. Read the task's text in the plan (Global Constraints, Review Focus and the task section), then the code it names. 2. Tests first, run them, show each fails for the stated reason. 3. Implement. 4. Run the touched tests **and every other test file that reads a name you changed** (grep the old names, fields and section keys across backend, frontend, print, phone, Home, fixtures). 5. Report short.

## Lessons from Run 1 (these cost real rework; follow them)
- **Never reword an existing message, reason code or label** you were not asked to change. Run 1 broke an older test by rewording the importer's `stale_month` message.
- **Edits outside the Files list** (fixtures, shared renderers, `guards.test.ts`): ask first, or list them separately in the report with the reason. `guards.test.ts` may change only its file count and expected-file list when files are added or deleted, never a guard rule.
- **Old stored payloads** (no new fields) must render as an "updating" state or as before, never crash or blank. Print and phone views stay as they are, except where a task names them; a shared renderer whose wording becomes false for new payloads gets a payload-shape-dependent sentence, not a rewrite.
- **Additive**: new fields have defaults; section keys unchanged (`ranking`, `category_ranking`, `valuation`, `score` and the rest).
- **Decimal** only, strings in payloads; plain words on every label (no "TRI", "proxy", "fallback", "excluded: no data").
- If a rule is ambiguous (a role string, a threshold, a label), **list the real data you found, state the reading you chose, and flag it**; do not decide silently.
- Known failures at the Run 2 start, not yours: 7 backend tests (2 in `tests/services/analytics/test_benchmark.py` "switches", 5 needing the missing local file `backend/.cache/amfi_navall/nav_all.txt`) and one load-sensitive frontend test (`OverviewPage.test.tsx`).

## Report (keep it short)
Failing-test counts before; final counts with the exact commands; `git diff --stat`; decisions the handoff did not cover; every file edited outside the Files list and why. No narrative of consumers that did not change.

## Gate before DONE
The orchestrator re-runs the touched tests and reads the diff; the Run 2 review gate (`/codex:adversarial-review` over `<start commit>..HEAD`, background; the owner types `/codex:status` and `/codex:result`) has no unresolved high or medium finding. **Gate G2: no Run 2 task starts until the timing baselines exist** (`Docs/orchestration/2026-10-31-g2-timing-run-steps.md`) or the owner says to start without them.
