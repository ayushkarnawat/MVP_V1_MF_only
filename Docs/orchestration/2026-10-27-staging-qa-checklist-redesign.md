# Post-deploy staging QA checklist: UI redesign (`ls-redesign.unifolio.in`)

**Printable and self-contained.** Run it in one sitting after the deploy guide (`2026-10-27-staging-deploy-guide-redesign.md`) is finished. Tick one row at a time. The owner does every account creation, sign-in and password entry; the orchestrator cannot reach the VM, so whoever runs a command pastes its output.

**Environment:** redesign link `https://ls-redesign.unifolio.in` (same API, database, worker and cron as `https://ls-staging.unifolio.in`). VM commands run in `/opt/unifolio-redesign/deploy/leapswitch` as root or with `sudo`. Branch under test: `leapswitch-redesign` (never `main`, never `feat/leapswitch-staging`). Synthetic statements: `Docs/CAS Files/synthetic/pdfs/realistic/`, password `MF@123`.

**Date / tester / commit under test (`git log -1 --format=%h`):** ______ / ______ / ______

**How to fill it in:** Pass, Fail or Skip in the notes column with a short note; initials in the last column. "Expected: look for ..." means the exact text is not fixed by the sources, so judge it by what is described. **Fixer:** Backend = backend developer/Claude session; Frontend = frontend session; Ops = owner or manager on the VM; Owner = a decision, not a bug.

**Rule (also in the sign-off block):** any failed row blocks sign-off until it is fixed and re-run, or recorded as an owner-accepted Low with the owner's initials.

---

## Group A: Deploy health

| # | Step | How to check | Expected result | Pass / Fail / Notes | Owner initials | If it fails: meaning and fixer |
|---|---|---|---|---|---|---|
| A1 | Migrations at 0046 (guide section 3) | `docker compose run --rm -T backend alembic current` | Last line `0046 (head)`. Chain is 0043, 0045, 0044, 0046 | | | A migration did not apply or the wrong branch is checked out. Ops re-runs `alembic upgrade head`; if it errors, Backend |
| A2 | Tables and column exist | `docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "\d job_runs"` and `-c "\d news_items"` and `-c "select count(*) from stock_master where nse_symbol is not null"` | Both tables described; `job_runs` has `job_name`, `last_success_at`; the count query runs (value may be 0 before the NSE fill) | | | Migration 0044/0046 missing. Ops, then Backend |
| A3 | Branch deployed | `cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%h` | `leapswitch-redesign`; hash includes merge `96dc4d92` and `2f1ad702` (`git merge-base --is-ancestor 96dc4d92 HEAD && echo ok`) | | | Wrong branch or stale pull. Ops. Never deploy from `main` or `feat/leapswitch-staging` |
| A4 | Containers healthy | `docker compose ps` | postgres, backend, worker, caddy all `running`/`healthy`, none restarting | | | A crashed container. Ops reads `docker compose logs backend --tail 80`; code error goes to Backend |
| A5 | Health URLs | `curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health` and the same for `https://ls-redesign.unifolio.in/` and `https://ls-staging.unifolio.in/` | `200` for all three | | | 502 = backend not up (A4). Frontend 200 with old content = hard refresh, then rebuild with `deploy-redesign.sh`. Ops |
| A6 | deploy-redesign.sh ran and the bundle is the new one (guide section 4) | Open `https://ls-redesign.unifolio.in` in a private window, hard refresh | The redesigned shell loads; no console errors on first paint | | | Bundle not rebuilt (Ops runs `deploy-redesign.sh`) or a Frontend bug |
| A7 | Cron installed (guide section 8) | `crontab -l \| grep -E "nse-symbol-fill\|news-refresh"` (as the user that installed it, root) | Lines for `nse-symbol-fill` (`20 5 * * 0`), `news-refresh` (`15 7,10,13,16,19,22`) and `news-refresh-catchup` (`30 23`) | | | Crontab not reinstalled from the redesign worktree copy. Ops |
| A8 | Settings in effect (guide section 5) | `docker compose run --rm -T backend python -c "from app.config import settings as s; print(s.news_enabled, bool(s.healthcheck_news_url), s.news_disabled_sources, s.nse_symbol_fill_enabled)"` | `True True <your list or empty> True` | | | `.env` edited but values not picked up, or typo in a name. Ops |
| A9 | First runs of the jobs are logged | News: output of guide section 6 (`news_refresh files_ok=...`). NSE: output of guide section 7 (`fill_nse_symbols: success=True updated=...`). Heartbeat: the Healthchecks.io check shows a recent ping | Both jobs exit 0; Healthchecks.io shows a ping after the live news run | | | Job error. Ops pastes the log; Backend fixes. A failed run also emails `OPS_ALERT_EMAIL` via `run-job.sh` |
| A10 | No errors in the last 15 minutes | `docker compose logs --since 15m backend worker \| grep -i -E "error\|traceback\|exception" \| head -30` | No output, or only known benign lines you can explain (paste them) | | | An unexplained error is a bug. Backend |
| A11 | Old link unchanged | Open `https://ls-staging.unifolio.in` (second browser profile): Dashboard, Analytics, History | Looks and behaves as before the deploy (additive-only guarantee) | | | The backend change broke an old route. Backend, urgent. Roll back (guide section 19) if it is more than cosmetic |

