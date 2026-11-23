# Staging deploy record: milestone M3 (23 Nov 2026)

Tag `m3-rc` = commit `9f776a34d7467f83104e93cf9f6d120583db2bdd` on `leapswitch-redesign` (pushed; the VM worktree `/opt/unifolio-redesign` went from `a4a948cbf7d0f9e3a6ae8986a48f47bf294f07af` (tag `m2b-rc`) to it by `git checkout -B leapswitch-redesign m3-rc`). Back end and worker rebuilt and recreated, front end rebuilt with the one new dependency, **no migration** (Alembic stays `0054 (head)`), no setting, no cron change, no price job, no stored-results rebuild. Run by the manager's Claude from `2026-11-23-staging-deploy-guide-m3.md`, with the owner's yes at both GATEs (step 4 and step 7). Times are the VM's, IST.

## What this release contains
Batch K (one search box on the Mutual Funds pages, the fund page, Home, History, Portfolio and Planning, with page-list filtering on Enter, the all-holdings and compare-list fields, "Search imports"; the top bar's old Search input removed, Ask Mira as a pill at the left), Batch E (one date module: "Prices as on", month wording for monthly data, the date strip on Allocation and Other Analytics, one shared "i" pop-up), Batch F (section anchors and the "On this page" rail). Back end: one new read-only route `GET /household/search-index`, two reworded back-end sentences. New front-end dependency `@radix-ui/react-popover`.

## Steps as run (18:48 to 18:58 IST)
| Step | Result |
|---|---|
| 0 tag | `git ls-remote origin m3-rc` = `9f776a34d7467f83104e93cf9f6d120583db2bdd`. |
| 1 scope | 113 files outside Docs and tests, all in the expected groups (back end only `api/search.py`, `main.py`, `services/search/*`, `news/copy.py`, `fund_page/returns.py`; `frontend/package.json` and lock; `frontend/src/**`; `session.md`, `decisions.md`, `CLAUDE.md`). No migration, requirements, Dockerfile, `deploy/` or `frontend/src/mobile/` file. |
| 3 pre-flight | Branch `leapswitch-redesign`, HEAD `a4a948cb...`, clean; **12 GB free** (17 of 29 GB used); `latest` `9a99dcc2dd65`, `previous` `7de6c3d9f52e`; Alembic `0054 (head)`, postgres healthy; 18:48 IST, clear of the job windows. |
| 4 rollback safety | `previous` tagged to `9a99dcc2dd65` (same id as `latest`). `backup.sh` exit 0 (its only output: retention deleted the 15 Nov backup `unifolio-20261115T193001Z.sql.gz`; bucket listing not repeated). Crontab copy `/home/deploy/crontab.before-m3-2026-11` (73 lines, same as at M2b). |
| 5 | No setting; `.env` not touched. |
| 6 tag | `git fetch origin` picked up `m3-rc` and the four batch branches; VM `HEAD` = `9f776a34d7467f83104e93cf9f6d120583db2bdd`, clean ("behind by 1 commit" is the documents-only commit after the tag). |
| 7 deploy | `deploy-redesign.sh --full`, run detached (log `/home/deploy/m3-deploy.log`), 18:51:37 to 18:52:32 (55 s), **exit 0**. Back-end image built (base layers cached); front end `npm` "added 308 packages in 8s", `@radix-ui/react-popover` present in `node_modules`; `tsc -b && vite build` **built in 5.31s**. Backend and worker recreated (started 18:52:32, 0 restarts); **caddy and postgres untouched**. Recorded backend commit `9f776a34...`. New image **`8d96470468a8`** in backend and worker; `previous` `9a99dcc2dd65`; the old `7de6c3d9f52e` image was pruned by the script (3 MB reclaimed). `alembic current` = `0054 (head)`. Disk after: still 12 GB free. |
| 8 | Nothing to run (no number changed). |
| 9 verify | `200` on `ls-staging-api/health`, `ls-redesign`, `ls-staging`; **0** ERROR lines in the backend log (last 15 min). `GET /household/search-index` without a token = **`401`** (a made-up `/household/no-such-route-xyz` = `404`, so the route is served). Running image: `copy.py` count of "holdings as on" = `1`; `search.router.routes` = `['/household/search-index']` (see the first item below on the guide's own check). Front end: the page references 19 scripts; following every lazy chunk gave 69 files: "Ask anything about your funds" in `index-DjS7_fD8.js`, "On this page" in `MutualFundsFrame-Bz3mo_JT.js`, "Search funds" in `OverlapPage-D1B_J7l9.js` and `index`, "Prices as on" in `HomePage-BH8QyHcm.js`, "Some results are unavailable" in `index`; "Search investments" in **none**. The served `index-DjS7_fD8.js` is the file this build produced. |

## Honest list of what differed from the guide or is not done
- **SSH timed out at first (step 3).** The laptop's public address had changed to `122.177.18.218` (the `unifolio-web` SSH allowlist held only `106.219.134.x`); HTTPS and the VM's port 443 answered, port 22 to GitHub worked, and the WSL key was the registered one, so it was the allowlist. The owner added `122.177.18.218/32` (TCP 22) to `unifolio-web`; after that the host key matched the runbook's fingerprint (`SHA256:J0nPZnfm...wyQ4`). The runbook's section 1.3 should list this address. The CloudPe API was not used (no key in this session), so the interface and group were not read by API.
- **The guide's route check printed `[]`, not `['/household/search-index']`.** FastAPI on the VM is **0.141.1**, which keeps each included router as one `_IncludedRouter` entry in `app.routes` (19 entries in all) instead of copying its routes up, so the guide's one-liner cannot see any included route. The route is in the running image (`app.api.search.router.routes`) and is served (`401` against `404` for a made-up path). Future guides should check `search.router.routes` or the HTTP code, not `app.routes`.
- **Disk was exactly at the guide's 12 GB minimum** before and after (the deploy freed only 3 MB). The next back-end deploy has the same margin; freeing space before M4 would be safer.
- **`npm` reported "7 vulnerabilities (3 moderate, 4 high)"** at install. Not checked whether this is new with `@radix-ui/react-popover` or was already there; left for the cleanup release.
- **The owner's browser look (step 9's last part) is not done by me**: I cannot sign in. The owner opens `https://ls-redesign.unifolio.in/` in a private window (top bar, Overview search and Enter filter, Allocation strip and rail, Other Analytics strip and the "i" in Valuation by Fund). The M3 QA rows run once after M4.
- **Not yet verified anywhere:** the search endpoint's answer on real data against Postgres (the tests use SQLite); only its `401` is checked here.
- **Left on the VM:** `/home/deploy/m3-deploy.log`, `m3-deploy.exit`, `m3-deploy.start` (this deploy's log and timing); safe to delete.

## How to read it, and how to roll back
```
ssh deploy@ls-redesign.unifolio.in 'cd /opt/unifolio-redesign && git log -1 --format=%H && sudo docker image ls leapswitch-backend --format "{{.Tag}} {{.ID}}"'
```
Expect `9f776a34...`, `latest 8d96470468a8`, `previous 9a99dcc2dd65`.

Rollback (only on the owner's yes): back end `sudo sh ./scripts/rollback.sh` from `deploy/leapswitch` (points `latest` back at `previous` = `9a99dcc2dd65`; check the id first); front end `git checkout -B leapswitch-redesign a4a948cbf7d0f9e3a6ae8986a48f47bf294f07af` then `deploy-redesign.sh`. Nothing else was touched (no migration, setting, cron or stored results; crontab copy at `/home/deploy/crontab.before-m3-2026-11`). No `clean-db.sh`, no `restore.sh`.

## What is next
M3 is on staging. The owner's private-window look above; the M3 QA rows once after M4; then M4.
