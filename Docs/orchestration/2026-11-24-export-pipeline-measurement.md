# I-2 result: today's PDF export pipeline on staging (measured 23 Nov 2026 around 23:10 IST by the manager's Claude)
Script: `backend/scripts/diagnose_export_pipeline.py`; guide: `2026-11-23-i2-export-measurement-guide.md`. VM on `m3-rc` (`9f776a34`). Steps 0 to 4 done; **step 5 (the 12 real export calls) not yet run: it needs a signed-in session.**

## What was measured
| Check | Result |
|---|---|
| `FRONTEND_BASE_URL` is the staging host | yes |
| Print page reachable from the container | HTTP 200 |
| Backend processes | **three workers** (`--workers 3`) plus the parent. The script counted 1 because the workers start under Python's `multiprocessing` name; fixed in the script (now counts both). |
| Browsers already running at start-up | **three: each worker starts its own headless Chromium when the app starts** (the old pipeline's `start_browser()` in `main.py`). They are already inside the 798 MB baseline. |
| Memory cost of three more idle browsers | container total 800 MB -> 1,065 MB: **about 265 MB, about 90 MB per idle browser** (the script's own "1,931 MB resident" figure counts shared memory many times over and overstates it) |
| Memory ceiling | `None`: no limit is visible inside the container at the place the script looks (the compose file sets a `mem_limit` on the worker service; the backend's is not visible from here) |
| Disk | 12 GB free before and after (unchanged) |

## What it means
- **The three-process shape is real**, which is the condition for the old export's cross-worker token problem (the token lives in one process's dictionary; the browser's second request lands on any of three). Confirming the failure rate (about two in three) needs step 5.
- **Memory is not the constraint.** An idle browser is about 90 MB, so a report-time browser (Batch I's on-demand pool) is affordable, and removing the three start-up browsers saves about 270 MB once the old path is retired. A render with a big household will use more while it runs: that is measured in I-13, not here.
- **A cross-process limit is needed.** "At most two exports at once" cannot be a per-process counter when three processes serve requests: three workers would each allow two. I-3 therefore limits across processes (file locks, below).

## Still open
Step 5 (real export calls on staging) and the run's step 6 (remove the copied script, count log errors, confirm containers and disk). The manager's Claude wrote a helper so the owner's session token never passes through it; whoever runs it needs a staging account with some data.
