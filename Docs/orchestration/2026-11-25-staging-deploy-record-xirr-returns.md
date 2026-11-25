# Staging deploy record: Batch XR, XIRR leads and Returns on the flip side (25 Nov 2026)

Tag `xr-rc` = commit `942356f4df316279fdca871483d05be626c9fb0e` on `leapswitch-redesign` (pushed). The VM worktree `/opt/unifolio-redesign` went from `355cc8a1f117210f3ec2a73a06e0ee33dac54951` (tag `m4-rc`, the rollback target) to it by `git checkout -B leapswitch-redesign xr-rc`. Back end and worker rebuilt and recreated, front end rebuilt, **no migration** (Alembic stays `0054 (head)`), no setting, no cron change, no price job, stored results rebuilt. Run by the manager's Claude from `2026-11-24-staging-deploy-guide-xirr-returns.md`, with the owner's yes at the disk clean-up, at step 4 and at step 7. Times are the VM's, IST.

## What this release contains
XIRR is the headline on the Portfolio tile, the Mutual Funds tile and the Mutual Funds holdings list; the plain gain since purchase ("Returns") is on the flip side of each tile ("Show Returns" / "Show XIRR"); a caution chip on the XIRR (`held under 1 yr`, `one transaction`); two columns in the list (Returns, then XIRR), also in the PDF report's Overview page; "return on invested" with an "i" tooltip. Back end additive only (the since-purchase value is always sent; optional `*_xirr_caution` and `xirr_caution` fields).

