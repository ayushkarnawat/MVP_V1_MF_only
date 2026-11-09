# QA fixes: baseline (6 Nov 2026)

Branch `qa-fixes-lane` cut from `origin/leapswitch-redesign` at `72badaef`, clean tree.

| Suite | Result before any change |
|---|---|
| Front end: `components/mf`, `features/import`, `features/home`, `features/auth`, `features/profile`, `features/profile-v2`, `shell` | 216 files, 2547 passed, 2 skipped, 0 failed |
| Back end: `tests/services/auth`, `tests/api`, `tests/services/import_` | exit 0, no failures (the count line was cut off by the log tail; the same folders plus the new Task 1 tests give 1512 passed, 5 skipped) |

Front end check copy: `~/qa-fe` in WSL (node_modules seeded from `~/ui-r2-fe-chk`), run with
`CR6_SRC=<wt/qa-fixes/frontend> CR6_DST=$HOME/qa-fe bash Docs/orchestration/cr-r6-fe-check.sh test <paths>`.

## Baseline screenshots (taken 6 Nov 2026, headless Chrome, local stack)

How: the real backend on SQLite (stub OTP and email) and the Vite dev server, both on WSL; a Playwright script drove the real sign-up and the real
import of the synthetic statements `r2_couple_rohan_priya_10yr.pdf`, then `big_family_ayush_anand_7yr.pdf` (password `MF@123`). Files live in the
orchestrator's scratch folder `.../scratchpad/shots/` and are named `before-<screen>-<width>.png` (not committed). The "after" set is taken with the
same scripts (`shots.py`, `ch*.py`) so a pixel comparison is fair.

| Group | Screens captured (1440x810 unless a width is in the name) |
|---|---|
| Changed screens | import notice with new funds (46 funds, two people), plain notice ("already imported"), sign-up 4 with errors, All set, Import History after View details, Choose head dialog step 1, Delete member dialog, Delete account dialog (reason step) |
| Unchanged neighbours | Home (1440 and 1920), Mutual Funds Overview, Holdings, Allocation, Profile Family, Settings, Import History, Personal, Import options, sign-up 1 to 6, login |

**Not captured yet** (they need states the seed does not have; captured after the build with the same scripts and a mocked response where needed):
the Home donut with several slices (the local database has no scheme master, so allocation is 100 percent equity: the hover check uses a mocked
`/home` allocation response), the Choose head dialog with a fixable member, the review step, the sign-in notice after a head change, and both
refusal dialogs (they need a completed head change on a throwaway account).