## Group B: Data and jobs

| # | Step | How to check | Expected result | Pass / Fail / Notes | Owner initials | If it fails: meaning and fixer |
|---|---|---|---|---|---|---|
| B1 | News dry run (guide section 6) | `docker compose run --rm -T backend python scripts/jobs/refresh_news.py --dry-run --hours 5` | Exit 0; a `news_refresh files_ok=... rows=... kept=... inserted=...` style summary; nothing written, no heartbeat ping. Expected: look for `files_ok` above 0 and a plausible `kept` | | | `files_ok=0` = GDELT not reachable from the VM; Ops checks outbound HTTPS. Parse or tag problem = Backend |
| B2 | News live run, 26 hours (section 6) | `/usr/bin/time -v docker compose run --rm -T backend python scripts/jobs/refresh_news.py --hours 26` | Exit 0; `inserted` above 0; the `/usr/bin/time -v` block shows "Maximum resident set size" and "Elapsed (wall clock)". Record both. NEEDS CHECK: no memory or duration limit is stated in the sources; the VM budget is 16 GB shared with the 05:40 to 06:35 batch window | | | Non-zero exit or memory near the VM limit: Backend. Do not enable the cron until understood |
| B3 | News live run, 5 hours | Same command with `--hours 5` | Exit 0; `inserted` small or 0 (duplicates are fine); heartbeat ping arrives | | | As B2 |
| B4 | New ingest counters sane | Read the stats line of B2: `skipped_bad_url` | Expected: the counter appears in the stats and is small compared with `kept`. Fetches are https only and article URLs must be on the source domain (M2 fix) | | | A large `skipped_bad_url` means many sources rejected. Backend decides whether the check is too strict |
| B5 | Match review (section 6) | `docker compose run --rm -T backend python scripts/review_news_matches.py` | Prints `news_items total=N`, published_at and ingested_at ranges, rows per tier (tiers 1 to 7), rows per tag kind, rows per source, 20 sample headlines per tag kind. Expected: look for sample headlines that really match their tag. Tier 8 must never appear | | | Wrong-looking tags are a tagger issue: log them, Backend. Known: L20 (see F5) |
| B6 | News stock and sector calibration re-check (section 15) | Once real portfolio disclosures exist (`portfolio-disclosures-daily` runs on days 1 to 20 of the month; wait until it has loaded data), re-read the B5 samples for kinds `stock` and `sector`; compare against the labelled set result (150 headlines: precision 0.991, recall 0.975 at the News merge, register C144; precision 0.9815, recall 0.9755 after the M2 alias fix, register C171). Sector precision and recall were never measured (L15) | Expected: stock tags name the right company; sector tags are not the "X stocks of Y" false positives (L20). Send the owner a short table | | | Systematic false tags: Backend adds headlines to `labelled_headlines.json` and tunes. Owner decides to keep or change |
| B7 | NSE symbol fill (section 7) | `sudo ./scripts/run-job.sh nse-symbol-fill scripts/jobs/fill_nse_symbols.py` | Exit 0 and `fill_nse_symbols: success=True updated=<n> already_set=<m> unmatched=<k>`. A second run shows `updated=0` (idempotent). Download is capped at 20 MB | | | `success=False` = NSE refused the VM's address or timed out (job still exits 0 by design). Ops retries; if blocked, tell the owner, the tagger falls back to name and ISIN matching |
| B8 | Recompute jobs: benchmark windows (section 9) | Run the `benchmark-daily` job and the analytics recompute (guide section 9), then open Mutual Funds, Performance for a synthetic household | Benchmark window rows (the 8 TRI indices incl. Nifty Next 50, Smallcap 250, Nifty 100, Nifty 200 added by 0045) show values, not blanks | | | Blank windows: the index history did not load (Ops reruns the job) or a computation bug (Backend) |
| B9 | Recompute jobs: analytics | `time ./scripts/run-job.sh analytics-recompute-all scripts/run_analytics_recompute.py --all` | Exit 0; total time under the 15-minute stale ceiling (`measure_benchmark_matrix.py` docstring asks for this comparison) | | | Over 15 minutes: Backend (L6 in the register is the suspect) |
| B10 | Recompute jobs: worth-a-look | Home, "Worth a look" for each synthetic household after B9 | Cards appear or "nothing flagged"; the state is not `unavailable` for a household that has analytics sections. Worth-a-look reads stored sections only; it has no job of its own | | | `unavailable` after a good recompute: Backend |
| B11 | CAL1 thresholds (section 12) | For each synthetic household, list which Worth-a-look cards fire and why (shares, tier, 1-year gap, TER gap, top-five share). Starting values (register C60): weak fund = tier 1 and share at least 2 percent; underperforming = category average minus fund 1-year return at least 3 percentage points and share at least 3 percent; high expense = TER more than 0.5 percentage point above the category mean and share at least 3 percent; concentration = top five stocks at least 20 percent of portfolio value, coverage at least 50 percent, not flagged thin; at most 3 cards; one card per fund; order weak, underperforming, concentration, high expense | A table the owner reviews. Edit only `backend/app/services/home/worth_config.py` if a number must move | | | Owner decides. Backend edits the one config file |
| B12 | XIRR fixture check (section 11) | On a synthetic household compare the holdings bundle lifetime XIRR (front-end fixture value 0.1612) with the Mutual Funds `analyticsCombined` portfolio XIRR (fixture value 0.1069). The register (C134) says the real backend uses the same function for both. NEEDS CHECK: exact response field names and which screens show each number | Expected: on real data both figures agree to display precision; the 0.1069 vs 0.1612 gap exists in the fixture only | | | A real disagreement is a bug: Backend (data) or Frontend (wrong field mapped) |
| B13 | I2 timing on the 21.9M-row nav_history: Home (section 14) | `docker compose run --rm -T backend python scripts/measure_home_staging.py --user-id <UUID> --runs 5 --limit 1.5` | Home first load within 1.5 s (cold holdings case reported separately). Record the table | | | Over limit: Backend (register L8, L10, L11 list the suspects and the fix order) |
| B14 | I2 timing (section 14): month detail | `docker compose run --rm -T backend python scripts/measure_month_detail.py --aggregate --user-id <UUID> --limit 1.0` (and with a member id). Open History for that household first so snapshots are fresh | Median within 1.0 s | | | Over limit: Backend |
| B15 | I2 timing (section 14): benchmark windows | `docker compose run --rm -T backend python scripts/measure_benchmark_matrix.py --user-id <UUID> --runs 3` | "added by windows", worst run for the largest scope, below 3000 ms | | | Over limit: Backend (L6) |
| B16 | I2 timing (section 14): fund page tiers | `docker compose run --rm -T backend python scripts/measure_fund_page_staging.py --user-id <UUID> --schemes 4 --runs 3` | Record tier 1, 2 and 3 times. NEEDS CHECK: no per-tier limit is stated in the sources I read (the Individual Fund page is deferred, so this is for the record) | | | Informational |
| B17 | Planning script (section 13) | `docker compose run --rm -T backend python scripts/measure_planning_staging.py --user-id <UUID> --runs 3` (checkout must be `leapswitch-redesign`) | Exit 0; a cold and warm timing per scope (family, then each member); counts only, no names or amounts. NEEDS CHECK: no numeric limit is stated in the sources I read | | | An abort message about a write means a code path writes on a read route: Backend, urgent |
| B18 | Timings record | Paste B2, B13 to B17 numbers to the orchestrator | All recorded | | | |

