# October cycle: commands to collect (read-only)

Purpose: gather the outputs needed to write the "re-run the background jobs" section of the
Analytics Strengthening Plan. Every command here only reads. Nothing is changed on the VM,
the databases or AWS.

## Terminals (same labels as `2026-10-15-leapswitch-staging-runbook.md`)

| Label | Where | What it is |
|---|---|---|
| **Terminal A** | Your laptop, PowerShell | SSH into the VM. Nothing else runs here. |
| **Terminal B** | The VM, over SSH (what Terminal A opens) | Everything on the CloudPe server |
| **Terminal C** | Your laptop, WSL with the AWS CLI | AWS questions only |

Rules: run each block in the terminal named above it. Never paste passwords, access keys or the
SSH key into the chat. The `.env` checks below print only 1 or 0, never the value.

---

## Terminal A: open the VM

```powershell
ssh -i $HOME\.ssh\id_ed25519 deploy@ls-staging.unifolio.in
```

**Good looks like:** a shell prompt on the VM (the name ends in your VM name, not your laptop).
Then run the Terminal B blocks in that same window.

**If it times out (not "refused"):** your current IP is not in the CloudPe security group. That is
a dashboard setting, not a VM problem. See the Troubleshooting section of the runbook.

**If it says permission denied:** `deploy` is the only login (root login is disabled). Check that
the key path is right.

---

## Terminal B: on the VM

Block B1: where things are.

```bash
crontab -l | grep -E '^(CRON_TZ|RUN=)|portfolio|fund-managers|scheme-master|analytics-recompute'
cd /opt/unifolio/deploy/leapswitch 2>/dev/null || cd /srv/unifolio/deploy/leapswitch; pwd; docker compose ps
ls -la /var/log/unifolio* 2>&1 | head
grep -c '^OPS_ALERT_EMAIL=.' .env; grep -c '^EMAIL_DELIVERY_MODE=ses' .env
```

**Good looks like:** the cron lines for the jobs; `pwd` printing the repo path; the services
(postgres, backend, worker, caddy) up; two numbers, ideally `1` and `1`. A `0` on either means
the failure email cannot be sent.

Block B2: the database questions (stay in the same shell as B1).

```bash
set -a; . ./.env; set +a
C=$(docker compose ps -q postgres)
q() { docker exec -e PGPASSWORD="$DB_PASSWORD" -i "$C" psql -U "$DB_USERNAME" -d "$DB_NAME" -c "$1"; }
q "SELECT amc_name, status, count(*) FROM disclosure_batches WHERE as_of_date='2026-09-30' GROUP BY 1,2 ORDER BY 1,2;"
q "SELECT s.amc_name, max(m.reference_period) AS latest FROM scheme_fund_managers m JOIN schemes s ON s.id=m.scheme_id GROUP BY 1 ORDER BY 1;"
q "SELECT count(*) FROM schemes;"
q "SELECT name FROM schemes WHERE name ILIKE '%Smallcap250 Momentum%' OR name ILIKE 'Zerodha Silver ETF%' OR name ILIKE 'Union Gold ETF%' OR name ILIKE 'Mirae Asset BSE Select IPO%';"
```

**Good looks like:**
- the first query lists AMCs with `WRITTEN` counts for 2026-09-30;
- the second shows each AMC's latest factsheet month;
- the third is about 14,000 (AMFI's list is 14,390);
- the fourth lists funds, which shows the scheme master is current.

**Run `echo $DB_NAME` first** if you are unsure which database you are in. On the VM it is the
local staging database, so there is no tunnel to open.

---

## Terminal C: AWS (laptop, WSL)

```bash
aws sts get-caller-identity --query Arn --output text
aws scheduler list-schedules --query "Schedules[?contains(Name,'job')].[Name,State]" --output table
aws ecs list-clusters --output text
aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend --query "services[0].taskDefinition" --output text
```

**Good looks like:**
- your own AWS user ARN (if it shows the CloudPe SES user, you are in the wrong profile: run `unset AWS_PROFILE`);
- a table of job schedules with `ENABLED` or `DISABLED`;
- the cluster names, so the production one is known;
- the task definition the backend is running now (its name ends in a revision number, which tells which image AWS has).

These four commands need no tunnel and no bastion, so the AWS bastion stays stopped.

---

## What to send back

Paste the outputs of B1, B2 and C. Redact nothing except anything that looks like a secret (none
of these commands should print one).
