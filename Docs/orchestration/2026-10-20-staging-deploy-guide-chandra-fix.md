# Staging Deploy + QA Guide — Chandra Tripathi fix (PR #8)

**Handoff for the Claude account working on the analytics stream.** This guide gets PR #8 onto LeapSwitch staging and checks it works. Read it end to end before running anything. Whoever runs the commands is the user (the human); you guide and check, you do not run deploy commands on the VM yourself unless the user says so.

**Status when this was written (2026-10-20):** PR #8 is **already merged** into `feat/leapswitch-staging` (merge commit `a159032`). The Chandra build session did not merge it; the manager did. Nothing in this guide has been run against the LeapSwitch VM yet. Expected outputs below come from the repo, the existing `leapswitch-staging-deploy-guide.md`, and the test runs listed under "How this was verified". Numbers marked *not pre-verified* were not measured.

---

## What ships

| | What users see | Where |
|---|---|---|
| **Root Cause A** — opening-cost guard | A legacy holding bought before the statement start (a pre-2006 fund, a recent NFO) keeps its real cost instead of being re-priced at the statement-start NAV. Total Invested stops being inflated. | `backend/app/services/import_/opening_balance.py` |
| **Root Cause B, backend** — XIRR disclaimer | Two new optional fields on the holdings responses (`lifetime_xirr_disclaimer`, `current_holdings_xirr_disclaimer`: `alt_xirr`, `opening_cost_share`). Headline XIRR numbers are **unchanged**. | `backend/app/services/dashboard/xirr.py`, `schemas.py`, `aggregate.py`, `backend/app/api/dashboard.py` |
| **Root Cause B, frontend** — popup | An ⓘ and one-liner next to the XIRR number, opening a popup "Why this return may be misleading". Desktop (Lifetime/Current toggle) and mobile (household total only). Shown only when the API returns a disclaimer. | `frontend/src/features/dashboard/XirrDisclaimerModal.tsx`, `DashboardView.tsx`, `mobile/features/dashboard/MobileDashboardView.tsx` |

**This change has no database migration, no infra change and no data job.** Confirmed: the PR touches 0 files under `backend/alembic/versions` and 0 under `infra/` or `deploy/`.

**But the same `git pull` also brings in everything else merged on `feat/leapswitch-staging`** (the analytics and History work from your stream). The repo's newest migration is **`0043_scenarios_unique_top_level_name`**. Whether the VM already has `0042`/`0043` applied is **unknown**, so Step 2 below checks it. If the VM is behind, the deploy includes those migrations and you must follow the migration path (Step 4), not the short path.

---

## Read these three facts first

1. **Root Cause A only affects NEW imports.** The opening lot's cost is worked out and stored when a statement is imported. Households already on staging keep their old (wrong) opening costs until they re-import. To see the fix you need a **fresh import**. Do not expect existing staging accounts to change.
2. **Root Cause B works on existing data immediately.** The disclaimer is computed when the dashboard loads, so any existing account whose headline XIRR is over 35% (and would be under 35% without the undated opening balance) shows it right after deploy. No re-import needed.
3. **Never upload the real `chandra.pdf` to staging.** It is real personal data and is gitignored on purpose. Use the **synthetic reproduction**, which gave **identical numbers** to the real file in the acceptance gate:
   `Docs/CAS Files/synthetic/pdfs/realistic/r4_oak_family_legacy_cost_bug.pdf`, password `MF@123` (every person in it is fictitious).

---

## Before you start

- **Who runs it:** the user, from a machine that can SSH to the VM. You guide.
- **When:** avoid **01:00 IST** (nightly backup) and the **05:45 IST onwards** batch-job window (`deploy/leapswitch/crontab.leapswitch`). A daytime weekday is fine.
- **Downtime:** a few seconds to a minute while the backend/worker containers restart. Caddy queues requests meanwhile.
- **VM:** `deploy@202.66.174.251`, repo at `/opt/unifolio/deploy/leapswitch`. Full reference: `Docs/orchestration/leapswitch-staging-deploy-guide.md` (this guide is the Chandra-specific layer on top of it).
- **If SSH times out (not "refused") while the site still loads over HTTPS:** that is the CloudPe dashboard **Security Group IP allowlist**, not a VM problem. The user's current IP must be allowed there. See the "Troubleshooting" section of `Docs/orchestration/leapswitch-staging-plan.html`.
- **Ask the user before** running `clean-db.sh` or anything that deletes data. Neither is needed for this deploy.

---

## Order of steps

| Step | What | Site |
|---|---|---|
| 1 | SSH in, `git pull` | up |
| 2 | Check the VM's migration against the repo's head | up |
| 3 | Take a backup | up |
| 4 | **Only if Step 2 shows the VM is behind:** migrate | down briefly |
| 5 | `./scripts/deploy.sh` (builds frontend, restarts backend/worker) | up |
| 6 | Health check | up |
| 7 | QA (five checks) | up |
| — | Rollback, if Step 5 or 6 goes bad | — |

