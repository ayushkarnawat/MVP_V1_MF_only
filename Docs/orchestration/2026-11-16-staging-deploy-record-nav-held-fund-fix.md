# Staging deploy record: held-fund NAV refresh fix (16 Nov 2026)

Commit `b231b6f4` on `leapswitch-redesign` (pushed; VM worktree `/opt/unifolio-redesign` fast-forwarded from `07a3057c`; the
only code between the two was this change, the rest was docs). Backend and worker rebuilt and recreated. No migration
(Alembic head unchanged), no UI change.

## The bug in plain words
Home and Portfolio read stored prices only. The 06:00 job `nav-daily` skipped any fund that already had a price from the
last 3 days, a rule written on 2 Sep 2026 for the ~1,500 category peers and reused for held funds on 8 Oct. So a held fund
stayed 1 to 3 days behind until some live page happened to refresh it. Found on 13 Nov: 8 of 46 held funds on staging were
1 to 3 days behind while mfapi.in already had their latest NAV. Not AMC lateness, not mfapi lag.

## What changed
- `app/services/dashboard/held_nav_refresh.py` (new): each held fund is compared with the date AMFI's `NAVAll.txt` lists for
  it. Behind by a few days: AMFI's own row is written (no mfapi call). More than 4 days behind, nothing stored, or fewer than
  30 stored rows: full mfapi.in history first (repairs gaps), then AMFI's row. A fund missing from the file keeps the old
  mfapi refresh. Peers keep the 3-day rule.
- `scripts/jobs/refresh_nav_daily.py`: held funds first from a fresh AMFI download, then peers and scenarios as before.
  New flags `--held-only` (retries) and `--alert-if-behind` (exit 1 on a problem so `run-job.sh` emails). Prints
  `NAV_SUMMARY`, `NAV_PROBLEM`, `NAV_NOTE` lines. AMFI unreadable: falls back to the old refresh and reports a problem.
- Cron (root, on the VM): 06:00 full; 10:30 and 14:00 held-only (14:00 with the alert flag); 14:10 digest email.
  10:30 is after the 10:00 am deadline that, to my understanding of SEBI's rule, applies to funds with large overseas holdings
  (not verified in the repo); the log lets us measure whether the retries are needed.
- Output of all nav-daily runs goes to `/var/log/unifolio-nav.log`, rotated daily, 30 kept
  (`/etc/logrotate.d/unifolio-nav`; the VM rotates at 00:00 via `logrotate.timer`).
- Daily digest `deploy/leapswitch/scripts/nav-digest.sh` + `backend/scripts/send_job_digest.py`: subject says OK,
  OK (recovered) or ATTENTION (the last run still had a problem, or fewer than 3 runs logged). Verified locally in 6 scenarios
  including a rotated log.
- Alarms (email, 14:00 run): AMFI file unreadable; AMFI's newest date older than the last working day; a held fund more than
  4 days older than the file's newest date (same limit as the stale-NAV chip); a fund still behind after the refresh. A fund
  missing from the file is only noted. A fund that has really stopped publishing will alert every day until it is sold.
- Recipients (`OPS_ALERT_EMAIL`, real file `/opt/unifolio/deploy/leapswitch/.env`, the redesign `.env` is a symlink to it):
  ayush.karnawat, siddharth.surve, aditi.shanbhag @unifolio.in. Backup of the old file: `.env.bak-2026-11-16-nav` beside it.

## Tests and review
- 536 backend tests pass in `tests/services/dashboard` and `tests/scripts` (Windows). `tests/scripts/test_refresh_news.py`
  (15 tests) fails on Windows only (`import resource` does not exist there); it was not touched and was excluded.
- Two existing tests in `test_background_jobs.py` were adapted (they call `main()` now needing `[]`, and they now state that
  they test the AMFI-down fallback).
- An independent Sonnet read-only review found no high issues. Fixed: malformed mfapi payloads, history repair after a failed
  fetch, digest vs rotation, a held refresh failure no longer blocks peers, digest status based on the last run.

## Deploy steps and evidence
- Disk: 7.6 GB free; `docker builder prune -f` (2.2 GB) and removal of the 2-week-old `leapswitch-backend:previous` image
  (2.2 GB) gave 12 GB before the build; 12 GB after.
- `sudo sh ./scripts/deploy-redesign.sh --full`: exit 0, backend and worker recreated, caddy and postgres untouched.
  `/health` 200, `ls-redesign` 200, `ls-staging` 200.
- Crontab replaced by a minimal edit of the installed one (before: `/home/deploy/crontab.before-nav-2026-11-16`).
- Test email "[LeapSwitch staging] TEST: NAV alert recipients (ignore)": SES accepted it for all three addresses (exit 0).
  Inbox receipt is for the recipients to confirm.
- First run, 16 Nov 13:26 IST, `--held-only` through `run-job.sh`: `behind=1 filled_amfi=1 still_behind=0
  amfi_newest=2026-11-15`. Held funds' newest NAV before: 45 on Fri 13 Nov, 1 on Sat 14 Nov; after: 45 on Fri 13 Nov,
  1 on Sun 15 Nov (PPFAS Liquid). Equity funds had no newer NAV to take because AMFI's own date for them is Fri 13 Nov.

- Then a held-only and a full run, both through `run-job.sh` into `/var/log/unifolio-nav.log` (13:27 IST, exit 0 each):
  `mode=full held=46 behind=0 ... amfi_newest=2026-11-15`; peers `404 of 1062` fetched (3-day rule unchanged), 20 categories,
  3 ongoing scenarios recomputed; the full run took 43 s. The log file works and rotation config passed `logrotate -d`.

## Honest list of what is not as hoped
- **No rollback image.** The build removed the previous image before `deploy.sh` could tag it (the warning it prints:
  "`:previous` was NOT updated", seen before on 3 Nov), and I had already removed the older `:previous` to free space. Rollback
  is therefore a rebuild: `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign 07a3057c` then
  `cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh --rebuild-backend`, and restore the previous crontab from
  `/home/deploy/crontab.before-nav-2026-11-16`.
- `/opt/unifolio` (main clone) is still on `feat/leapswitch-staging`; the cron `RUN` path points there, so `run-job.sh` is
  that branch's copy. The digest script is called from the redesign worktree for that reason.
- Not exercised: the failure-alert email path with a real failing run (unit-tested only), and the first unattended 06:00 run.

## How to read it
```
ssh deploy@ls-redesign.unifolio.in 'tail -20 /var/log/unifolio-nav.log'
```
The first unattended proof is the 06:00 run on 17 Nov: expect `mode=full ... still_behind=0` and a digest at 14:10 reading OK.