## Group C: Every page, light and dark, 1280 and 1024 wide

For each row open the page at 1280 px wide, then 1024; in light, then dark. A row passes only if all four combinations pass. Compare with the mockups (`Docs/Web app UI mockups MFs.pdf`). Use the synthetic household from the realistic folder.

| # | Step | How to check | Expected result | Pass / Fail / Notes | Owner initials | If it fails: meaning and fixer |
|---|---|---|---|---|---|---|
| C1 | Home | Greeting, wealth card, glance, allocation, family cards, movers, Worth a look, News section | Numbers present, no overlap or clipped text at 1024; greeting link works | | | Visual: Frontend. Wrong number: Backend |
| C2 | Home news weights and greeting link (owner manual item 4) | Read the news list against the household's holdings; click the greeting link | Items about held stocks and funds rank above general news; the greeting link goes where the mockup says. Feed is empty before the first successful refresh (migration 0046 note) | | | Ordering: Backend. Link: Frontend |
| C3 | Portfolio | Summary, tables, Quick Insights | Quick Insights cards populate or show their empty state | | | Frontend or Backend by symptom |
| C4 | Mutual Funds: Overview | Open the tab | Loads with figures and no console errors | | | Frontend/Backend |
| C5 | Mutual Funds: Performance | Open the tab, change the benchmark | Benchmark window block shows values (B8) | | | |
| C6 | Mutual Funds: Allocation | Open the tab, click an asset class | Asset-class drill opens (owner manual item 3) | | | Frontend |
| C7 | Mutual Funds: Holdings | Open the tab | Ledger row shows units, NAV and folio; the missed-SIP tooltip shows on hover; sold funds list present; Compare Distributors button present; no Export button | | | Frontend |
| C8 | Mutual Funds: Transactions | Open the tab | Rows load; filters work | | | |
| C9 | Mutual Funds: Overlap | Open the tab | A "What drives the overlap" section and the inclusive pairs list are present | | | Frontend |
| C10 | Mutual Funds: Other Analytics | Open the tab | Sections render, no blank cards | | | |
| C11 | Mutual Funds: History | Open the tab, open a month | Month modal opens. Known: with a member selected the month tiles are all-member totals (F7) | | | |
| C12 | Mutual Funds: legacy parts | Coverage-gap banner (use a statement with a gap), opening-balance dialog, post-import notice | Each appears when its condition is met and its action works | | | Frontend; data-dependent ones Backend |
| C13 | Planning | Create and rank scenarios, open one, switch member | Results load; family and member scopes both work | | | |
| C14 | Import | Upload a synthetic statement (password `MF@123`) as the owner | Upload, confirm people, then the Mutual Funds pages fill. Add statement for a member opens import for that person | | | |
| C15 | Profile: all seven pages | Visit each Profile page | All seven load; deep link and refresh on `/profile/family` work | | | Frontend |
| C16 | Profile: four Settings children | Visit each Settings child | All four load | | | |
| C17 | Profile: edit and persist | Edit goals and investor type; reload | Changes persist | | | Backend if lost |
| C18 | Profile: Family actions | Add statement for a member, then Back; delete a throwaway non-self member | Import opens for that person and Back returns to Family; the self card has no delete button; throwaway member deletes | | | Frontend |
| C19 | Profile: contact change | Start the change dialog and stop at the code step | Dialog reaches the code step; do not complete | | | Frontend |
| C20 | Profile: ProfileNudge | Dark mode | Warning colours are readable | | | Frontend |
| C21 | Visual parity per page (owner manual item 2) | Place each page next to its mockup | Layout, spacing, colours match; list differences | | | Owner decides which differences are bugs; Frontend fixes |
| C22 | Individual Fund links greyed (owner manual item 5) | Click every fund link in Holdings, Overlap and elsewhere | Links are greyed and do not navigate (the routes are placeholders) | | | Frontend if a link is live |
| C23 | Home parity decision L13 | Compare a fund redeemed on the latest price date with the Home change | Owner decides keep or exclude (F4) | | | Owner |
| C24 | Large negative XIRR rendering | Open a household with a large negative XIRR | Shows a sensible negative percent, not a blank or overflow | | | Frontend |