---

## Step 1 — SSH in, pull

```bash
ssh deploy@202.66.174.251
cd /opt/unifolio/deploy/leapswitch
git branch --show-current
git pull
git log --oneline -1
```

**Good looks like:** the branch is `feat/leapswitch-staging`; the pull is a fast-forward; the log shows a commit at or after `a159032` (`Merge pull request #8 ...`). To confirm Chandra is in what you pulled: `git log --oneline | grep -c "Root Cause"` should print `3` or more.

**If the branch is something else:** stop and ask the user which branch the VM is meant to track. Do not switch branches yourself.
**If `Already up to date.`:** the VM already had this, or the pull landed earlier. Check `git log --oneline -1` against GitHub.
**If it fails on local changes:** something was edited on the VM outside git. Run `git status`, do not `git checkout -- .` blindly. Ask the user.

---

## Step 2 — Check the migration state

```bash
sudo docker compose run --rm -T backend alembic current
ls ../../backend/alembic/versions | sort | tail -3
```

**Good looks like:** `alembic current` shows `0043_scenarios_unique_top_level_name (head)`, the same as the newest file in the list.

**If it shows an older revision (e.g. `0041` or `0042`):** the pull includes migrations from the analytics/scenario stream. That is not a problem with the Chandra change, but it moves you onto the migration path (Step 4), and you should tell the user what will be applied before doing it.

---

## Step 3 — Backup first

```bash
sudo ./scripts/backup.sh
```

**Good looks like:** the script finishes cleanly and reports a dump uploaded. Do this even though Chandra has no migration; the pull may carry others.

---

## Step 4 — Only if Step 2 showed the VM is behind

Follow Step 4 of `Docs/orchestration/leapswitch-staging-deploy-guide.md` exactly (stop backend/worker, `alembic upgrade head`, confirm `alembic current` shows head). Skip this step otherwise.

---

## Step 5 — Deploy

```bash
./scripts/deploy.sh
```

This tags the running backend/worker images `:previous`, builds the frontend bundle (`npm ci && npm run build` inside a node container), and runs `docker compose up -d --build`.

**Good looks like:** the frontend build ends without errors, then `Container ... Started` / `Healthy` for postgres, backend, worker and caddy.

**If the frontend build fails:** nothing live is affected (the old bundle stays). Copy the error to the user.
**If a container is unhealthy or restarting:** `sudo docker compose logs --tail=100 backend`. If the fix is not quick, roll back (below).

---

## Step 6 — Health check

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging.unifolio.in/
```

**Good looks like:** `200` for both. Then open `https://ls-staging.unifolio.in` in a browser and hard refresh (Ctrl+Shift+R). A `200` only proves the process answers, not that the change works. QA does that.

---

## Step 7 — QA

Use a **new test account** on https://ls-staging.unifolio.in and upload the synthetic file (see "Read these three facts first", item 3). The file has two fictitious household members: one with 5 holdings, one with 39.

### QA-1 — Root Cause A: opening costs are no longer inflated

After the import confirms, open the household dashboard.

