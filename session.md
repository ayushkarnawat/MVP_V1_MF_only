# Session state — 2026-11-03

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history — the
permanent, append-only record is `log.md` (session-by-session),
`backend.md`/`database.md` (backend/schema changes only), and `decisions.md`.
Older "Latest"/"Previous" sections were dropped from here on 2026-11-03; their full detail lives in `log.md` and, for the UI
redesign, in `Docs/orchestration/ui-redesign-decisions-register.md`.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## ⚠ FIRST — Priority 1 open item (deadline 10 Nov 2026, 06:00 IST)

**Fund-manager factsheet access gaps (attribute 04).** When asked "what's left / what do I need to do", lead with this.
- 10 fund houses need a monthly hand import (ICICI, Kotak, HDFC ×2 files, Axis, Bandhan, Invesco, WhiteOak, ITI, JM, Trust; 689 live funds); 5 have no factsheet (Bajaj, AlphaGrep, IL&FS, Lakshya, Monarch; 33 funds).
- Evidence so far (28 Oct, from the LeapSwitch VM's Indian IP): the monthly job processed 34 of 40 automatic houses (Angel One 403, HSBC timeout, Sundaram 500, three stale-month); HDFC 403 and JM 406 still blocked from that address. The missed-month alert is now built (Run 2); the run of 10 Nov 06:00 IST needs a read-only check afterwards (a scheduled reminder exists).
- Detail and the ordered to-do table: `DEFERRED_FEATURES.md` (top section). Background and options: `Docs/orchestration/subproject1-execution/a04-factsheet-access-gaps.html`.

## Latest (2026-11-03): the 13 change requests release is built, reviewed and waiting for its staging deploy

**Branch:** `release/change-requests` in the separate worktree `D:\unifolio-release` (built from `7b773475` plus the later commits; tags `cr-run-1-done` to `cr-run-6-done`, `cr-run-7-done` after the Run 7 gate). **This is the only branch the staging deploy is built from.** `leapswitch-redesign` is frozen shared history; UI round 2 continues on `ui-round-2` and merges the release in after staging (`Docs/orchestration/2026-11-03-release-branch-model.md`). Alembic head **0052** (the VM is at 0046). **Nothing is pushed or deployed.**

**What is in it:** Runs 1 to 7 (market cap and asset class, fund manager rules, equity-only overlap, valuation by fund and 60 percent rule, Performance Ranking, size-weighted category average, 79-index benchmark registry with the ordered fallback and "No benchmark" last, UTI and Groww readers, consolidated family holdings, **Head of Family** with the contact-change safeguard and re-consent, logos, green button, reasons instead of dashes, "how this benchmark was chosen") plus **T2.12 Step B** (book value from NSE filings). Details: `log.md` and `decisions.md` of 3 Nov, ADR-007, `Docs/orchestration/cr-r5-swap-and-undo-handoff.md`, `cr-r6-head-dialog-handoff.md`, `cr-r7-logo-pass-handoff.md`.

**Verification state:** backend 5,309 passed and 16 failing that also fail on the untouched earlier branch (15 in `tests/scripts/test_refresh_news.py`, 1 in `test_fund_valuation_layouts`); whole frontend gate after T7.5: 411 files, 5,330 tests, types, lint (0 errors) and build clean. Two independent Opus reviews of the Run 7 frontend and of the backend changes after the Run 5 gate were running when this was written; their findings are triaged in `Docs/orchestration/2026-10-31-staging-deploy-guide-change-requests.md`'s ledger.

## Exact next steps, in order

1. Triage the two Opus reviews, fix findings test-first, tag `cr-run-7-done`, final full backend run (recreate the Postgres test DB first).
2. **Before the deploy:** run `scripts/benchmark_none_report.py` on the VM (read-only), produce the 18-fund net-equity list (O6) and the fund-manager role readings (O7) for the owner, printed-return check (L7) on a sample of the 56 new indices.
3. **S.1 staging deploy** per `Docs/orchestration/2026-10-31-staging-deploy-guide-change-requests.md`, **only on the owner's explicit go and push word**: push `release/change-requests` as a NEW branch (no force), set `FRONTEND_BASE_URL=https://ls-redesign.unifolio.in` before the restart, backup, migrations 0046 to 0052, recompute, cron lines (including the weekly filings book-value job), DB checks, timing against the 2 Nov baselines, run the book-value job once, UTI and Groww factsheet capture, re-map stored benchmarks. Stop before visual/manual QA.
4. **Manual QA** by the intern with `Docs/orchestration/2026-11-03-manual-qa-checklist.md` (sections 8 and 9 need two real inboxes; section 10 is the contact-change safeguard).
5. After staging: send `Docs/orchestration/2026-11-03-prompt-for-ui-round-2-after-release.md` to the UI round 2 session; the CA Excel with six funds (`2026-11-02-ca-excel-runbook.md`); four `--this-month-only` imports and the Sundaram check. No `--allow-nav-writes` or `--include-live-fetch` without the owner's word. The Bandhan VM import was never authorized and is dropped.
6. **Priority 1** runs as a separate track (10 Nov 06:00 IST).

## Still open, carried forward from earlier phases

A dead `HoldingsTable.tsx` field reference; a non-index-seek-bounded SQLite scan in `category_ranking.py` (Postgres has been live in staging since 2026-09-09); an ARIA IDREF gap on the SIP tab switcher (accepted limitation); the backend API domain naming decision (§19/§22 Phase 5); Profile plan T8 and T10; the Individual Fund release staging run and its owner sign-offs (`Docs/orchestration/2026-10-29-orchestrator-handoff-7.md`; folded into the combined deployment above) and the housekeeping branch deletions awaiting the owner's word; the 2026-10-20 Chandra Tripathi fix (PR #8) awaiting manager review. Scorer V2 planning is paused (2026-10-22). Deferred features: `DEFERRED_FEATURES.md`.
