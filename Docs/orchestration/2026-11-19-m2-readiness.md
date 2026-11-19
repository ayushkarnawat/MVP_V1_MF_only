# What it takes to reach M2 (numbers and charts), as of 19 Nov 2026

**M2 contains** (program plan, section 4): the Batch A fixes you approve, Batch D (benchmark lines, the Overview graph, the day's-change pop-up) and part 1 of Batch H (the "Watch how it works" link and video pop-up). Search, sections and dates are M3; the PDF report and the checklist window are M4.

## Where each piece stands
| Piece | Done | Left | Blocked on |
|---|---|---|---|
| **A: investigation** | XR-2 (25 XIRR fixtures, Excel and independent solver agree), RK-3 (recount) and RK-4 (real-data reconciliation, 19 Nov), CA-3 (7 checks), proposals written | **XR-3** (price and dating tests, handoff ready), **RK-5** (cross-checks against AMFI/SEBI references, mine), **XR-5** (short-period examples, mine), returns spot check and T10-5 (mine) | Nothing |
| **A: your review** | Eight proposals written (`2026-11-19-batch-a-fix-proposals.md`) | Your decision on each, one at a time (FX-8a/8b follow XR-3) | **You** |
| **A: fixes** | none | One Codex task per approved fix (failing test first), then my review | Your approvals |
| **A: Excel and evidence** | none | RK-9 and CA-6 (the two workbook exporters, Codex, large), RK-8/CA-8 (two one-line notes), RK-10/CA-9 (checked on real data after the fixes), then the whole-plan adversarial review | The fixes |
| **D: charts** | Plan written (tasks D-2 to D-14) | Everything: D-2 colour fix FX-13d needs **your approval**, then D-3 (shared graph), D-4 (several benchmarks, backend), D-7 (Overview graph), D-8 (movers, backend), D-10 (pop-up), D-12 (chart end date, follows A's pool end date), D-13 and D-14 | Not started: no lane or branch yet; D-2 needs your yes; D-12 follows FX-10c |
| **H part 1: tutorial link** | Plan written (H-2 to H-6) | Script and copy, red tests, link and pop-up, placeholder video | Not started; it waits only for C's import-screen change, which shipped in M1 |
| **M2 guide and freeze** | none | Deploy guide (the list of every user-visible number that changes with before and after, the stored-result rebuild, rollback), freeze, pre-flight | The above |

## The order that gets there fastest
1. **You:** read the eight proposals and decide (the first three are one family: approving FX-10a, FX-10d and FX-10b together is one round of fixes).
2. **Codex, one at a time (you relay):** XR-3 (handoff ready now), then one fix task per approved proposal, then RK-9 and CA-6.
3. **In parallel with Codex, no conflict:** Batch D's frontend lanes and Batch H part 1 (Antigravity or Gemini, up to three lanes) start once their branches are cut and D-2 is approved; I write those handoffs when you say go.
4. **Me, alongside:** RK-5, XR-5, the returns spot check, T10-5; reviews of each fix; the whole-plan review.
5. **Freeze M2 only when** every approved fix has its test green, the real-data before-and-after is measured on staging data, the Excel files open and tie to the screen, D and H part 1 pass their checks, and the stored-result rebuild is in the guide.

## Honest size
Roughly: A fixes are small (one task each, about one to two sessions apiece for the four to six you are likely to approve); the two Excel exporters are the largest A items; D is the biggest M2 piece (13 tasks, two Antigravity lanes plus two backend tasks); H part 1 is small. **The pacing item is the number of Codex tasks, since one runs at a time.** Counting XR-3, about six fixes and the two exporters, that is roughly nine Codex handoffs before the freeze, plus D's two backend tasks and H's one logic task: about twelve. I will not put a date on it; each handoff's turnaround is yours and Codex's.

## What I need from you to start
- Decisions on the eight proposals (start with FX-10a, FX-10d, FX-10b).
- A yes on **D-2** (the colour fix for the invisible benchmark line, FX-13d) when you are ready; it is a visible change.
- Say "go" for Batch D and H lanes so I cut `batch/d-charts` and `batch/h-tutorial` worktrees and write their handoffs.
- Relay XR-3 to Codex when convenient.
