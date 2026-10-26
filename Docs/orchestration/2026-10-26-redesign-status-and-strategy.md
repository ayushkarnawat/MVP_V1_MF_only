# UI redesign: status and strategy (26 Oct 2026, afternoon)
Updated by the orchestrator after the owner's instructions of 26 Oct. Supersedes the lane assumptions of `2026-10-26-execution-plan-v2.md` section 2 (Codex-only backend lane) where they differ; everything else stands.

## 1. Owner policies in force
- **Opus:** whenever I feel an Opus review is warranted I **ask the owner** (yes or no); otherwise Sonnet reviews. No Opus without the owner's yes.
- **Review findings are all fixed, Lows included** (owner, 26 Oct). A finding is left alone only when it is a design decision already recorded in the register (listed explicitly, with a one-line reason) or needs an owner decision (L13).
- **Backend capacity:** two Claude Code terminals (two accounts) in parallel; Codex when its limit resets (owner relays). Gemini for all front end; its usage so far is small (G1 to G5 used about 10 percent of an hourly window).
- Nothing goes to `main` or `feat/leapswitch-staging`; nothing to production before all pages are ready.

## 2. Backend status
| Group | Runs | State |
|---|---|---|
| Home | HB1 to HB7 | Built, reviewed twice (Opus then Sonnet), fixes verified. Draft PR #10. **Remaining Lows (L15 stale feed, L3 statement-only last point, gate and test gaps N7) are being fixed (agent in `~/wt/home-be`).** |
| Portfolio | PF-B | Built and verified. Draft PR #15. Sonnet review done (one High: a date-dependent golden test). **All findings (H1, M1, M2, M3, L1, L5, L6 and more) are being fixed (agent in the main checkout).** |
| Mutual Funds | MB1 to MB3b | Built and verified. Draft PR #12. Sonnet review done (one High: CAS opening rows counted as new money in windows). **All findings (H1, M1, L-a to L-f) are being fixed (agent in `~/wt/mf-be`).** |
| News | NB1 to NB3 | Not started. Needs the integration branch with MB1 (migration 0044 chains after 0045). Owner runs the VM dry run (NB1 T1) and calibrates thresholds (NB3). |
| Individual Fund | IB1 to IB5 | Not started. |
| Mutual Funds MB4 | 1 run | Not started; needs IB1. |
| Planning | PB1, PB2 | Not started. |
| Cleanup | MX1 | Not started (me, after MB4). |
| Profile | one line (`created_at` on `/auth/me`) | Not started (me). |
After each fix run: I verify (scope, tests, gates, differential and mutation checks), commit, then a **second Sonnet review of the fixes**; then PRs #10, #12 and #15 are merged into `leapswitch-redesign` (green CI, my standing role) so that every later backend branch starts from one base.

## 3. Front-end status (packets)
| Packet | Scope | State |
|---|---|---|
| G1 | UI kit (K1 + K2) | Done, verified. Draft PR #13. |
| G2 | Home tokens, format, API client, data hook, controls | Done, verified. Draft PR #14. |
| G3 | Home greeting, wealth card, glance | Done, verified, committed. |
| G4 | Home allocation and family cards | Gemini report received; **verification pending** (`feat/home-frontend`). |
| G5 | Home movers and worth a look | Gemini report received; **verification pending** (`feat/home-frontend-b`). |
| G6 | Home page assembly, route flip, parity step (news waits on NB) | Not started. |
| Rest | Portfolio page; Mutual Funds (MF1 to MF15); Individual Fund (IF1 to IF5); Planning (PL1 to PL4); Profile (PR2 to PR10) | Not started. See section 5. |

## 4. Backend strategy (two Claude terminals plus Codex)
- **Per group, not per run.** One session per group runs all its tasks test-first, one commit per task, a checkpoint line per task in its report (test counts), so I can bisect. I verify once per group (scope, full tests, differential and mutation checks on the risky tasks), then one Sonnet review per PR, fix everything, re-review. This replaces the review-after-every-run loop; the risk (an early mistake carried through a long session) is handled by the per-task commits, the checkpoint lines and the group-level verification.
- **Base branch:** both terminals start from `leapswitch-redesign` after #10, #12 and #15 are merged into it (about an hour from now), so migration 0044 chains after 0045 and the Individual Fund work sees `compute_holdings(scheme filter)` and the stored-only prices.
- **Terminal A:** NB1 to NB3 on `feat/home-news` (one session; the owner's VM dry run before it, the staging check and calibration after it). Then PB1 + PB2 on `feat/planning-backend` if Codex has not taken it.
- **Terminal B:** the Individual Fund backend on `feat/individual-fund-page` in three sessions (IB1 + IB2, IB3 + IB4, IB5 + MB4), sequential because they share a branch and each builds on the last; MB4 is built on this branch after merging the integration branch in. IB5's staging check is the owner's.
- **Codex (when it resets):** PB1 + PB2 as a third lane (small, additive, fully specified), then an extra adversarial look at News (the new ingestion and matching code) and at the Individual Fund insights engine. I will tell the owner when a Codex session is due.
- **Thin handoffs:** the plans already hold the tasks in full; each handoff points at the plan tasks, the decisions, the environment and the stop conditions, plus the report template. Sonnet subagents draft the mechanical parts (interface lists, fixtures).
- **Where I would ask for Opus (owner decides):** the whole-branch gate M2 at the end, and possibly News matching and scoring (a new ranking feature), the Individual Fund insights engine, and the MB4 overlap maths. I ask again at each point; none is assumed.

## 5. Front-end strategy (Gemini, two lanes, all pages)
Capacity is not the constraint (about 10 percent of an hourly window for five packets), so packets are bundled larger and two Gemini sessions run in parallel in two worktrees. My preparation (tests first, a private reference solution built and checked by a Sonnet subagent, the packet) is the bottleneck, so it is pipelined: while one pair runs, the next pair is prepared.
- **Phase A (real backend exists; fixtures from the real routes):** G6 Home assembly (+ news later); Portfolio page (one packet, plan tasks 4 to 8); Mutual Funds in three packets (MF1 to MF5, MF6 to MF10, MF11 to MF15, with MF14 Overlap last because it needs IB and MB4).
- **Phase B (backend not built; fixtures from the backend specs, checked against the real payload at integration):** Individual Fund (two packets), Planning (one), Profile (two). Not waiting for the backend; the mismatch risk is handled at I1/I2.
- About ten packets in five rounds of two. Realistic wall time for everything including verification is more than a day, not two to three hours; the parallel lanes make Phase A about half a day. The pipeline limits are my verification and the weekly quota (45 percent used so far this week; this plan will use a large share of the rest).