| Check | Expected | Before the fix |
|---|---|---|
| Household **Total Invested** | about **₹1,52,66,000** (the statement's Cost Value is ₹1,52,66,000.05; allow a few rupees of rounding) | about ₹1,63,73,196 |
| HDFC Flexi Cap (Regular Growth), 603.209 units | invested **₹30,000.00** | about ₹11,12,539 |
| Sundaram Multi Asset Allocation (Regular Growth), 9,999.5 units | invested **₹1,00,000.00** | about ₹1,24,658 |

The statement's printed *Market Value* (₹2,54,18,899) will **not** match the dashboard: the app prices at today's NAV, the statement at 24-Aug-2026. That gap is expected and is not this bug.

**Optional database check** (read-only; load `.env` the same way the deploy guide's Part 2 does):

```bash
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select s.name, t.cost_source, t.nav, t.amount from transactions t join folios f on f.id = t.folio_id join schemes s on s.id = f.scheme_id where t.type = 'opening_balance' and (s.name ilike 'HDFC Flexi Cap Fund%' or s.name ilike 'SUNDARAM MULTI ASSET%') order by s.name;"
```

**Good looks like:** `cost_source = cas_cost` for both, with `nav` about **49.7340** (HDFC) and about **10.0005** (Sundaram). If you see `nav_on_start` with about 1844.37 and 12.47, the old logic ran: the import was done before the deploy, or the backend image is stale.

### QA-2 — Root Cause B: the disclaimer appears and reads correctly

On each member's dashboard (desktop width), the XIRR number should show an **ⓘ** and a one-liner, "NN% of this return is based on an undated opening balance — may be inflated. Tap to see why."

| Member | Headline XIRR (Lifetime) | Opening share in the line | "Without the undated portion" in the popup |
|---|---|---|---|
| 5 holdings | about **186%** | about **98%** | about **−6.6%** |
| 39 holdings | about **127%** | about **90%** | about **−7.4%** |

**These XIRR figures move with today's date and NAVs** (they were measured on 2026-10-20). Judge the *shape*: a headline far above 35%, an opening share near the values above, and a without-undated number that is small or negative. **The household-total tile was not pre-verified**; record what it shows rather than expecting a specific value.

Open the popup and check: the title, the lead line, two number tiles, four labeled paragraphs, the "A note on account aggregator / MF Central imports" callout, and a single **Got it** button. It should close with Got it and with Escape.

### QA-3 — The popup does not reopen on its own (a bug fixed in review)

On desktop, with a member that shows the disclaimer on **Lifetime** but not on **Current** (or vice versa): open the popup, then click the other tab, then click back. **Expected:** no popup appears unless you click ⓘ again.

### QA-4 — Phone width

Resize the browser to about 375 px wide, or use a real phone. Open the **household total** dashboard. **Expected:** the ⓘ sits beside the XIRR figure, the one-liner is below the stats, the popup's two number tiles stack vertically, and the Got it button is full width. Picking a single member in the filter hides the XIRR (it shows a dash) and the disclaimer; switching back to all members must not reopen the popup by itself.

### QA-5 — No change for accounts without the problem

Use (or create) an account with no legacy opening balances, for example one that imported a statement starting from account opening. **Expected:** no ⓘ and no one-liner anywhere, and the XIRR number is exactly what it was before the deploy.

---

## Rollback

```bash
./scripts/rollback.sh
```

Retags the `:previous` backend/worker images and restarts. **It does not undo the frontend** (static files already overwritten) **or a migration.** To revert the frontend, follow the "What this does not cover" notes under "Rollback" in `leapswitch-staging-deploy-guide.md`: `git checkout <previous-commit> -- frontend`, re-run the frontend build half of `deploy.sh`, then `git checkout <new-commit> -- frontend` when retrying forward.

Rolling back only the backend leaves the old API (no disclaimer fields) under a new frontend. That is safe: the frontend treats a missing disclaimer as "none".

---

## Report back to the user

Paste into the reply, filled in:

- Commit deployed (`git log --oneline -1`) and whether Step 2 needed a migration.
- Step 6 results (two status codes).
- QA-1 to QA-5, each **pass / fail / not run**, with the numbers you saw for QA-1 and QA-2.
- Anything that looked off, even if minor.

Do **not** merge anything, edit the Chandra files, or run `clean-db.sh` without the user's say-so.

---

## After it is verified: update the project docs

The Chandra session already updated `session.md`, `log.md`, `decisions.md` and the `CLAUDE.md` status line to say the fix is built and in PR #8. Once staging passes, record: deployed on (date), the commit, the QA results, and that the PR is merged. Keep `session.md` short and overwritten; `log.md` is append-only.

---

## Still open after this deploy (not part of it)

- **Refresh the acceptance-gate drift baseline.** `test_real_check.py` prints `RESULT NOT PASS` only because its dashboard-vs-statement drift check (−5.59% against a 5% limit) compares today's NAV with the August statement. It is identical before and after this change. Refreshing that baseline is its own follow-up.
- **Known limits, accepted and not fixed:** the shared `Modal` does not manage keyboard focus; the mobile ⓘ icon is about 14 px (the full-width one-liner below it is the real tap target); if a holding's whole opening lot has been sold, no disclaimer is built even if the headline is distorted.
- **Dividend payouts** are not scaled in the alternative XIRR, because that needs the holding on each payout date.

---

## How this was verified (so you can judge how much to trust it)

- Backend: dashboard, import, XIRR and API tests, 964 passed / 5 skipped. Frontend: typecheck clean, suite green after the final merge.
- Acceptance gate (`Docs/CAS Files/synthetic/harness/test_real_check.py`) on the **real** `chandra.pdf` and on the synthetic reproduction, with identical results: 46/46 funds match, largest invested-vs-CAS gap ₹0.07 and ₹0.91 with 0 funds over tolerance (₹10,82,539 before the fix), disclaimer firing for both members.
- Popup rendered and checked at desktop and phone width, light and dark.
- Two independent subagent reviews and the manager's PR review found five real bugs; all were fixed test-first. Details: "Implementation record" at the end of `Docs/superpowers/plans/2026-10-19-root-cause-b-chandra-tripathi-xirr-opening-balance-dating-disclaimer-fix.md`.
- **Not run:** this guide against the VM; the full backend suite (only the filtered set above); a real phone.
