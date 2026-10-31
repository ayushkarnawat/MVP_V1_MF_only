# Session state — 2026-10-29

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history — the
permanent, append-only record is `log.md` (session-by-session),
`backend.md`/`database.md` (backend/schema changes only), and `decisions.md`.
Older "Latest"/"Previous" sections (everything up to the 2026-10-27 Profile session) were
dropped from here on 2026-10-29; their full detail lives in `log.md` and, for the UI
redesign, in `Docs/orchestration/ui-redesign-decisions-register.md`.

**Run 1 of 7 DONE (31 Oct 2026), local only, nothing pushed.** Start 9424aaf9, head 7f94e5ef, tag `cr-run-1-done`. Commits `cr-r1:` (cf1ce545 ... 7f94e5ef), five Run 1 handoffs set DONE. Next: Run 2 (blocked by G2 timing baselines, manager measures after 06:35 IST on a trading day). Open for the owner/manager: the 18-fund net-equity list (VM read-only query), the fund-manager role readings (Associate, Co-Fund Manager, portion labels, senior titles, future start dates), the 2 failing `test_benchmark.py` "switches" tests that fail at the starting commit too (look before Run 3), Home now shows Real Estate as a live slice. Codex method here: the owner runs Codex in `~/cr-run-1` from Claude's prompts; Claude commits into `wt/docs` via `git --git-dir=.git/worktrees/docs`.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## ⚠ FIRST — Priority 1 open item (deadline 10 Nov 2026, 06:00 IST)

