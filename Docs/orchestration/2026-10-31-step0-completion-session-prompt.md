# Prompt for the Step 0 completion session (paste into a new Claude session)

You are continuing Unifolio (MF MVP) planning work. Nothing is to be implemented in this session: this session finishes **Step 0** (the checks that must be answered before any execution) for the AMC factsheets, P/E and P/B, and benchmark indices, then updates the plan and the briefing.

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

**D. Update the documents and commit locally.** Update the report (a dated "Revision 3" section; keep the earlier text), the plan (gates G5, G6, G7, Task 1.5b, T2.12, T3.1, new tasks if a source is found), the handoff note, and the briefing. The briefing's published artifact is private to another account and cannot be updated from here: rebuild the HTML from `briefing-build/` (README), write it back to `Docs/orchestration/unifolio-change-briefing.html`, and publish it as a **new** artifact (tell the owner the new link). Commit after each document; prefix `step0:`; do not push.

## Hard rules
- **Never run on staging:** `clean-db.sh`, `restore.sh`, `rollback.sh`, any deploy script, or any write outside the two agreed ones below. Never add `--allow-nav-writes`. Never stop a running analytics recompute (it leaves a 15-minute claim that makes the next run skip that user; a one-household recompute clears it).
- **The only writes allowed on staging** are the hand import of files the owner supplied and the `fund-managers-monthly` job. State each write before running it.
- No scraping or access-control workarounds beyond what the resolver registry already does; a source whose terms forbid automated access is reported, not used.
- Report outcomes faithfully (what ran, what failed, what is unverified). Ask before assuming on anything marked open in the docs.
- The owner's standing decisions are recorded in the handoff note (SIP fixes and LinkedIn are on hold; nothing is implemented in this session). One decision is still unconfirmed: whether about 8 judgement hybrid funds use the 65% data rule (recommended) or stay excluded.

## First reply
Confirm you have read the four files and list in one short table what Step 0 still needs, who does each item (manager on the VM, owner supplying files, you), and the first command to run.
