# Prompt for the Step 0 to final-plan session (paste into a new Claude session)

You are continuing Unifolio (MF MVP) planning work. **No product code is written in this session.** This session goes from Step 0 to a plan that is ready to execute: (1) finish **Step 0** (the checks that must be answered before any execution) for the AMC factsheets, P/E and P/B, and benchmark indices; (2) update the briefing; (3) write the **final implementation plan** (superpowers `writing-plans`, the Claude-orchestrator and Codex-worker method of Sub-projects 1 and 2); (4) prove the plan is safe to execute (a readiness review); (5) write the **handoff that moves execution to another Claude session**. The owner's aim: be as sure as evidence allows that execution is smooth. Never claim certainty you have not checked: a readiness item is either verified (with the evidence) or listed as a named risk with its fallback.

## Where everything is
Repo `ayushkarnawat/MVP_V1_MF_only`, branch **`leapswitch-redesign`** (work directly on it, commit locally, **do not push**; everything is staged together at the end). If you run in a git worktree, check out that branch. Read `AGENTS.md` and `CLAUDE.md` first, then in this order:
1. `Docs/orchestration/unifolio-change-briefing-handoff.md` (what the briefing is, every decision recorded, the 31 Oct updates at the bottom).
2. `Docs/orchestration/2026-10-31-factsheet-state-and-benchmark-gaps.md` (the report: October status per fund house, P/E and P/B coverage, benchmark gaps, commands; the **"Revision 2"** section at the end is the newest and wins where it differs).
3. `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md` (the implementation plan; gates G1 to G7; Task 1.5b is new).
4. `Docs/orchestration/unifolio-change-briefing.html` (the briefing; large, read its Step 0 section and decisions).
Supporting data (committed): `Docs/orchestration/step0-data/` (30 Oct VM outputs: factsheet scan CSVs, the fetch log, the manifest, benchmark name counts, the per-house table), `Docs/orchestration/step0-vm-scripts/` (the VM scripts), `Docs/orchestration/briefing-build/` (the sources that rebuild the briefing; see its README).

## What was found on 30 Oct (do not redo)
36 of 40 automatic fund houses fetched OK (Angel One 403, Sundaram no link, SBI and Mahindra stale); 5 houses print a per-scheme P/E and P/B (ABSL, UTI automatic; Invesco, ITI, Kotak by hand); Edelweiss prints only the index's figures; every house prints its benchmark name; about 84% of benchmark mentions are not in our history (we store 8 equity indices); the niftyindices terms of use prohibit automated collection without written consent (open decision S10).

## The job, in order
**A. Run the VM checks (the manager runs them on the staging VM through this session; you give the exact commands and read the outputs).** Copy `Docs/orchestration/step0-vm-scripts/` to `/home/deploy/step0/` on the VM (create `/home/deploy/step0/out`). Then:
1. `check_publication.py` (command R4a in the report): has each automatic house published its October file? Houses showing `october_listed` = YES while the job took September are our problem; "no" is the house's lateness.
2. `verify_benchmark_sources.sh` (R4b): verifies the niftyindices names for debt, hybrid, arbitrage and extra equity indices (closes S8 and S9) and tests the BSE, CRISIL, IBJA, LBMA, RBI and MCX pages.
3. Home and benchmark-matrix timing baselines: only after 06:35 IST on a trading day, for a recomputed user, twice each (the scripts abort on any write).

**B. October files from the owner.** The owner (Ayush) supplies October factsheets by hand for the hand-import houses and the four not accepted (Angel One, Sundaram, SBI, Mahindra) where the house's page already shows October. When they arrive: upload to `/home/deploy/factsheets-oct2026`, run the hand import (report sections 5c and 5d), re-run the monthly job (5e), then re-scan every file with `scan_factsheets.py` using a wider P/E and P/B label list (P/E, PE Ratio, Price to Earnings, Price/Earnings, P/B, PB, Price to Book) and refresh the per-house P/E, P/B and benchmark tables. Where a house has not published October yet, record it as the house's lateness and move on; do not chase it.

