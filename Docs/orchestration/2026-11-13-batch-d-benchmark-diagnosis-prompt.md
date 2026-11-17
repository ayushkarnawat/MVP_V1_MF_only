# Batch D, item 13: benchmark-line diagnosis kit (read-only)

**Purpose.** Find out why the benchmark line does not draw on the Home graph. The script runs the same server functions the Home screen uses, for each period (1D, 1W, 1M, 1Y) and each of the five benchmarks, and applies the same test the browser applies before it draws the line. It prints counts, dates and flags only.

**Safety.** Read-only: any write or database change aborts the run. No names, no folios, no rupee amounts, no emails are printed. The only identifiers are the user and member UUIDs. It reads stored prices only (no live downloads), exactly as the Home screen does. It was smoke-tested on invented data before being handed over; it has not been run on staging.

**Files.**
- Script: `backend/scripts/diagnose_home_benchmark_line.py` (branch `leapswitch-redesign`, not committed). It is also in the Word document `Batch-D-benchmark-diagnosis-kit.docx` and as a separate `.py` file, both in `Desktop\MVP v1\`. The prompt checks the copy against a line count and a SHA-256 checksum.
- Planning workbook: `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, section 2.

**Hard rules (from the project runbooks).** Never run `clean-db`, `restore`, `rollback`, a deploy, or any command that changes the VM or its data. Read `Docs/orchestration/2026-11-09-runbook-staging-network-and-access.md` first and run its pre-flight check. Use the hostname `ls-redesign.unifolio.in`, never the raw IP. Run SSH from WSL, not Windows.

---

## The prompt to give to the manager's Claude

Paste everything inside the box below.

```
You are helping me run ONE read-only diagnosis on the Unifolio staging VM and report the raw output back. Do not try to fix anything. Do not edit the script. Do not run anything that changes the VM, the database or the app.

CONTEXT
On the Home screen the benchmark line is not drawn. A script, diagnose_home_benchmark_line.py, runs the same server functions as the Home screen and applies the browser's own draw rule. It prints counts, dates and flags only (no names, folios or rupee amounts). It aborts if anything tries to write. The script is in the attached Word document (section "The script") and also as a separate .py file if I attached one.

RULES
- If you have the repo, read Docs/orchestration/2026-11-09-runbook-staging-network-and-access.md first and run its pre-flight check. Use the hostname ls-redesign.unifolio.in (never the raw IP). Run SSH from WSL.
- Never run clean-db, restore, rollback, a deploy, docker compose up/down/restart, or any write command.
- If the script prints "FAIL read-only guard", stop and tell me. Do not work around it.
- Do not summarise or interpret the output. Show it to me in full.

STEPS
1. Save the script as a file named diagnose_home_benchmark_line.py in a scratch folder on this laptop (for example ~/diag-local/). Copy it exactly from the attached .py file, or from the section "The script" of the Word document. Change nothing. Then verify the copy:
   wc -l diagnose_home_benchmark_line.py        (must print 256)
   tr -d '\r' < diagnose_home_benchmark_line.py | sha256sum
   (must print cab2336e5157a2ecc7da7c9fc28d13d3f0b8ed53f4d5a4bf7e2f6da91e3c94da)
   If either does not match, stop and tell me. Do not continue with a different copy.

2. Copy it to the VM (from WSL, from the scratch folder):
   ssh deploy@ls-redesign.unifolio.in "mkdir -p /home/deploy/diag"
   scp diagnose_home_benchmark_line.py deploy@ls-redesign.unifolio.in:/home/deploy/diag/

3. On the VM, list the users (counts only):
   ssh deploy@ls-redesign.unifolio.in
   cd /opt/unifolio-redesign/deploy/leapswitch
   docker compose run --rm -T \
     -v /home/deploy/diag/diagnose_home_benchmark_line.py:/app/scripts/diagnose_home_benchmark_line.py:ro \
     backend python scripts/diagnose_home_benchmark_line.py --list-users
   Show me the output and ask me which user_id to use (default: the one with the most folios).

4. Run the diagnosis for that user (whole household), and save the output:
   docker compose run --rm -T \
     -v /home/deploy/diag/diagnose_home_benchmark_line.py:/app/scripts/diagnose_home_benchmark_line.py:ro \
     backend python scripts/diagnose_home_benchmark_line.py --user-id <USER_ID> > /home/deploy/diag/home_benchmark_household.json
   cat /home/deploy/diag/home_benchmark_household.json

5. If that household has more than one member, run it once more for ONE member (use a member id I give you; if I do not give one, skip this step):
   ... --user-id <USER_ID> --member-id <MEMBER_ID> > /home/deploy/diag/home_benchmark_member.json
   cat /home/deploy/diag/home_benchmark_member.json

6. Two more read-only facts, printed as text:
   git -C /opt/unifolio-redesign rev-parse --short HEAD
   git -C /opt/unifolio-redesign log -1 --format=%cI
   docker compose ps --format "table {{.Service}}\t{{.Status}}"

7. OPTIONAL (only if I am at a browser): open the staging Home page logged in. In DevTools, Network tab, find the request named "wealth-series" for the current period and show me ONLY these fields of its JSON reply: period, start, end, empty, and inside "benchmark": index, available, pct, clipped, effective_start, and the NUMBER of items in "points" (not the values). Also the number of items in the top-level "points". Then in the Console run localStorage.getItem('home.benchmark') and show the result, and list any red errors in the Console. Do not copy rupee values or names.

8. Report back, all in one message:
   - the full text of every output above, unedited,
   - the date and time (India time) you ran it,
   - anything that failed, with the exact error text.
   Do not guess a cause. Do not propose a fix.
```

---

## What the output contains (for whoever reads it)

| Field | Meaning |
|---|---|
| `alembic_version` | The database version on staging (tells us which build is running). |
| `index_history` | For each of the five indices: how many total-return and price rows are stored, the first and last date, days since the last row, and the largest gap in days over the last 400 days. |
| `holdings` | Counts only: funds, funds with no price, latest price date, whether prices are partial. |
| `periods.<period>.<index>.would_draw` | True when the browser would draw the line (available, not clipped, equal point counts). |
| `periods.<period>.<index>.reason` | The first failed condition, in words. |
| `portfolio_points`, `benchmark_points` | The two counts the browser compares. |
| `summary` | How many of the 20 cells would draw and a count of each reason. |

**Next step (for the owner and Claude).** Send the output back to the planning session. The workbook's decision table (Batch D, section 2) maps each result to a cause and a fix, and the fix is planned and reviewed there before any code changes.