## Group D: Security and privacy

| # | Step | How to check | Expected result | Pass / Fail / Notes | Owner initials | If it fails: meaning and fixer |
|---|---|---|---|---|---|---|
| D1 | PAN masked everywhere | Look at Profile, Family, Import, Mutual Funds, Holdings | Only a masked PAN is ever shown (last four characters) | | | Frontend |
| D2 | No full PAN in any network response | Browser devtools, Network tab, filter responses while visiting Profile, Family and Import; search responses for the full PAN of the synthetic household | No response contains a full PAN | | | Backend, urgent. Block everything |
| D3 | Scope isolation between two accounts | Account 1 and account 2 (owner signs both up in separate profiles). In account 2 try the id of an account-1 member in the URL, and open Home and Mutual Funds | Account 2 never sees account-1 data; foreign ids return an error or empty page | | | Backend, urgent |
| D4 | Delete-account dialog up to the confirm step only | Profile, delete account, stop at the confirm step | Dialog explains consequences; **do not confirm** | | | Frontend |
| D5 | Consent records | `docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select count(*) from consent_records"` after a fresh signup. NEEDS CHECK: table name; see `backend/scripts/consent_trail.py` | A record exists for the new signup | | | Backend |
| D6 | Import History deletes nothing real | Open Import History | Only throwaway data is deleted, if at all | | | Owner decides |
| D7 | Dev Import health link | Open the Import health route with dev tools on and off | Link shown only with dev tools on | | | Frontend |