## Steps as run (10:54 to about 11:45 IST)
| Step | Result |
|---|---|
| 0 tag | `git ls-remote --tags origin xr-rc` = `942356f4df316279fdca871483d05be626c9fb0e`; local `xr-rc` the same. |
| 1 scope | `git diff --name-only m4-rc xr-rc` outside Docs and tests: 25 files, all in the guide's expected groups (back end `api/dashboard.py`, `services/analytics/{benchmark,schemas}.py`, `services/dashboard/{aggregate,holdings,portfolio_schemas,portfolio_summary,schemas,xirr}.py`; the listed front-end files; `CLAUDE.md`, `decisions.md`, `session.md`). No migration, dependency file, `frontend/src/mobile/`, deploy script or `.env` file. |
| 2 evidence | **Not re-run by me.** I relied on the guide's recorded numbers (front end 7,178 passed and 1 failed that also fails on `m4-candidate`; back end 4,294 passed, 0 failed; G1, G2, G3 reviews). |
| 3 pre-flight | Branch `leapswitch-redesign`, HEAD `355cc8a1...` = `m4-rc`, clean; Alembic `0054 (head)`; both M4 settings present (count 2, no values printed); 10:54 IST, clear of the job windows. **Free disk 8.1 GB, below the guide's 12 GB: stopped and asked the owner** (see the list below). `latest` `88c8109dcd54`, `previous` `8d96470468a8` (the M3 image). |
| disk clean-up (owner's yes) | `docker builder prune -f` freed 20 MB only. Then, with the owner's yes: removed `/home/deploy/step0` and `/home/deploy/factsheets-oct2026` (one-off October working copies), `apt-get clean`, `journalctl --vacuum-size=20M` (94 MB). Free 8.1 to 8.7 GB. |
| 4 rollback safety (owner's yes) | `previous` tagged to `88c8109dcd54` (same id as `latest`). On-demand `backup.sh` ran; the bucket listing shows **`unifolio-20261125T055422Z.sql.gz`, 188,159,296 bytes**, uploaded 11:25. Crontab copy `/home/deploy/crontab.before-xr-2026-11` (5,379 bytes, 65 lines). The now-untagged M3 image `8d96470468a8` was then removed with `docker rmi` (unused by any container): **free 11 GB**. |
| 5 | No setting; `.env` not touched (only counted two keys). |
| 6 tag | `git fetch origin`; VM `HEAD` = `942356f4df316279fdca871483d05be626c9fb0e`, clean ("behind by 6 commits" are the documents-only commits after the tag). |
| 7 deploy (owner's yes) | `deploy-redesign.sh --full`, run detached (log `/home/deploy/xr-deploy.log`), 11:32:23 to 11:36:01 (3 min 38 s), **exit 0**. `npm` "added 308 packages in 8s"; `tsc -b && vite build` **built in 6.12 s**. Backend and worker recreated (started 11:36, 0 restarts, no OOM); caddy and postgres untouched. New image **`d220ffd0e4b3`** in backend and worker; `previous` = `88c8109dcd54` (M4). `alembic current` = `0054 (head)`. Free disk after: **7.0 GB** (22 of 29 GB used). |
| 8 rebuild | `run-job.sh analytics-recompute-xr scripts/run_analytics_recompute.py --all` started 11:36, **exit 0**, 54 log lines, 0 lines with error/traceback/failed; the script prints no summary count of its own (log `/home/deploy/recompute-xr.log`). Proof query: **7 `benchmark_funds` rows, 6 with `xirr_caution`**. The row without it is a household with `funds = []`, so it has nothing to carry the field. |
| 9 verify | `docker compose ps`: postgres healthy, backend, worker and caddy up. `200` on `ls-staging-api/health`, `ls-redesign` and `ls-staging`. **0** ERROR lines in the backend log (last 20 min). Running image has the new code: `hasattr(PortfolioXirrDisplay(), 'caution')` = `True`. |

## Honest list of what differed from the guide or is not as hoped
- **Disk was below the guide's minimum.** 8.1 GB free at step 3 against 12 GB. The cache prune freed 20 MB; the owner approved removing the old working folders, caches and the old M3 image. Before the deploy it reached 11 GB (above the script's 10 GB guard, below the guide's 12 GB); **after the deploy it is 7.0 GB**. The next back-end deploy will be blocked by the 10 GB guard unless space is freed first. Candidates not touched: `/home/deploy/pre-ux-202610221107.sql.gz` (170 MB), the other files in `/home/deploy`, old `crontab.before-*` copies (small).
- **I did not re-run step 2's tests.** The numbers above are the guide's, not mine.
- **The guide's step 4 check of the backup log was misleading.** `/var/log/unifolio-backup.log` was last written 23 Nov and holds old `Permission denied` lines for `backup.sh` (from the cron path), so its tail proved nothing. I confirmed the backup by listing the bucket (nightly dumps of 24 and 25 Nov are there too). The log file not being updated is unexplained and not investigated.
- **Step 8 has no summary line** (the guide expected "the script's own counts"); I relied on exit 0, the clean log and the proof query. The proof query's "second equals first" did not hold (6 of 7) for the reason in the table; I checked the structure of the short row (no personal data printed).
- **Left on the VM:** `/home/deploy/xr-deploy.{log,start,exit}`, `xr-recompute.start`, `recompute-xr.log` (this deploy's logs and timings; safe to delete).
- **The owner's QA is not done by me:** rows XR-01 to XR-12 of `2026-11-19-combined-qa-checklist.md` need a signed-in private window at `https://ls-redesign.unifolio.in/`. Allow up to 15 minutes of web cache after the rebuild (tile and list can disagree until then). Known accepted gaps are listed at the end of the guide.

## How to read it, and how to roll back
```
ssh deploy@ls-redesign.unifolio.in 'cd /opt/unifolio-redesign && git log -1 --format=%H && sudo docker image ls leapswitch-backend --format "{{.Tag}} {{.ID}}"'
```
Expect `942356f4...`, `latest d220ffd0e4b3`, `previous 88c8109dcd54`.

Rollback (only on the owner's yes): back end `sudo sh ./scripts/rollback.sh` from `deploy/leapswitch` (points `latest` back at `previous` = `88c8109dcd54`; check the id first); front end `git checkout -B leapswitch-redesign 355cc8a1f117210f3ec2a73a06e0ee33dac54951` then `deploy-redesign.sh`. No migration was run. Crontab copy `/home/deploy/crontab.before-xr-2026-11`; backup `unifolio-20261125T055422Z.sql.gz` in the bucket. No `clean-db.sh`, no `restore.sh`, no `rollback.sh` was run.

## What is next
Batch XR is on staging. The owner's private-window QA (XR-01 to XR-12); free disk space before the next back-end deploy.