**Fund-manager factsheet access gaps (attribute 04).** When asked "what's left / what do I need to do", lead with this.
- 10 fund houses need a monthly hand import (ICICI, Kotak, HDFC ×2 files, Axis, Bandhan, Invesco, WhiteOak, ITI, JM, Trust; 689 live funds); 5 have no factsheet (Bajaj, AlphaGrep, IL&FS, Lakshya, Monarch; 33 funds).
- Evidence so far (28 Oct, from the LeapSwitch VM's Indian IP): the monthly job processed 34 of 40 automatic houses (Angel One 403, HSBC timeout, Sundaram 500, three stale-month); HDFC 403 and JM 406 still blocked from that address.
- Must be settled before the first automatic run on **10 Nov 2026**: (1) first staging import + record alerts; (2) decide on any fund house the host blocks; (3) build a missed-month alert; (4) admin upload screen instead of the CLI; (5) test HDFC's passive file; (6) decide the long-term fix (ask AMCs for access / vendor data quote); (7) confirm the ops-alerts email subscriptions; (8) the monthly routine itself.
- Detail and the ordered to-do table: `DEFERRED_FEATURES.md` (top section). Background and options: `Docs/orchestration/subproject1-execution/a04-factsheet-access-gaps.html` (https://claude.ai/artifact/STCA9eNZwWZ4ZYYGzmpkTL).

## Latest (2026-10-28 and 29): UI redesign, the Individual Fund release is fully merged; staging run still to do

**Branch:** `leapswitch-redesign` (tip `57cdcc57` at the end of the session, docs worktree `C:\Users\Dell\Desktop\MVP v1\wt\docs`). Never push to `main` or `feat/leapswitch-staging`. Alembic head stays `0046`: nothing in this release needs a migration.

**Merged this session (register C181 to C183, L23):**
- **IF-C** PR #32 `f8db102e` (28 Oct): fund Overview and Insights routes live on the real backend fixtures.
- **IF-D** PR #33 `f0982132`: the Overlap tab (Gemini build `wip/IF-D` `d131c02d`, verified by the orchestrator: tsc 0, oxlint 0, individual-fund + planning 65 files / 1045 tests, shell + App + mf 36 / 397, kit 17 / 190, build ok, 2 injected bugs caught; 15 default decisions recorded in C181).
- **IF-E** PR #34 `18044571`: fund names on Home, Mutual Funds and Portfolio open the fund page (verified: four folders 133 / 2027, individual-fund + planning 50 / 917, 2 injected bugs caught). The first red commit had a nested-link defect in the Movers rows; redesigned as a plain row container plus a separate open button.
- **BE1** PR #35 `4cdf12a9`: optional `scheme_id` on the Transactions ledger entries (`schemas.py`, `investment_withdrawal.py`, front-end type; no migration). The Ledger names are still plain text until IF-E2.
- Earlier the same days: the AMC Allocation card small-screen fix (C178, `ce10451d`), Individual Fund backend PR #31 (C177), manual QA report (C180: 36 pass, 1 skip by design, 0 fail).

**Owner decisions (recorded in `decisions.md` as OD1 to OD4):** IF-E was built before IF-D merged; the whole-release Sonnet review was skipped (no review of IF-C/D/E/BE1 beyond the orchestrator's verification and the earlier 12 backend review fixes: a recorded risk); the manager runs the staging deploy only through the manager's own Claude; small verified fixes may be merged without a PR.

**Staging (not run yet):** guide `Docs/orchestration/2026-10-29-staging-deploy-guide-individual-fund.md` (manager-Claude prompt, 21 steps with gates, analytics recompute so the overlap check is meaningful, `sudo sh` for rollback) and QA checklist `Docs/orchestration/2026-10-29-staging-qa-checklist-individual-fund.md`. Nothing from this release is on the VM yet.

## Exact next steps, in order

1. **Staging run of the Individual Fund release** by the manager's Claude from the guide's prompt (deploy `--full`, the two T14 commands, benchmark-history and sector-coverage SQL checks, QA checklist). The orchestrator relays results and triages like C180.
2. **Overlap consistency check on real data (L23 BA4):** the Insights text said 35% overlap and the Overlap golden said 18% for the same pair; probable cause is a fixture seed difference (Insights reads the stored analytics overlap, the Overlap tab computes live). The QA checklist has the row; if the numbers disagree after the analytics recompute, it is a real bug.
3. **Owner sign-offs still open:** Holdings lifetime XIRR (B12, one number not reported), the CAL1 table (B11, section 12), V7 sector-coverage numbers (no threshold, owner decides), the AMC Allocation card at 1024/1280/1366 in light and dark (C178), the L13 decision (a fund redeemed on the latest price date counts in that day's change), the greeting-link decision (C149).
4. **IF-E2 (not built):** link the Ledger names (needs BE1, now merged), the Other tab, the overlap heatmap and top pairs, and the nested "See Overlap" link on Insights (C181 default 14 is an accessibility compromise).
5. **Backend asks, all optional, UI hides the element until built:** L22 (BA1 to BA6, Individual Fund) and L23 (BA1 to BA5, Overlap). Mutual Funds backend asks not built: holdings export route, family-view coverage-gap route, optional analytics recompute after an opening-balance post.
6. **Housekeeping, only on the owner's word (not given):** delete merged remote branches `feat/if-live`, `feat/if-overlap`, `feat/if-links`, `feat/ledger-scheme-id`, `wip/IF-C`, `wip/IF-D`, `wip/IF-E`, `feat/individual-fund-page`, `fix/news-plain-word-symbols`, `fix/news-ticker-names` and older merged `feat/*` page branches; remove worktrees `IFC`, `IFD`, `IFE`, `BE1` and the `ref\` folders (remove each `frontend\node_modules` junction first with `cmd /c rmdir`, never `npm install`); the manager machine's local `wip/*` branches.
7. **Priority 1** (above) runs as a separate track with its deadline on 10 Nov 2026.

Full handoff for the next orchestrator: `Docs/orchestration/2026-10-29-orchestrator-handoff-7.md`. Register: `Docs/orchestration/ui-redesign-decisions-register.md` (C170 to C183, L21 to L23; next free C184 and L24).

## Still open, carried forward from earlier phases

A dead `HoldingsTable.tsx` field reference; a non-index-seek-bounded SQLite scan in `category_ranking.py` (Postgres has been live in staging since 2026-09-09); an ARIA IDREF gap on the SIP tab switcher (accepted limitation); the backend API domain naming decision (§19/§22 Phase 5); Profile plan T8 (manual check) and T10 (retire the old Profile, owner's go after staging acceptance); the 2026-10-20 Chandra Tripathi fix (PR #8 into `feat/leapswitch-staging`) awaits manager review, and the harness's stale -5.59% drift baseline needs refreshing. Scorer V2 planning is paused at the owner's request (2026-10-22). Deferred features: `DEFERRED_FEATURES.md`.
