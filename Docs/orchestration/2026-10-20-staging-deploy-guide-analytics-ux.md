# Staging Deploy + QA Guide — Analytics UX fixes AND the Chandra Tripathi fix (LeapSwitch)

**One deploy, two streams.** `origin/feat/leapswitch-staging` now holds both the **analytics UX fixes** (six phases, 40-odd commits, two migrations) and **PR #8, the Chandra Tripathi fix** (merge commit `a159032`). A single `git pull` on the VM brings both, so this guide deploys and checks both. It builds on the proven `Docs/orchestration/leapswitch-staging-deploy-guide.md` (the generic LeapSwitch layer) and replaces the Chandra-only guide `2026-10-20-staging-deploy-guide-chandra-fix.md`, whose migration step does not cover the scenario clean-up below.

**Who does what.** The user runs every command; Claude tells them what to run and checks the pasted output. Claude does not run anything on the VM, does not merge, does not run `clean-db.sh`, and asks before anything that deletes data. Terminals are labelled **[Your computer]** and **[VM]** (an SSH session).

**Status (written 2026-10-20):** nothing in this guide has been run against the VM. Where a number says *not pre-verified* it was not measured.

---

## What ships

| Stream | What changes | Needs |
|---|---|---|
| Analytics, scenarios | US-Iran phase end dates corrected (Shock ends 1 Apr 2026, Partial recovery 2 Apr to 7 Jul 2026); each scenario listed once; exact dates on every scenario screen; Franklin screen neutral when nothing was frozen | **migration 0042** (data), **0043** (unique index), a duplicate clean-up first, then a scenario recompute |
| Analytics, Investment & Withdrawal | negative withdrawal bars, switches toggle, opening-holdings figure, fund-wise table | none |
| Analytics, rankings / managers / TER | 1Y/3Y/5Y tables with the basis named; fund manager table; TER in rupees (cards + 1/3/5-year table); AMC and Category allocation smallest-first | none |
| Analytics, score and labels | "How is this calculated?" explainer; five-step tier colours; "(Total Return)" benchmark labels; copy fixes | none |
| Analytics, History | hover, click, keyboard and phone first/second-tap; month-detail pop-up (new read-only endpoints) | none (computed on click) |
| Chandra A | opening cost guard: a legacy holding keeps its real cost on **new imports** | none |
| Chandra B | XIRR "may be inflated" disclaimer (backend fields + popup), works on existing data at once | none |

