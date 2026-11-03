# Post-staging work, state at 3 Nov 2026, 19:15 IST

The staging deploy of the change requests release is finished (record: `2026-11-03-staging-deploy-record-change-requests.md`). This file lists what came after it and what is still open.

## Done tonight
| Item | Result |
|---|---|
| Book-value job run once (L16, L17) | 829 of 914 stocks updated, 85 skipped (9.3%), no NSE block, 66 min; TCS, Bajaj Finance and HDFC Bank agree with the filings |
| Daily stock job once, so P/B uses the filings | 805 stocks on a filing-based P/B |
| Four `--this-month-only` factsheet imports | Sundaram 40, Angel One 11, Mahindra Manulife 27, SBI 93 matched, 0 unmatched |
| Sundaram check | found and fixed the reader defect (ordinals and a semicolon list stored as one manager); re-imported; 0 odd names; commit `0dfd1261` |
| Final forced analytics recompute | 5 min 11 s, 17 scopes x 15 sections, 0 failed |
| Cron | `manual-factsheets-check` (15th, 06:00) and `filings-book-value` (Sunday 04:30) installed in root's crontab |
| O6 and O7 | read-only reports produced, see `2026-11-03-o6-o7-readings.md` (the owner confirms) |
| L7 printed-return check | 28 of 28 indices PASS (largest difference 0.02 points); 20 of them among the 56 new ones |
| Intern pack | `2026-11-03-prompt-for-ui-round-2-after-release.md` and `2026-11-03-intern-handover-after-staging.md`, on origin with the release branch |

## In progress
- **CA Excel (six funds, all three Motilal momentum funds, Direct and Regular).** A background worker is writing `backend/scripts/export_ca_fund_metrics.py` (read-only, reuses the screens' own functions). Then: review every line, run it on the VM, build the workbook with `openpyxl`, verify (runbook Phase 5, a second reader checks items 1 to 3), hand over. The `.xlsx` is never committed. Bandhan Small Cap is out (owner decision 3 Nov). Use the 30 Sep 2026 holdings, not the October files.

## Open (needs the owner or a later day)
1. **Manual and visual QA** with `2026-11-03-manual-qa-checklist.md` (who does it is the owner's call; sections 8 to 10 need real inboxes).
2. **Fund page first call** is 86 to 108 ms against a 100 ms limit, and some scripts are 3 to 29 percent slower than the 2 Nov baselines (see the record). Re-measure unflagged after about 23:00 IST on a trading day; look at the first call if it stays over 100 ms.
3. **Priority 1, 10 Nov 06:00 IST**: the `fund-managers-monthly` run. Nine houses still need a hand import for November and five have no factsheet. The 9 Nov reminder and the 10 Nov read-only check are scheduled. The four houses imported tonight stay automatic: check them after the 10 Nov job (their rows must carry an automatic match method and November's period; a second failed month moves a house to manual).
4. **Hand-import houses** (ICICI, Kotak, HDFC x2, Axis, Bandhan, Invesco, WhiteOak, ITI, JM, Trust): the September files are on the VM (`/home/deploy/factsheets-oct2026`, plus the owner's `D:\Factsheets October`). Their benchmark names, printed returns, P/E and P/B for those houses come only from `import_manual_fund_managers.py` runs. **Not run, not authorized**: only the owner's word starts them. Bandhan's VM import was never authorized and is dropped.
5. **ICICI manager rows with index names** (13 rows such as "100 Low Volatility"): replaced by the next ICICI hand import.
6. **`deploy.sh` retag failure.** `deploy.sh` stopped twice at `docker tag <old image> :previous` ("No such image"). Fix in a small repo change before the next deploy (skip the retag when the old image is gone) and keep the guard that stops the wrapper script when the deploy step fails.
7. **Printed-return check (L7)** for the other 43 new indices as soon as a factsheet maps funds to them.
8. **Send the intern block** (see above), then the CA message once the Excel is verified.
