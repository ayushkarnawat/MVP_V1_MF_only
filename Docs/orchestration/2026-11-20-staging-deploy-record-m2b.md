# Staging deploy record: milestone M2 part 2 (20 Nov 2026)

Tag `m2b-rc` = commit `a4a948cbf7d0f9e3a6ae8986a48f47bf294f07af` on `leapswitch-redesign` (pushed; the VM worktree `/opt/unifolio-redesign` went from `d6157c80c6247088a346ae3197a353f1d893aec6` to it by a plain checkout of the tag; the tag's code is identical to the tested `batch/d-part2`). Back end and worker rebuilt and recreated, front end rebuilt, **no migration** (Alembic stays `0054 (head)`), no setting, no cron change. Run by the orchestrator from `2026-11-20-staging-deploy-guide-m2b.md`, with the owner's go for M2. Times are the VM's, IST.

## What this release contains
Batch D, second part: up to three benchmarks on the Home graph (a checklist, one colour per benchmark, end labels, legend chips that hide or show a line), the same graph on the Mutual Funds Overview (under the summary strip, loaded after the table), the "View all by day's change" pop-up (Fund, Category and Sector views, funds waiting for a price listed apart, funds priced only from a statement in their own block, last-price-day rows with a note on a weekend or holiday, errors, hide-values), and the additive back end behind them (`benchmarks` and `benchmark_series`; `movers?all=true`). Review trail: `2026-11-20-batch-d-backend-review.md`, `2026-11-20-batch-d-whole-batch-review.md`, `decisions.md`.

## Steps as run (12:24 to 12:28 IST)
| Step | Result |
|---|---|
| 3 pre-flight | Clean worktree on `d6157c80`; 12 GB free; `latest` `7de6c3d9f52e`, `previous` `518b172eb440`; Alembic `0054 (head)`; four containers up (postgres healthy); 12:24 IST, clear of the 14:00 window. |
| 4 rollback safety | `leapswitch-backend:previous` tagged to `7de6c3d9f52e` (the M2 part 1 image; same id as `latest`, no extra disk). On-demand backup: `backup.sh` exit 0 (as for part 1, I did not repeat a bucket listing). Crontab copy `/home/deploy/crontab.before-m2b-2026-11` (73 lines). |
| 6 tag | VM `HEAD` = `a4a948cb...` exactly; clean. |
| 7 deploy | `deploy-redesign.sh --full`: exit 0; front end `built in 5.53s`; backend and worker recreated, **caddy and postgres untouched**; recorded backend commit `a4a948cb`. New image `9a99dcc2dd65` in backend and worker; `previous` still `7de6c3d9f52e`; `alembic current` = `0054 (head)`. Disk after: still 12 GB free. |
| 8 | Nothing to run (no price job, no rebuild: no stored number changed). |
| 9 verify | `200` on the API health, `ls-redesign` and `ls-staging`; zero ERROR lines in the backend log since the deploy; the running back end has the new code (`MAX_BENCHMARKS` is `3`); the served front end is the new one (the strings "Everything that changed today" and "Choose up to" are in the `HomePage` and `WealthGraph` chunks the page loads). |

## Honest list of what differed from the guide or is not done
- **The first bundle check of the guide found nothing** (the strings live in lazy chunks, not in the `index` file). I checked every chunk the index loads and found them in `HomePage-*.js` and `WealthGraph-*.js`; the guide's step 9 should say "search the chunks".
- **The owner's browser checks are not done**: rows M2-15 to M2-28 of the combined QA checklist, once after M4. I cannot sign in, so I have not seen the graph, the checklist or the pop-up on the live site; the new pieces were looked at in a real browser from a test page with made-up numbers (light, dark, hide-values) before the deploy.
- **Backup bucket listing not repeated** (as for part 1).
- **Accepted by the owner (20 Nov, "whatever you recommend"):** if the Overview's benchmark list fails to load, the graph loads without benchmarks and its Try again re-asks only for the graph; the list loads again on a scope change or reload.
- **Left as a known follow-up:** the white label on the bright green in the app-wide primary button and the "Import statement" button (a palette follow-up for the cleanup release).
- **Tests on the tested tree:** front end 6,316 passed, back end 6,078 passed, 0 failed (details in the guide's step 2). My own temporary files on the VM (this deploy's log and exit file, the backup log) were removed.

## How to read it, and how to roll back
```
ssh deploy@ls-redesign.unifolio.in 'cd /opt/unifolio-redesign && git log -1 --format=%H && sudo docker image ls leapswitch-backend --format "{{.Tag}} {{.ID}}"'
```
Rollback (only on the owner's yes): back end `sudo sh ./scripts/rollback.sh` from `deploy/leapswitch` (points `latest` back at `previous` = `7de6c3d9f52e`); front end `git checkout -B leapswitch-redesign d6157c80c6247088a346ae3197a353f1d893aec6` then `deploy-redesign.sh`; nothing else was touched (no migration, setting, cron or stored results). No `clean-db.sh`, no `restore.sh`.

## What is next
M2 is on staging. The owner's QA rows run once after M4 (M2-01 to M2-28); the single combined stakeholder message is ready as a draft (`2026-11-20-m2-stakeholder-message-draft.md`) and waits for the owner and a refresh of the two Excel files on the day of sending. Next milestone: M3 (search and navigation: Batches K, F, E).
