# QA fixes: baseline (6 Nov 2026)

Branch `qa-fixes-lane` cut from `origin/leapswitch-redesign` at `72badaef`, clean tree.

| Suite | Result before any change |
|---|---|
| Front end: `components/mf`, `features/import`, `features/home`, `features/auth`, `features/profile`, `features/profile-v2`, `shell` | 216 files, 2547 passed, 2 skipped, 0 failed |
| Back end: `tests/services/auth`, `tests/api`, `tests/services/import_` | exit 0, no failures (the count line was cut off by the log tail; the same folders plus the new Task 1 tests give 1512 passed, 5 skipped) |

Front end check copy: `~/qa-fe` in WSL (node_modules seeded from `~/ui-r2-fe-chk`), run with
`CR6_SRC=<wt/qa-fixes/frontend> CR6_DST=$HOME/qa-fe bash Docs/orchestration/cr-r6-fe-check.sh test <paths>`.

## Baseline screenshots

Not taken yet. They are taken before the first front end packet goes to the worker (Task 0 step 3),
and named `before-<screen>.png` in the orchestrator's scratch folder.