## Group E: Regression of old flows

| # | Step | How to check | Expected result | Pass / Fail / Notes | Owner initials | If it fails: meaning and fixer |
|---|---|---|---|---|---|---|
| E1 | Sign-up | Owner signs up on `ls-redesign.unifolio.in` with a new email | Account is created and onboarding starts | | | Backend/Frontend |
| E2 | Sign-in check on ls-redesign.unifolio.in (guide section 10) | Owner signs out and signs in on `https://ls-redesign.unifolio.in`; then on `https://ls-staging.unifolio.in` in another profile | Same account works on both; no CORS errors in the console. Sign in with Google is not part of the redesign | | | CORS error: Ops (`ALLOWED_ORIGINS` in `.env` and recreate backend). Other: Backend |
| E3 | CAS upload and import end to end | Upload a synthetic statement; confirm; open Mutual Funds | All funds match, no review items; totals match the old link's Dashboard | | | Backend |
| E4 | Family member add / delete | Add a member, then delete a throwaway one | Works; no orphan data | | | |
| E5 | Logout | Log out | Returns to sign-in; back button does not reveal data | | | |
| E6 | Old link still fine | Dashboard, Analytics, History on `ls-staging.unifolio.in` | Unchanged; numbers equal the redesign link's matching numbers | | | |
| E7 | Import health dev link | See D7 | | | | |

## Group F: Rollback check and known issues

| # | Step | How to check | Expected result | Pass / Fail / Notes | Owner initials | If it fails: meaning and fixer |
|---|---|---|---|---|---|---|
| F1 | Rollback commands read | Read guide section 19 | The person running knows the commands | | | |
| F2 | Previous release reachable | `docker image ls \| grep -E "leapswitch-(backend\|worker)"` | `leapswitch-backend:previous` and `leapswitch-worker:previous` exist; a fresh `./scripts/backup.sh` dump exists from before the deploy | | | Missing `:previous` means rollback is not possible: stop and tell the orchestrator |
| F3 | Known issues read | Read the list below | Nobody reports these as new bugs | | | |

### Known issues (do not report as new bugs)

| Id | What | Status |
|---|---|---|
| L12 | Flaky `DashboardView` XIRR popup test | CI only; passes on rerun; open |
| L13 | A fund redeemed on the latest price date still counts in that day's change on Home | Owner decides at Home parity (row C23) |
| L20 | News tagger fires a sector on "X stocks of Y" phrases (for example "Hospital stocks of oxygen cylinders") | Needs context logic; open |
| L21 | `PLAIN_WORD_SYMBOLS` (news tagger) is a hand-picked list (`idea`, `sail`, `page`, `time`) | Open; not a defect unless a new plain-word ticker mis-tags |
| Deferred | Individual Fund pages greyed (routes are placeholders) | Deferred by decision |
| Deferred | Mutual Funds backend asks not built: holdings export route, family-view coverage-gap route, optional analytics recompute after an opening-balance post | Not built |
| Deferred | Month modal tiles are all-member totals when a member is selected | Known |

---

## Go / no-go sign-off

**Rule:** any failed row blocks sign-off until it is fixed and re-run, or recorded below as an owner-accepted Low. Rows in Group A, D2, D3 and D4 cannot be accepted as Low.

| Group | Rows | Passed | Failed | Owner-accepted Low (row ids) |
|---|---|---|---|---|
| A Deploy health | A1 to A11 | | | |
| B Data and jobs | B1 to B18 | | | |
| C Every page | C1 to C24 | | | |
| D Security and privacy | D1 to D7 | | | |
| E Regression | E1 to E7 | | | |
| F Rollback and known issues | F1 to F3 | | | |

**Timings recorded (B2, B13 to B17):** ________________________

**Decision for the next stage (the owner names it):**  GO  /  NO-GO  (circle one)

Reason / conditions: ______________________________________________

Owner: ______________  Date: ____________  Signature or initials: ________

Manager: ______________  Date: ____________  Signature or initials: ________