**Migrations in this deploy:** `0042_us_iran_phase_end_dates`, `0043_scenarios_unique_top_level_name` (the VM's current revision is unknown until Step 2). **Neither has ever run on PostgreSQL** (the build machine could not reach Docker); that is why the backup is not optional.

## Facts to know before starting

1. **Migration 0043 refuses to run while two top-level scenarios share a name.** The LeapSwitch database was seeded from AWS staging, where every scenario appears twice, so duplicates are likely here too. Step 5 finds and (with your say-so) removes them **before** the migration. Skipping it would leave the site stopped with the backend down.
2. **After 0042 the scenario results must be recomputed** (Step 8). The daily NAV job only refreshes scenarios marked `is_ongoing`, and the two US-Iran phases are settled.
3. **Chandra Root Cause A only affects new imports.** Existing accounts keep their old opening costs. Root Cause B shows on existing data immediately.
4. **Never upload a real CAS PDF to staging.** Use synthetic files only (password `MF@123`), all under `Docs/CAS Files/synthetic/pdfs/` in the repo on **your computer**:
   - Chandra: `realistic/r4_oak_family_legacy_cost_bug.pdf`
   - Analytics (family, many funds): `big_family_ayush_anand_7yr.pdf`
   - Analytics (switches and STP): `kfin_pk_10yr.pdf`
   - Analytics (opening balances, long partial stretch): `p20_10yr.pdf`

## Before you start

- **When:** a daytime weekday. Avoid the nightly backup (01:00 IST) and the 00:55 to 06:35 IST cron window (`crontab.leapswitch`).
- **Downtime:** a few seconds at the deploy, plus a deliberate gap during the migration (Step 6), normally under two minutes.
- **VM:** `deploy@202.66.174.251`, repo at `/opt/unifolio/deploy/leapswitch`. If SSH **times out** (not "refused") while the site still loads over HTTPS, it is the CloudPe security-group IP allowlist: add your current IP in the CloudPe dashboard (see the plan's Troubleshooting section).
- **Ask before** any delete. The only delete here is Step 5c. `clean-db.sh` is not part of this deploy.

## Order of steps

| Step | What | Site |
|---|---|---|
| 1 | SSH, check branch, `git pull` | up |
| 2 | Check the current migration | up |
| 3 | Back up | up |
| 4 | Build the new images (the clean-up scripts live in them) | up |
| 5 | Find and clean duplicate scenarios (**you confirm 5c**) | up |
| 6 | Migrate (stop backend/worker, `alembic upgrade head`) | **down** |
| 7 | `./scripts/deploy.sh` (frontend build, bring the stack up) | up |
| 8 | Recompute scenario results | up |
| 9 | Health check, hard refresh | up |
| 10 | Database spot checks | up |
| 11 | QA part A: Chandra | up |
| 12 | QA part B: analytics | up |
| 13 | History click-time re-measure | up |
| — | Rollback, if Step 7 or 9 goes bad | — |

---

## Step 1 — SSH, branch, pull  [VM]

```bash
ssh deploy@202.66.174.251
cd /opt/unifolio/deploy/leapswitch
git branch --show-current
git pull
git log --oneline -1
git log --oneline | grep -c "Root Cause"
ls ../../backend/alembic/versions | sort | tail -3
```

**Good looks like:** branch `feat/leapswitch-staging`; a fast-forward pull; the log at or after `a159032`; the "Root Cause" count `5` or more (Chandra is in); the last migration files end with `0041_...`, `0042_us_iran_phase_end_dates.py`, `0043_scenarios_unique_top_level_name.py`.
**If the branch is something else, or `git pull` fails on local changes:** stop and paste it; do not switch branches or `git checkout -- .`.

## Step 2 — Current migration  [VM]

```bash
sudo docker compose run --rm -T backend alembic current
```

**Good looks like:** `0041 (head)` or `0041_stock_master_and_index_valuation (head)` (the code from before this pull). This is the revision Step 6 starts from. **If it shows something older than 0041, stop and paste it**: more migrations are pending than this guide covers.
(`run`, not `exec`: `exec` talks to the already-running, possibly stale container.)

## Step 3 — Back up  [VM]

```bash
sudo ./scripts/backup.sh
```

**Good looks like:** finishes cleanly and reports a dump written/uploaded. Do not continue without it. (A restore is the only real undo for a migration; see Rollback.)

## Step 4 — Build the new images  [VM]

```bash
for svc in backend worker; do
	sudo docker image inspect "leapswitch-${svc}:latest" >/dev/null 2>&1 && \
		sudo docker tag "leapswitch-${svc}:latest" "leapswitch-${svc}:previous"
done
sudo docker compose build backend worker
```

**Good looks like:** ends with `naming to docker.io/library/leapswitch-worker:latest`, no `ERROR`. The running containers keep serving the old code until Step 7. After this the clean-up scripts below exist in the image.

## Step 5 — Duplicate scenarios  [VM]

**5a. Look (read-only).**

```bash
sudo docker compose run --rm -T backend python scripts/diagnose_duplicate_scenarios.py
```

**Good looks like:** the first line is `Database: postgresql://...` (password hidden), then a table `Name  Scenario ID  Result rows  Quick stats  Phases  Assumptions`.
- **Header only, no rows:** no duplicates. Skip 5b and 5c and go to Step 6.
- **Rows:** each duplicated name appears twice (or more). Paste the whole output to Claude. Expected: the copies of one name have different IDs, one usually with result rows and quick stats and the other empty or equal.

**5b. Dry run (changes nothing).**

```bash
sudo docker compose run --rm -T backend python scripts/dedupe_scenarios.py
```

**Good looks like:** `Dry run (no changes)`, then `Kept:` and `Removed:` ID lists, a table of rows that would be removed, and **no `BLOCKED` lines**. Claude and you review the kept and removed IDs together.
**If a `BLOCKED` line appears:** a copy that would be removed has more phases or hypothetical assumptions than the one kept (seed data nothing can rebuild). **Stop.** `--apply` will refuse that group; paste the output and decide by hand.

**5c. Apply: ASK FIRST. This deletes scenario rows.** Only after you have said "yes, apply" to Claude:

```bash
sudo docker compose run --rm -T backend python scripts/dedupe_scenarios.py --apply
sudo docker compose run --rm -T backend python scripts/diagnose_duplicate_scenarios.py
```

**Good looks like:** `Applied`, the same kept/removed lists as the dry run, and the second command (diagnose) printing the header only (no rows). It runs in one transaction; on an error nothing is deleted.

## Step 6 — Migrate (the site is down from here until Step 7 finishes)  [VM]

```bash
sudo docker compose stop backend worker
sudo docker compose run --rm -T backend alembic upgrade head
sudo docker compose run --rm -T backend alembic current
```

**Good looks like:** two lines, `Running upgrade 0041 -> 0042, ...` and `Running upgrade 0042 -> 0043, ...`, no traceback, then `0043 (head)`.
**If 0043 fails with `Duplicate top-level scenario names exist; run scripts/dedupe_scenarios.py --apply first`:** Step 5 was skipped or incomplete. Each revision commits on its own, so 0042 stays applied. Go back to Step 5, then re-run the `alembic upgrade head` line. Do not start Step 7 with a half-applied state.
**If any other error:** stop; do not run Step 7. Paste the error. (The backup from Step 3 is the fallback.)

## Step 7 — Deploy  [VM]

```bash
./scripts/deploy.sh
```

**Good looks like:** the frontend build ends `✓ built in <N>s`, then `Container leapswitch-backend-1 Started` / `leapswitch-worker-1 Started` (postgres and caddy `Running` or `Started`).
**If the frontend build fails:** nothing live is affected (the old bundle stays); paste the error. **If a container is unhealthy or restarting:** `sudo docker compose logs backend --tail 50`; if the fix is not quick, see Rollback.

## Step 8 — Recompute scenario results  [VM]

```bash
sudo ./scripts/run-job.sh compute-all-scenarios scripts/compute_all_scenarios.py
echo $?
```

**Good looks like:** log lines per scenario (`real=… proxied=… no_data=…`), ending `compute_all_scenarios: done, N scenarios, 0 failed`, and `0` from `echo $?`. Run time *not pre-verified* (it reads the full NAV history; expect minutes, not seconds). On a non-zero exit `run-job.sh` emails the ops address.

## Step 9 — Health check  [VM, then your browser]

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging.unifolio.in/
```

**Good looks like:** `200` for both. Then open `https://ls-staging.unifolio.in` and hard refresh (Ctrl+Shift+R). A `200` only proves the process answers; the QA steps prove the changes.

## Step 10 — Database spot checks (read-only)  [VM]

```bash
sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "select indexdef from pg_indexes where indexname = '"'"'uq_scenarios_top_level_name'"'"';"'
sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "select name, start_date, end_date from scenarios where name like '"'"'US-Iran war --%'"'"' and parent_scenario_id is not null order by start_date;"'
sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "select count(*) from (select name from scenarios where parent_scenario_id is null group by name having count(*) > 1) d;"'
```

**Good looks like:**
1. an index definition containing `UNIQUE` and `WHERE (parent_scenario_id IS NULL)` (this is the first time 0043 has run on PostgreSQL);
2. three phase rows: Shock `2026-02-28` to `2026-04-01`, Partial recovery `2026-04-02` to `2026-07-07`, Relapse `2026-07-08` to empty (one set only, no duplicates);
3. `count` of `0`.
(If `$POSTGRES_USER` is empty in that container, use the `$DB_USERNAME`/`$DB_NAME` form from Part 2 of the base guide.)

---

## Step 11 — QA part A: Chandra (PR #8)

Use a **new test account** on https://ls-staging.unifolio.in and upload `r4_oak_family_legacy_cost_bug.pdf` (password `MF@123`; two fictitious members, 5 and 39 holdings).

**QA-1 Root Cause A: opening costs not inflated.** After the import confirms, open the household dashboard:

| Check | Expected | Before the fix |
|---|---|---|
| Household **Total Invested** | about **₹1,52,66,000** (statement cost ₹1,52,66,000.05; allow a few rupees) | about ₹1,63,73,196 |
| HDFC Flexi Cap (Regular Growth), 603.209 units | invested **₹30,000.00** | about ₹11,12,539 |
| Sundaram Multi Asset Allocation (Regular Growth), 9,999.5 units | invested **₹1,00,000.00** | about ₹1,24,658 |

The statement's printed Market Value (₹2,54,18,899) will not match: the app prices at today's NAV. That gap is expected.
Optional read-only check:

```bash
sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "select s.name, t.cost_source, t.nav, t.amount from transactions t join folios f on f.id = t.folio_id join schemes s on s.id = f.scheme_id where t.type = '"'"'opening_balance'"'"' and (s.name ilike '"'"'HDFC Flexi Cap Fund%'"'"' or s.name ilike '"'"'SUNDARAM MULTI ASSET%'"'"') order by s.name;"'
```

Expected `cost_source = cas_cost`, `nav` about 49.7340 (HDFC) and 10.0005 (Sundaram). `nav_on_start` with about 1844.37 / 12.47 means the old logic ran (import done before the deploy, or a stale image).

**QA-2 Root Cause B: the disclaimer appears.** On each member's dashboard (desktop width) the XIRR shows an **ⓘ** and a line "NN% of this return is based on an undated opening balance — may be inflated. Tap to see why."

| Member | Headline XIRR (Lifetime) | Opening share in the line | "Without the undated portion" |
|---|---|---|---|
| 5 holdings | about **186%** | about **98%** | about **−6.6%** |
| 39 holdings | about **127%** | about **90%** | about **−7.4%** |

These move with today's NAVs; judge the shape (headline far above 35%, opening share near these, the without-undated figure small or negative). The household-total tile was not pre-verified: record what it shows. The popup has a title, a lead line, two number tiles, four labelled paragraphs, an account-aggregator note, and a single **Got it** (closes with Got it and Escape).

**QA-3 The popup does not reopen on its own.** On a member that shows the disclaimer on Lifetime but not Current (or vice versa): open the popup, click the other tab, click back. Expected: no popup unless you click ⓘ.

**QA-4 Phone width (~375 px).** On the household total: ⓘ beside the figure, the line below the stats, the popup tiles stacked, Got it full width. Picking one member hides XIRR (a dash) and the disclaimer; switching back must not reopen the popup.

**QA-5 No change for clean accounts.** An account with no legacy opening balances shows no ⓘ and an unchanged XIRR.

## Step 12 — QA part B: analytics UX

Use the account from Step 11 for the quick items, and **upload `big_family_ayush_anand_7yr.pdf` and `kfin_pk_10yr.pdf` to two more test accounts** for family, History and switches. Check each at desktop and at ~375 px; light and dark where noted. Mark each **pass / fail / not run**.

**Allocation and labels**
- **B1 AMC and Category allocation** (analytics) open **smallest first**; the toggle "Largest first" reverses; the main dashboard AMC donut (desktop and phone) does the same; slice colours stay the same when the order flips; the asset-class view keeps its fixed order and has no toggle.
- **B2 Benchmark section** labels read "… (Total Return)". **Category ranking** shortfall reads "Trailing the category average by X%" with a falling arrow; no "S20" anywhere in user text.
- **B3 Score and tiers:** the "How is this calculated?" toggle opens the explainer (Return 45%, Risk 30%, Consistency 25%, the cost adjustment, tiers, the 70/50 labels, the composite weights) and closes again; it is absent in print. Tier badges use the five-step colours (green to red) with readable text in **light and dark**; the portfolio label is green/slate/amber.

**Rankings, managers, TER**
- **B4 Category ranking** shows a 1Y/3Y/5Y table (fund, category average, difference) and the line "Ranked on the blended 3Y/5Y return"; a "Compared with Direct/Regular plan peers" label. **Fund ranking** names its composite basis (25/25/20/15/15) and shows returns per horizon; with fewer than three funds in a category the average shows a dash. **The same fund shows the same returns and average in both sections.**
- **B5 Fund manager** section is one table: Fund manager, AMC, Current value, % of portfolio, plus a "Covered by manager data" row and the footnote "Funds with more than one manager are divided equally between them."; funds without manager data are listed as not available.
- **B6 TER:** the three cards show a rupee yearly cost ("₹… / year"); below is a fund-wise table with **Next 1 year / 3 years / 5 years** and a totals row; funds without a TER show dashes and are excluded; the note says it is a projection.

**Investment & Withdrawal** (use the `kfin_pk_10yr` account for switches, `p20_10yr` for opening holdings)
- **B7** Withdrawals draw **below** the baseline; the line "Switched between funds: ₹X in N switches" shows; **Include switches** adds the switch amounts to Invested and Withdrawn while **Net Invested and Absolute Gain do not change** (with the note shown); the opening-holdings figure sits above the chart and is not a bar; tapping a bar opens the period's **fund-wise table** (member filter in the family view); opening and switch entries never read "Withdrawn"; the print view has no toggle.

**Scenarios**
- **B8** Each scenario appears **once** in the picker; every scenario card, opened-screen header and phase card shows **exact dates** ("20 January 2020 – 31 March 2020"; an open end reads "… – ongoing"); the US-Iran phases read Shock to 1 Apr 2026, Partial recovery 2 Apr to 7 Jul 2026, Relapse from 8 Jul 2026 (no shared day); the benchmark list shows "Nifty LargeMidcap 250" (never a raw key); the Franklin screen on a portfolio with no frozen fund says **"None of your funds were frozen in this event"**.

**History** (family account)
- **B9 Chart:** hover shows a guide and a tooltip (value, cost of holdings, gain); the subtitle names the latest month-end; the legend reads "Portfolio value" and "Cost of holdings"; arrow keys move the guide, Enter opens details, Escape clears.
- **B10 Pop-up:** clicking a month opens the month detail with a **loading state first**, then the month's change split into New money, Opening holdings (first month only), Switches (net) and Gifted units (only when non-zero) and Market movement; the fund table (value, cost, change); in the family view one merged list with **All / member** buttons whose totals follow the filter. In a **partial month** (funds without a price: expect many on `big_family` 2020-08 to 2022-11) change and market movement show a dash with the "Incomplete prices" banner. A `kfin_pk_10yr` month with an STP shows the switches line.
- **B11 Phone:** the first tap selects a month and shows a card; "See details" or a second tap opens the bottom sheet; the page behind does not scroll while the sheet is open; dragging across the chart does not open details.

## Step 13 — History click-time re-measure  [VM]

The click-time limit is **1 second** (median of 10 months, family view). It measured **879 ms** on SQLite on the build machine's slow disk, so it **must be re-measured on this PostgreSQL**. Find the family account's user id (read-only), then time it:

```bash
sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "select id, created_at from users order by created_at desc limit 5;"'
sudo docker compose run --rm -T backend python scripts/measure_month_detail.py --aggregate --user-id <the-big-family-account-user-id> --limit 1.0
```

**Good looks like:** `Database: postgresql://...`, a cold first call, ten timed calls, `median`, `worst`, then `PASS (limit 1000 ms)`. The script is read-only and aborts if anything tries to write. **If it says FAIL:** the next step is storing per-month rows (a new table); paste the numbers and stop; do not change code on the VM.

---

## Rollback

```bash
./scripts/rollback.sh
```

Retags `:previous` back to `:latest` for backend and worker and restarts (fast; no rebuild). Then the Step 9 health check.
- **It does not undo the frontend** (static files already overwritten): `git checkout <previous-commit> -- frontend` on the VM, re-run the frontend half of `scripts/deploy.sh`, then `git checkout <new-commit> -- frontend` when retrying forward.
- **It does not undo migrations 0042/0043.** That is safe to leave: 0043 only adds an index, and 0042 only moves two end dates. If a real undo is ever needed it is a hand-written downgrade or a restore of the Step 3 backup into a **scratch** container (see Part 2 of the base guide; never into the live `postgres` service).
- **Old backend under the new frontend:** the History pop-up's month-detail call returns an error until you roll forward again, and the Chandra disclaimer fields vanish (the frontend treats a missing disclaimer as "none"). Safe, but the new screens look broken meanwhile.
- **Scenario clean-up (Step 5c) cannot be rolled back by the script;** only the backup restores deleted scenario rows (they can also be rebuilt by `compute_all_scenarios.py` for results, but not seed rows).

## Report back to Claude

Paste, filled in:
- `git log --oneline -1`, the revision at Step 2, and the `alembic current` result from Step 6.
- Step 5a/5b output (and whether 5c was applied).
- Step 8's last log line; Step 9's two status codes; Step 10's three results.
- QA-1 to QA-5 and B1 to B11, each **pass / fail / not run**, with the QA-1 and QA-2 numbers.
- Step 13's median and worst.
- Anything that looked off, even if minor.

## Known limits and not verified

- Migrations 0042/0043 had not run on PostgreSQL before this deploy (Step 10 confirms the result).
- The History click time is the one number that depends on the VM (Step 13).
- The browser and print layouts of the new screens were only checked by tests and code review, not by eye; B1 to B11 are the first real look.
- A gift with no recorded amount cannot be valued and stays inside market movement in the History pop-up.
- The approved scoring methodology document describes a ten-component score; the app (and the explainer) use Return 45% / Risk 30% / Consistency 25% plus a cost adjustment. This disagreement is unresolved and needs a product decision.
- `PrintAnalyticsView` tests were run on Windows only (the build machine's disk timed the worker out); print output is part of B1 to B7.

## After it is verified

Claude records the deploy date, the commit, the QA results and the measured click time in `session.md`, `log.md` and `decisions.md`; nothing is pushed or merged without the user's say-so.