**C. Close the remaining Step 0 items and decide what is buildable.**
- S6: find the NSE filing data request used by NSE's own results page (the owner may supply the address from browser developer tools); test it from the VM.
- S8, S9: from the R4b output.
- Benchmarks not in history (CRISIL, BSE, gold and silver, and the rest): the owner's rule is **build them only if a free, permitted source exists, otherwise fall back to the plan's existing category fallback (labelled)**. Use the R4b results and search the web to find real, testable sources; verify every candidate from the VM before calling it usable; read the source's terms. A gold or silver ETF's own NAV from our history is a possible labelled proxy, owner's decision.
- S10 (terms and licence) is the owner's or the manager's business decision: present the finding and the options; do not decide it.
- Anything you cannot verify stays marked unverified.

**D. Update the briefing and the documents; commit locally.** Update the report (a dated "Revision 3" section; keep the earlier text), the plan (gates G5, G6, G7, Task 1.5b, T2.12, T3.1, new tasks if a source is found), the handoff note, and the briefing. The briefing's published artifact is private to another account and cannot be updated from here: rebuild the HTML from `briefing-build/` (README), write it back to `Docs/orchestration/unifolio-change-briefing.html`, and publish it as a **new** artifact (tell the owner the new link). Commit after each document; prefix `step0:`; do not push.

**E. Write the final implementation plan.** Start from `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`; with every Step 0 result and every decision in the handoff note folded in, rewrite it as the final plan (one plan, organised by run; keep the run order Step 0, Runs 1 to 7, then staging; additive-first payloads; migration numbers by run order; SIP fixes and LinkedIn stay out). Every task names its files, interfaces, tests, estimate and which gate it needs; no gate may be left open without a named fallback. Use the superpowers `writing-plans` skill.

**F. Readiness review: prove execution will be smooth.** Do all of these and record the evidence in a file `Docs/superpowers/plans/2026-10-31-readiness-review.md`:
1. Gate table: every gate (G1 to G7 and any new one) is closed with its evidence, or open with the fallback and who decides; no silent assumptions.
2. Precondition probes: for each run, list the facts its first task relies on (a column that exists, a migration head of 0046, an endpoint that answers, a file layout) and verify each against the repo or the VM with a command; record the output. Anything you cannot verify is a named risk.
3. Conflict check: files touched by more than one task, migration numbering, payload fields added versus removed, and tests that will break by design.
4. Independent review: ask a fresh agent (code only, not your conclusions) to look for gaps, contradictions and missing steps in the plan and the readiness review; fix what is real and record what you rejected and why.
5. Risk register: each remaining risk with its likelihood, effect, early signal and fallback; include the staging deploy lessons (recompute claims, disk space, build state).
6. Owner sign-off list: every decision that is still the owner's (for example S10 and the hybrid-fund rule), each with a recommendation, so none is discovered during execution.

**G. Hand off execution.** Write `Docs/superpowers/plans/2026-10-31-execution-handoff.md` and a copy-paste prompt for the execution session (a new session, as the owner may use another account): state, branch, what is done, the order of runs, the method (handoff doc per task, a cheap probe first, Codex implements and self-checks, the orchestrator commits, the mandatory adversarial review through the Codex rescue agent, Opus only on the named triggers with approval), the hard rules below, the gates still open and who owns them, and the first command. Write the per-task handoff documents for **Run 1** now; later runs' documents are written at the start of each run because they depend on what the earlier runs produced (migration numbers, interfaces, measured baselines). Commit all of it locally.

## Hard rules
- **Never run on staging:** `clean-db.sh`, `restore.sh`, `rollback.sh`, any deploy script, or any write outside the two agreed ones below. Never add `--allow-nav-writes`. Never stop a running analytics recompute (it leaves a 15-minute claim that makes the next run skip that user; a one-household recompute clears it).
- **The only writes allowed on staging** are the hand import of files the owner supplied and the `fund-managers-monthly` job. State each write before running it.
- No scraping or access-control workarounds beyond what the resolver registry already does; a source whose terms forbid automated access is reported, not used.
- Report outcomes faithfully (what ran, what failed, what is unverified). Ask before assuming on anything marked open in the docs.
- The owner's standing decisions are recorded in the handoff note (SIP fixes and LinkedIn are on hold; no product code is written in this session; handoff documents and the final plan are written in this session as steps E to G). One decision is still unconfirmed: whether about 8 judgement hybrid funds use the 65% data rule (recommended) or stay excluded.

## First reply
Confirm you have read the four files and list in one short table what is left before the plan can be final: each Step 0 item and each of steps A to G, who does it (manager on the VM, owner supplying files or deciding, you), and the first command to run.
