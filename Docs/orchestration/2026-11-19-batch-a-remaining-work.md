# Batch A: what is done and what is left (tracker, 19 Nov 2026 night)

This list exists so nothing is forgotten. Update it whenever a task finishes. Approved fixes are the owner's decisions of 19 Nov (`2026-11-19-batch-a-fix-proposals.md`).

## Done
| Item | State |
|---|---|
| XR-2, RK-3, CA-3, XR-3 (tests and findings) | Done and committed (`batch/a-numbers`) |
| RK-4 real-data reconciliation | Done; ranked pools now equal the recount 57 of 57 |
| FX-10a, FX-10d (pool representative, Growth only) | Built, verified on staging data (`batch/a-fixes` 851bea0b) |
| Wording fix (a held fund with no Growth series) | Built and tested (`batch/a-wording` 1d181fab) |

## Ready to relay now (two Codex at once, different worktrees)
| Task | Covers | Worktree | Handoff |
|---|---|---|---|
| RK-7b | FX-10b (average follows the rank rule incl. the index rule), FX-9a (workbook legacy blend) | `D:\unifolio-a-fixes` | `2026-11-19-rk7b-average-pool-and-legacy-blend-handoff.md` |
| XFIX-1 | FX-8c (final flow dated with the price date), FX-8a small version, FX-8b | `D:\unifolio-a-xirr` | `2026-11-19-xfix1-final-flow-date-handoff.md` |

## Approved, queued behind XFIX-1 (same files; not forgotten)
| Task | Covers | Design (decided by the orchestrator) |
|---|---|---|
| XFIX-2 (backend) | FX-8d | The nightly price job (`scripts/jobs/refresh_nav_daily.py`, all three runs) triggers the same household recompute for households that hold a fund it filled in that run, so the stored per-fund column catches up within the run; add an additive "as on" price date to the tile and the column. The tile keeps computing live. Test: XR-3 T8-7 (strict expected failure) must XPASS |
| XFIX-3 (backend) | FX-8e | Holdings under a year: return since purchase, flagged "not annualised"; flows that net to zero: no figure (a dash), not 0%. Tests: T8-9 short-period fixtures and the same-day net-zero fixture (strict expected failures) |
| FE-1 (frontend, Antigravity) | FX-8d, FX-8e screens | The "as on <date>" label on the tile and column; the "not annualised" label and the dash; copy and drawings from workbook A1 section 9 ("Tile and column", "A fund held for 3 months"); red tests first |

## Still to do before the M2 freeze
RK-5 (cross-checks against AMFI and SEBI; the plan's own FX-10b "differences by definition" is decided here), XR-5 (short-period examples), the returns spot check and T10-5 (real data), RK-9 and CA-6 (the two workbook exporters), RK-8 and CA-8 (two one-line notes), RK-10 and CA-9 (verify the workbooks on real data after the fixes), the whole-plan adversarial review (XR-7, RK-11, CA-10), the stored-result rebuild step and the before-and-after list in the M2 guide. Then Batch D (D-2 needs the owner's yes on the colour fix) and Batch H part 1.

## Parked on purpose
FX-10c (one common end date for a pool; no pool mixes end dates today; re-check after a weekend and a holiday). The FX-8a price fallback chain (large radius, rare case). The L audits and the factsheet work (parked, not dropped).
