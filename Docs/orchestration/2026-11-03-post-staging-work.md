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

## CA Excel (SENT by the owner on 3 Nov; frozen, no further edits)
- File: `Docs/orchestration/ca-excel/Unifolio_seven_funds_2026-11-03.xlsx` (never committed; the folder is in `.git/info/exclude`), built by `build_workbook.py` from the export `ca_export_warm_20261103.json`. Seven funds, Direct and Regular where both exist (13 rows); the Motilal Nifty 200 Momentum 30 entry whose official name states no plan is omitted (it repeated the Direct plan's return) and the Read me says so. Bandhan Small Cap is out (owner decision).
- Export script `backend/scripts/export_ca_fund_metrics.py` (commits `c17d1f35`, `c0862aaf`, NOT deployed; it ran once from a temporary folder mounted read-only into the backend container). The category comparison and ranking need peers' NAVs: only 1,476 of 14,441 funds have a NAV for the latest day (the recompute fills the rest for the categories households hold). **The owner approved one NAV warm on 3 Nov, evening**: the run was done with `--warm-nav-cache` (about a minute), which let only `INSERT INTO nav_history ... ON CONFLICT DO NOTHING` through. Effect: Nippon Regular's NAV moved from 16 Oct to 2 Nov (rank 22 to 28 of 32 for 1 year), Large Cap peers rose from 23 to 46 funds with a 2 Nov NAV; most peers that still end earlier are funds that no longer publish NAVs. nav_history gained those cache rows (public mfapi data).
- Verification done: the first independent reader (2,742 cells match the JSON; 13 findings, all wording or presentation except the stale NAV issue and the no-plan row, now fixed); my hand recompute from the raw tables for five funds (large/mid/small split exact, P/E, P/B and coverage exact for four funds, Axis top 10, the 3-year return window rule). NOT done: comparison of the top 10 with the fund houses' own published September files (that is the CA's check; the Read me says so).
- Two independent readers checked the file; the owner sent it to the CA. Nothing more is to be changed in it.

## Open (needs the owner or a later day)
1. **Manual and visual QA** with `2026-11-03-manual-qa-checklist.md` (who does it is the owner's call; sections 8 to 10 need real inboxes).
2. **Fund page first call** is 86 to 108 ms against a 100 ms limit, and some scripts are 3 to 29 percent slower than the 2 Nov baselines (see the record). Re-measure unflagged after about 23:00 IST on a trading day; look at the first call if it stays over 100 ms.
3. **Priority 1, 10 Nov 06:00 IST**: the `fund-managers-monthly` run. Nine houses still need a hand import for November and five have no factsheet. The 9 Nov reminder and the 10 Nov read-only check are scheduled. The four houses imported tonight stay automatic: check them after the 10 Nov job (their rows must carry an automatic match method and November's period; a second failed month moves a house to manual).
4. **Hand-import houses: DONE at 22:00 IST on the owner's word** (ICICI 156, Kotak 112, HDFC 106, Bandhan 87, Invesco 45, WhiteOak 22, ITI 21, JM 15, Trust 11 matched). **Axis has no factsheet file anywhere, so Axis stays on its 31 Aug rows** (the owner supplies the file, then one `import_manual_fund_managers.py` run). A recompute followed.
5. **ICICI manager rows with index names** (13 rows such as "100 Low Volatility"): replaced by tonight's ICICI import (to confirm).
6. **`deploy.sh` retag failure.** `deploy.sh` stopped twice at `docker tag <old image> :previous` ("No such image"). FIXED in `84aecf5d` (warn instead of stopping); the deploy order and the disk rule are in the deploy guide section 3, items 8 and 9. **Still owed by the owner: resize the VM disk in the CloudPe dashboard before the next backend deploy.**
7. **Printed-return check (L7)** for the other 43 new indices as soon as a factsheet maps funds to them.
8. **Send the intern block** (see above), then the CA message once the Excel is verified.
