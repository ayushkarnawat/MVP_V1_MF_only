# Wave 0 handoff: from planning to execution (waves 1 to 5)

Written 17 Nov 2026 on branch `leapswitch-redesign`. Wave 0 (decisions and plans) is finished. Execution (waves 1 to 5 and the four staging milestones) is run by the manager's Claude. This document is the map; the prompt that starts the process is `2026-11-17-prompt-for-managers-claude-waves-1-5.md`.

## What is decided (do not reopen)

- The program: five waves, four staging milestones (M1 to M4), production once after M4. Source: `Docs/orchestration/2026-11-17-program-execution-and-deployment-plan.html` (sections 3 to 11 and the five decisions in section 15, all answered).
- **QA is done once, together, after M4**, against one combined checklist; milestones get a quick verify only (it loads, the changed screens open, the stored-numbers rebuild ran where it applies).
- Capacity: **one Codex task at a time; up to three Antigravity (Gemini) frontend-only tasks at once**, each in its own clone and branch, on disjoint files; Claude orchestrates and never hands off design, integration or the final check.
- The old staging link (`ls-staging`) shares this backend and database and stays untouched: **every backend change is additive**; the only migration allowed in the whole program is Batch B's (0054, current head 0053).
- Paused and unchanged: GA4 (Batch G) and A4 (load times). Do not add analytics events or speed work.
- No phone changes in any batch. No real data in any evidence, video or fixture.
- Commits and pushes happen only on the user's word (Aditi). Nothing is deployed, and no outward-facing document is sent, without a written go.

## What was written in wave 0

Ten implementation plans (one per batch, written with the Superpowers writing-plans skill) in `Docs/superpowers/plans/`:

| Wave | Plan file | Batch |
|---|---|---|
| 1 | `2026-11-17-batch-b-journey-plan.md` | B journey quick wins (the only migration) |
| 1 | `2026-11-17-batch-c-holdings-hygiene-plan.md` | C holdings hygiene |
| 1 (read-only) | `2026-11-17-batch-a-numbers-plan.md` | A1 XIRR, A2 rank, A3 category average (investigation first; fixes wave 2) |
| 1 (no deploy) | `2026-11-17-batch-l-disclosures-audit-plan.md` | L portfolio disclosures audit |
| 2 | `2026-11-17-batch-d-charts-plan.md` | D benchmark lines, Overview graph, day's-change pop-up |
| 2 (part 1) / 5 (part 2) | `2026-11-17-batch-h-cams-tutorial-plan.md` | H CAMS tutorial video, floating checklist |
| 3 | `2026-11-17-batch-k-search-plan.md` | K search (one release) |
| 3 (stage 1) / 4 (rail) | `2026-11-17-batch-f-section-index-plan.md` | F section list and glass rail |
| 4 | `2026-11-17-batch-e-dates-plan.md` | E date policy, strip, P/E P/B "i" |
| 5 | `2026-11-17-batch-i-pdf-export-plan.md` | I PDF export |

Also written: `Docs/orchestration/wave-common-rules.md` (standing rules for every Codex and Antigravity task; it wins over the older rules files where they differ).

## What was deliberately not written (the orchestrator writes these at execution time)

- **Packets and handoffs.** Each plan lists, per task, what a packet or handoff must contain. The orchestrator writes each Antigravity packet (measurements, states, copy, tokens, allowed files, red tests) and each Codex handoff **in detail when that task starts**, from the plan, the batch workbook's drawings and the repo as it is that day. Antigravity needs detailed packets so the UI turns out exactly as planned; red tests are committed first.
- **The four milestone deploy guides (M1 to M4)** and **the combined QA checklist.** Written when each milestone is reached (the guide) and before the QA round (the checklist). Each plan's last task lists the facts its batch gives to the guide.
- **Notion pack and `decisions.md` / `session.md` updates**, on the user's go.

## Order and dependencies (from the program plan, section 3 to 5)

