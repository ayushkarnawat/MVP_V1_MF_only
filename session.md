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
