# Batch A: what is done and what is left (tracker, 19 Nov 2026 night)

This list exists so nothing is forgotten. Update it whenever a task finishes. Approved fixes are the owner's decisions of 19 Nov (`2026-11-19-batch-a-fix-proposals.md`).

## Done
| Item | State |
|---|---|
| XR-2, RK-3, CA-3, XR-3 (tests and findings) | Done and committed (`batch/a-numbers`) |
| RK-4 real-data reconciliation | Done; ranked pools now equal the recount 57 of 57 |
| FX-10a, FX-10d (pool representative, Growth only) | Built, verified on staging data (`batch/a-fixes` 851bea0b) |
| Wording fix (a held fund with no Growth series) | Built and tested (`batch/a-wording` 1d181fab) |

## Done since this list was first written (continued)
XFIX-2 (FX-8d, FX-8e backend; `batch/a-xirr-fixes` 384ba2d1) and RK-9 (the rank reference workbook, first cut; `batch/a-fixes` ef850d01), both verified; RK-9's formulas recalculated in LibreOffice.

## Done since (night of 19 Nov)
M2 candidate built (`m2-candidate`, worktree `D:\unifolio-m2`, pushed): the four Batch A branches merge cleanly, wide run 3669 passed, only the 8 known pre-existing failures. XR-5 written. RK-5 part 1 (T10-2) done. CA-6 relayed a second time after its drift answers. FE-1a handoff written, to be relayed. All Batch A branches are backed up on the remote.

## Next (backend of XFIX-2 has reported)
FE-1 (front end, Antigravity): the "as on <date>" label on the tile and column, the "not annualised" label and the dash, from the new fields; red tests first. FX-8e is **narrowed** to the two portfolio tile figures and the per-fund column (the owner's small-radius rule); the fund page, benchmark and window figures are listed as a follow-up the owner can widen.

## Still to do before the M2 freeze
RK-5 (cross-checks against AMFI and SEBI; the plan's own FX-10b "differences by definition" is decided here), XR-5 (short-period examples), the returns spot check and T10-5 (real data), RK-9 and CA-6 (the two workbook exporters), RK-8 and CA-8 (two one-line notes), RK-10 and CA-9 (verify the workbooks on real data after the fixes), the whole-plan adversarial review (XR-7, RK-11, CA-10), the stored-result rebuild step and the before-and-after list in the M2 guide. Then Batch D (D-2 needs the owner's yes on the colour fix) and Batch H part 1.

## Parked on purpose
FX-10c (one common end date for a pool; no pool mixes end dates today; re-check after a weekend and a holiday). The FX-8a price fallback chain (large radius, rare case). The L audits and the factsheet work (parked, not dropped).


## Batches D and H part 1 opened (20 Nov, owner approved on 19 Nov: "approval with Batch D and H part 1")
| Piece | State |
|---|---|
| Branches and worktrees | `batch/d-charts` at `D:\unifolio-d-charts`, `batch/h-tutorial` at `D:\unifolio-h-tutorial`, both cut from `leapswitch-redesign` (after M1). Front-end check lanes `d` and `h` added to `wave-fe-check.sh`. Wave-start checks D-1 and H-1 done: no drift. |
| D-2 colour fix (FX-13d) and D-3 shared graph | Handoff `2026-11-20-d2-d3-colour-and-shared-graph-handoff.md` (Codex). The owner's approval of Batch D covers the colour fix. `home-tokens.css` and its test are **left untouched** for now (the keep-or-remove decision stays open). |
| H-2 script and copy | Done: `2026-11-20-h2-tutorial-script-and-copy.md` (the live CAMS form's words; flags the two mismatches with the app's screen text for the owner). |
| H-3 red tests | Handoff `2026-11-20-h3-tutorial-red-tests-handoff.md` (Codex). Then H-4 (Antigravity look) and H-6 (Codex logic and wiring). |
| Still to write | D-4 and D-8 (backend, Codex; they share `services/home/schemas.py` and `api/home.py`, so D-8 gets its own worktree and D-4 follows or merges), D-5 (red tests), D-6 and D-10 (Antigravity packets), D-7, D-9, D-11, D-12 (waits for the common-end-date rule; FX-10c is parked), H-4 packet, H-6 handoff. |
| Needs the owner (for H-5, the final video; not blocking part 1) | A fresh recording of the password step with a valid made-up password; a real recording of the Unifolio request, upload and funds scenes once the pop-up exists; a screenshot of the real CAMS email with details hidden; confirmation that CAMS accepts a ten-year range; clean browser profile, autofill off. Part 1 ships first with a placeholder; `look2-v5.mp4` (4.5 MB) exists and gets a frame-by-frame privacy review before it goes live even as a placeholder. |