1. **Wave 1:** B and C (Codex backend and red tests; Antigravity screens), the read-only A investigations and the L audit (Claude and Codex, no deploy). Ships in **M1** (B and C). One-time stored-result recompute at M1 (category merge).
2. **Wave 2:** A's approved fixes, then D; H part 1 (link and pop-up, placeholder video allowed). Ships in **M2** with the stored-result rebuild. A's fixes need the user's approval one proposal at a time.
3. **Wave 3:** K (all four steps, one release) and F's section list and anchors (stage 1). Part of **M3**.
4. **Wave 4:** E, then F's visible rail. **M3** completes.
5. **Wave 5:** I; H part 2 (floating checklist, final video). **M4**, then QA, then production.

Shared-file order (one owner at a time): `TopBar.tsx` K then I; `MutualFundsFrame.tsx` K, E, F's rail; `SectionCard`/cards F's anchors first, then E and K; import wrapper/screens C and B first, then H; `dashboard/xirr.py` A1 only (A4 later); category pool files C then A2 and A3 together; auth screens, `auth-tokens.css`, `otp.py` B only. Full table: program plan section 5.

## Open items and things needing the user (not blockers for starting wave 1)

- **Batch B:** email screenshots for item 18; the deeper green `#15803D` to be checked against the palette PDF; the fourth ("changed back") email is a draft for the user's review; the workbook gave the email HTML to Antigravity, but Antigravity may not edit `backend/**` and the emails are Python there, so the plan gives them to Codex (flagged in the plan).
- **Batch C:** none blocking; the phone check for folios (C-8) reports to the user before any phone file changes.
- **Batch A:** every fix is proposed first and built only after approval; the fund-manager decision FX-8e (short-period figure) and FX-10b (definition differences) are the user's calls with evidence.
- **Batch D:** the colour fix FX-13d needs the user's approval; keep or remove the unused `home-tokens.css`.
- **Batch E:** the new dependency `@radix-ui/react-popover` needs the user's explicit yes (the tooltip fallback exists).
- **Batch H:** a real inbox screenshot with details hidden; CAMS ten-year-range confirmation; the two mismatches between the app's CAMS text and the live form are flagged, not changed.
- **Batch I:** the workbook says the Export PDF button is in the top bar (17 Nov) in one place and "in the shared slot" in another; the plan follows the top bar.
- **Batch L:** timing depends on the fund houses, not the program (first pass about day 10 to 12 of a month; final after day 20).
- **Search (K):** the wide green Ask Mira pill, divider and hint in the top-bar mockups are drawing-only until the user approves them for the live app.
- **Priority 1 (from `CLAUDE.md` Session State):** the fund-manager factsheet access gaps (deadline 10 Nov 2026 06:00 IST for the next monthly run) are tracked separately in `DEFERRED_FEATURES.md`; they are not part of these plans.

## Known risks to watch (details in the program plan, section 13)

- A plan written up front can go stale (the 16 Nov NAV fix already did that to two plans). Every plan therefore has a **wave-start check**: before building, confirm the files and names it lists still exist and look as described, and report drift to the user.
- Backend changes reach the old staging link at once: additive only; a response-shape test for each backend change.
- Deploys: tag `mN-rc`, tag the previous backend image `:previous` **before** building (the 16 Nov build removed it), check free disk, avoid the job windows (05:40 to 06:35, 10:30, 14:00 to 14:15). Claude never runs a deploy; the manager's Claude or Aditi runs it from the written guide.

## How to continue (quick start)

1. Read `AGENTS.md`, `CLAUDE.md`, the program plan, `wave-common-rules.md`, then the plans for wave 1.
2. Open the lane worktrees and branches named in each plan (`batch/b-journey`, `batch/c-hygiene`, `batch/a-numbers`, `batch/l-audit`), run each plan's wave-start check, and report drift.
3. Start with B and C (Codex backend and red tests; Antigravity packets written in detail by the orchestrator), and the read-only A and L work alongside.
4. Log each delegation in `Docs/orchestration/delegation-log.md` and keep `session.md` current.
