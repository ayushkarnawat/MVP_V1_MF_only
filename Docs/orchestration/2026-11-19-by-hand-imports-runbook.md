# The seven by-hand disclosure imports for October 2026 (owner and intern)

**When:** now, and again if a house publishes late. The job's month is **31 Oct 2026**; the last of the by-hand files should be in by about **day 20 (20 Nov)**, after which I run the final audit. **Where it runs:** the staging VM (`ls-redesign.unifolio.in`), into the staging database only. **What it writes:** one batch per fund per house into the disclosure tables; it **does not touch any user's data**. **Safe to repeat:** importing a house again replaces its waiting rows; the whole call commits together or not at all. There is no dry run, so check the file name and the date before you press Enter.

Rules that keep this honest (from `portfolio-disclosure-manual-import-guide.md`): download the **actual spreadsheet** (`.xls`, `.xlsx` or `.zip`), never a notice PDF or a web page; never rename a file to make it look like another month; the date always comes from `--as-of`, here always `2026-10-31`; unknown fund names stay "unmatched" and failed weight checks stay marked failed (never fix or fabricate a weight).

## The seven houses (exact names matter)
| House (type it exactly) | Page to open | What to download |
|---|---|---|
| `Edelweiss Mutual Fund` | https://www.edelweissmf.com/downloads/notice-cum-addendum | the monthly portfolio notice's **workbook** for October (not the notice PDF) |
| `Mahindra Manulife Mutual Fund` | https://www.mahindramanulife.com/downloads#mandatory-disclosures-+-Monthly-Portfolio-Disclosure | the monthly portfolio **XLS/XLSX/ZIP** (not the XML) |
| `Invesco Mutual Fund` | https://www.invescomutualfund.com/literature-forms/monthly-holdings/equity | scheme-wise monthly holdings, **XLS/XLSX/ZIP** (a PDF is not accepted) |
| `ITI Mutual Fund` | https://www.itiamc.com/statuory-disclosure?type=Scheme+Related+Disclosures | October workbook (check the month inside; the August one is not October) |
| `JM Financial Mutual Fund` | https://www.jmfinancialmf.com/downloads/Portfolio-Disclosure | **one workbook per scheme**, all of them (several files in one command) |
| `HSBC Mutual Fund` | https://www.assetmanagement.hsbc.co.in/en/mutual-funds/investor-resources/information-library | all the scheme-wise monthly portfolio spreadsheets |
| `Bandhan Mutual Fund` | https://bandhanmutual.com/downloads/portfolio-summary/monthly | the monthly holdings workbook |

Open each page in a normal browser on your own computer (some of these sites block servers). Put every download in one folder, for example `D:\disclosures-nov\`, with short names without spaces: `Edelweiss.xlsx`, `Mahindra.xlsx`, `Invesco.xlsx`, `ITI.xlsx`, `JM-1.xlsx`, `JM-2.xlsx`, `HSBC.xlsx`, `Bandhan.xlsx`. If a house has not published October yet, skip it and note it; do not use September's file.

## Step 1 - copy the files to the VM
In **WSL** (Ubuntu), the only place SSH to the VM works from:

```powershell
wsl.exe -d Ubuntu -- bash -lc "scp /mnt/d/disclosures-nov/* deploy@ls-redesign.unifolio.in:/home/deploy/disclosures-nov/"
```

The folder `/home/deploy/disclosures-nov` already exists on the VM (prepared and tested today; the import command can read it).

## Step 2 - run one house at a time
Each command is one line, run from your PC through WSL. The first one is shown in full; for the others change only the name and the file names. **Run them one by one and read each result before the next.**

```powershell
wsl.exe -d Ubuntu -- bash -lc "ssh deploy@ls-redesign.unifolio.in 'cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T -v /home/deploy/disclosures-nov:/files:ro backend python scripts/jobs/import_manual_portfolio_disclosures.py --amc \"Edelweiss Mutual Fund\" --file /files/Edelweiss.xlsx --as-of 2026-10-31 < /dev/null'"
```

The same, for the others (only the `--amc` and `--file` parts change; JM Financial takes one `--file` per workbook):
- `--amc "Mahindra Manulife Mutual Fund" --file /files/Mahindra.xlsx`
- `--amc "Invesco Mutual Fund" --file /files/Invesco.xlsx`
- `--amc "ITI Mutual Fund" --file /files/ITI.xlsx`
- `--amc "JM Financial Mutual Fund" --file /files/JM-1.xlsx --file /files/JM-2.xlsx`
- `--amc "HSBC Mutual Fund" --file /files/HSBC.xlsx`
- `--amc "Bandhan Mutual Fund" --file /files/Bandhan.xlsx`

(Do not add `--allow-old`: 31 Oct is inside the 45-day window until 15 Dec. Do not add `--allow-any-date`.)

## Step 3 - read the result
It prints one line like `matched=N unmatched=M schemes_written=K`.
- **Good:** `matched` is a large share of the house's funds (for scale: Edelweiss about 312 funds, Bandhan 435, HSBC 282, Invesco 249, JM Financial 178, Mahindra Manulife 122, ITI 114) and `unmatched` is small.
- **Look again:** `unmatched` is large, an error about file type, date or "file magic", or `schemes_written` is much lower than the house's fund count. Do not retry with other flags; copy the whole printed output into the chat to me.
- `schemes_written` counts failed batches too. A failed batch (weights outside 90 to 101 percent) is kept and marked failed: tell me the count and I will list them.

## Step 4 - tell me
Write the chat one line per house: the house, the file names, the printed line, anything odd. I then re-run the audit (E1 to E5, read-only), update the coverage table in `2026-11-19-disclosures-audit-first-pass.md`, and run the final pass after day 20.

## If something goes wrong
- Wrong file imported for a house: tell me before doing anything; the next correct import for that house replaces its batches. Nothing here deletes user data.
- "Permission denied" or "no such file": the file did not reach `/home/deploy/disclosures-nov` (Step 1); list it with `wsl.exe -d Ubuntu -- bash -lc "ssh deploy@ls-redesign.unifolio.in 'ls -l /home/deploy/disclosures-nov'"`.
- Do not run any command with `clean-db`, `restore` or `rollback` in its name.
