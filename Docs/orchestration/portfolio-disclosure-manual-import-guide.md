# Monthly portfolio disclosure manual intake

Run from `backend/`, with the backend environment and reference scheme master available.
Download public portfolio workbooks in a normal browser. Import the actual `.xls`,
`.xlsx` or `.zip`, not a notice PDF, webpage, encrypted response or XML export.
The importer checks file magic, all members and all dates before writing anything.
Unknown names remain unmatched; failed weight checks retain rows with `FAILED` status.
Consumers read only `WRITTEN` batches.

| Exact AMC name | Page to open / file to download |
|---|---|
| Edelweiss Mutual Fund | https://www.edelweissmf.com/downloads/notice-cum-addendum — find the monthly portfolio notice and its underlying portfolio workbook; the notice PDF itself is not accepted. The supplied September consolidated workbook is verified. |
| Mahindra Manulife Mutual Fund | https://www.mahindramanulife.com/downloads#mandatory-disclosures-+-Monthly-Portfolio-Disclosure — monthly portfolio workbook. The supplied XML is unusable; obtain a real XLS/XLSX/ZIP before importing. |
| Invesco Mutual Fund | https://www.invescomutualfund.com/literature-forms/monthly-holdings/equity — scheme-wise monthly holdings. Only PDF supplied so far; obtain XLS/XLSX/ZIP. No PDF reader is implemented. |
| ITI Mutual Fund | https://www.itiamc.com/statuory-disclosure?type=Scheme+Related+Disclosures — monthly portfolio disclosure (the misspelled route is the recorded official path). The supplied consolidated workbook is August 2026, not September. |
| JM Financial Mutual Fund | https://www.jmfinancialmf.com/downloads/Portfolio-Disclosure — download each scheme's workbook; supplied September Large Cap and Mid Cap files are verified. |
| HSBC Mutual Fund | https://www.assetmanagement.hsbc.co.in/en/mutual-funds/investor-resources/information-library — download all required scheme-wise monthly portfolio spreadsheets. |
| Bandhan Mutual Fund | https://bandhanmutual.com/downloads/portfolio-summary/monthly — download the monthly holdings workbook in the browser. This is the seventh MANUAL registry row. |

For September, use these commands, replacing local filenames with your downloads:

```powershell
.venv/Scripts/python.exe scripts/jobs/import_manual_portfolio_disclosures.py --amc "Edelweiss Mutual Fund" --file Edelweiss.xlsx --as-of 2026-09-30
.venv/Scripts/python.exe scripts/jobs/import_manual_portfolio_disclosures.py --amc "Mahindra Manulife Mutual Fund" --file Mahindra.xlsx --as-of 2026-09-30
.venv/Scripts/python.exe scripts/jobs/import_manual_portfolio_disclosures.py --amc "Invesco Mutual Fund" --file Invesco.xlsx --as-of 2026-09-30
.venv/Scripts/python.exe scripts/jobs/import_manual_portfolio_disclosures.py --amc "ITI Mutual Fund" --file ITI.xlsx --as-of 2026-09-30
.venv/Scripts/python.exe scripts/jobs/import_manual_portfolio_disclosures.py --amc "JM Financial Mutual Fund" --file JM-Large-Cap.xlsx --file JM-Mid-Cap.xlsx --as-of 2026-09-30
.venv/Scripts/python.exe scripts/jobs/import_manual_portfolio_disclosures.py --amc "HSBC Mutual Fund" --file HSBC.xlsx --as-of 2026-09-30
.venv/Scripts/python.exe scripts/jobs/import_manual_portfolio_disclosures.py --amc "Bandhan Mutual Fund" --file Bandhan.xlsx --as-of 2026-09-30
```

Do not label the August ITI download as September. To import the supplied August
fixture in October, use its actual `--as-of 2026-08-31 --allow-old`.
`--allow-old` permits dates more than 45 days old; future dates remain forbidden.
If `--as-of` is absent the filename must supply an unambiguous date; no date is guessed.
The database source is `manual:<filename>`. The CLI commits the whole call together
and prints `matched=N unmatched=M schemes_written=K`; compare coverage with the previous
month. `schemes_written` counts persisted batches, including FAILED ones: inspect status.

The daily job creates waiting rows for every MANUAL scheme without a latest-month batch.
Inspect the current queue (replace the date with the last completed month-end):

```sql
SELECT amc_name, count(*) FROM disclosure_batches
WHERE status = 'awaiting_manual_upload' AND as_of_date = '2026-09-30'
GROUP BY amc_name;
```

Waiting rows are replaced when the matching scheme is imported; older waiting rows do
not count in the current queue. Lateness alerts are emitted only on days 10 and 20.
An August import does not complete a September queue row. Unmatched or failed batches
require investigation; never fabricate weights or relax the 90–101% sum-check band.
