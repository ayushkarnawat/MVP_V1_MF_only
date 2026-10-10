# Handoff: a14-investment-withdrawal
**Status:** IN_PROGRESS — Run 1 DONE and committed (`976bb2f`, `bf0e6cd`, `b3dc253`); Run 2 (frontend, Tasks 4–6) ready to issue, 2026-10-09
**Parent plan:** `Docs/superpowers/plans/2026-10-09-attribute-14-investment-withdrawal.md` (binding, as revised 9 Oct — read its "Revised 2026-10-09" note and Global Constraints first)
**Spec:** `Docs/analytics/2026-10-08-attribute-14-investment-withdrawal-spec.md` · explainer: `Docs/orchestration/subproject1-execution/a14-investment-withdrawal.html`
**Orchestrator:** Claude Code (plan, rulings, WSL verification, review, commits, staging, docs) · **Worker:** Codex (builds one run per prompt, self-reviews, prints the report)
**Review baseline:** HEAD when the user pastes the prompt (`git log -1 --format=%h`, put it in the report)

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming the run (**Run 1** or **Run 2**).
2. Codex reads this file and the named plan tasks, then implements them in order, test-first.
3. Codex self-reviews (section "Self-review"), fixes what it can, and ends by printing the **CODEX REPORT** (template at the bottom) in one fenced code block.
4. The user pastes the report back to Claude Code, which re-runs the tests in WSL, reviews the diff, commits each task separately (the plan's commit steps), and either closes the run or writes a fix-round prompt.

## Runs

| Run | Plan tasks | What |
|---|---|---|
| **Run 1** | 1, 2, 3 | Backend: compute module, response schemas, 8th `_SECTIONS` entry + `test_recompute.py` update |
| **Run 2** | 4, 5, 6 | Frontend: `bar-chart.tsx`, types + both views' `AGGREGATE_FIELD`, the section on web and mobile |

Run 2 is issued only after Run 1 is reviewed and committed.

## Where things stand — 2026-10-09

- **Run 1 is done and committed** (`976bb2f`, `bf0e6cd`, `b3dc253`). The backend serves an `investment_withdrawal` section whose payload has the fields in the plan's Task 5 types **plus `gifts_net`** (ruling 9). For Run 2, don't touch `backend/`.

- Latest migration is `0032_transaction_stamp_duty`. **This attribute adds no migration.** Don't create one.
- The plan was revised against `cd2533d` on 9 Oct; every file, function and field it names as existing was checked then. If the code differs in mechanics, adapt minimally and record it under Deviations.
- All decisions are made (user, 9 Oct): stamp duty included via `paid_amount`; a `REVERSAL` nets against Invested; continuous zero buckets from the backend; SIP numbers follow the main dashboard (twin SIPs ×`series_count`, missed instalments measured against each folio's latest statement end); snake_case types; existing tokens; no new dependencies.
- Staging will be wiped before deploy, so there are no existing users' cached sections to backfill.

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Never `commit`, `add`, `rm`, `mv`, `reset`, `checkout`, `stash`, `restore`, `rebase`, `merge`, `push`. Leave everything uncommitted; the orchestrator commits each task after verifying it. The plan's "Commit" steps are the orchestrator's, not yours.

**Never touch:** `infra/`, `backend/alembic/`, `backend/.env`, real CAS PDFs anywhere, `Docs/CAS Files/` (the synthetic harness picks up the new section by itself), and the orchestrator's files: `Docs/**`, `DEFERRED_FEATURES.md`, `decisions.md`, `log.md`, `session.md`, `CLAUDE.md`, `AGENTS.md`, `backend.md`, `database.md`. Don't change `cash_flow.py`, `sip.py`, `holdings.py` or `lot_rules.py` — only import from them.

**Follow the plan literally.** If the code contradicts it in *mechanics* (a name, an import path, a fixture field), adapt minimally and record under "Deviations". If it would change *behaviour, a formula or an interface*, stop that part, record it under "Open questions", and continue with what doesn't depend on it.

**Test-first.** Write the test → run it → see it fail for the right reason → implement → green.

**Tests: only the named files, never a full suite.** Backend on Windows, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`. Frontend, from `frontend\`: `npx vitest run <files>` and `npx tsc -b`. Before each run's final test pass, `git grep` the tests for every symbol you changed and add the matching test files.

**Project rules** (`AGENTS.md`): Decimal strings for money end to end (no float maths on displayed values); user-facing copy uses the curly apostrophe (’); LF line endings, UTF-8; no new dependencies; reuse existing components and tokens.

## Approaches considered and rejected (don't re-litigate)

- **A new API route** — rejected: register a `_SectionSpec`; the generic `GET /analytics/{scope}` serves it.
- **A new table** — rejected: read-time aggregation, like `sip.py`/`cash_flow.py`.
- **Reusing `CashFlowEntry`** — rejected: it has no `transaction_id`, which the drill-in needs.
- **Adding a field to `SipRow`** — rejected: compute missed instalments in this module.
- **camelCase TypeScript types / a backend camelCase alias** — rejected: the API and `types.ts` are snake_case; an alias would break every existing screen.
- **`d3-scale`, new CSS tokens, a new charting package** — rejected: hand-computed scales, existing `--color-*` tokens, installed visx packages.
- **Fund-level drill-down, PDF print view** — out of scope for this attribute.

## Open questions (Codex: flag back, don't guess)

- If `compute_active_sips` or `_references` has a different signature from the plan's usage.
- If any existing test other than `test_recompute.py`, `AnalyticsView.test.tsx` and `MobileAnalyticsView.test.tsx` breaks because a new section name exists — list it with the failure, fix only fixture data.

---

## Self-review (before printing the report)

1. `git diff --stat` and `git status --porcelain`: every changed or new file belongs to this run's tasks. Undo anything else.
2. `git diff --cached --stat` is empty.
3. Review the diff as a hostile reviewer (run Codex `/review` on the uncommitted changes if available). Check against the plan's Review Focus 1–7: empty household; a quiet month present at 0.00; no active SIPs; missed instalments measured to the statement end; gifts/bonus excluded; bounced SIP nets to zero; stamp duty included. Also: the compute function is `async` and awaits `compute_holdings`; a holding with `current_value = None` is skipped; no float maths on money; Run 2 only — both views render the section, `tsc -b` clean, no dead imports.
4. Fix what you find, re-run the affected tests, list every finding in the report.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — a14-investment-withdrawal — Run <1|2>
Run date/time: <…>    Environment: Windows    Python/Node: <versions>    Baseline HEAD: <hash>

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
   tsc -b (Run 2): <result>

4. DEVIATIONS FROM THE PLAN (mechanics only)
   - <task/step> — said <…>; code needed <…>; file:line — why

5. OPEN QUESTIONS / BLOCKERS
   - <question> — what I'd need decided

6. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — <finding> — FIXED | NOT FIXED (why)

7. ANYTHING ELSE CLAUDE SHOULD KNOW

8. CONFIRMATIONS
   - No git write commands used: YES/NO
   - Full suites not run: YES/NO
   - Docs/, infra/, alembic/ untouched: YES/NO
   - cash_flow.py / sip.py / holdings.py / lot_rules.py unchanged: YES/NO
```

---

## Round log (orchestrator appends after each report)

| Round | Run | Result | Notes |
|---|---|---|---|
| — | Run 1 | ready 2026-10-09 | Backend: plan Tasks 1–3. |
| 1 | Run 1 | built 9 Oct (Codex, baseline `4624d5e`) | Tasks 1–3 DONE, 31 tests green on Windows; 86 green in WSL incl. cash_flow/sip/analytics-route. Two open questions ruled: gifts → option A (user: Gain excludes `gifts_net` at transfer value, new field); two folios of one fund → earliest statement end (orchestrator). Fixes applied by the orchestrator (review-loop fix authorship: 2 files + tests already in context); 89 green in WSL. Plan + mirror updated (rulings 9–10, Run 2 gift note). Independent review (Claude subagent, Sonnet): **APPROVE**, no High. Fixed: entries dated after today now land in a bucket; tests added for a reversal in a later month (bucket goes negative, the chart clamps bars at 0), stamp duty in bucket/entry, twin-SIP missed count, gift fields. Accepted, documented in code: a GIFT_IN stored at ₹0 (no NAV in the CAS) can't be excluded from Gain. 91 green in WSL. Committed per task: `976bb2f` (Task 2), `bf0e6cd` (Task 1), `b3dc253` (Task 3). |
| — | Run 2 | ready 2026-10-09 | Frontend: plan Tasks 4–6, including the `gifts_net` type and gift note (plan Task 5–6, ruling 9). Per-bucket `invested` can be negative (a reversal in a later month): the bar chart already clamps bar heights at 0. |
| 2 | Run 2 | built 9 Oct (Codex, baseline `47c73c4`) | Tasks 4–6 built; Codex flagged no period labels + no keyboard activation → orchestrator added labels (thinned), keyboard/aria, `formatLabel`, "January 2026" heading; 59 frontend tests + `tsc -b` green in WSL. Review (Sonnet): CHANGES NEEDED — role=img hides buttons; many periods on narrow screens; skeleton forever on a failed section (+2 Low). Fixed by the orchestrator (role="group", 12 px minimum slot with horizontal scroll, failed section shows a message) and committed in `ecd9760` (status line corrected 10 Oct). Synthetic gate `a14_checks` 0 mismatches (8/8, 10 Oct). **A14 DONE.** |
