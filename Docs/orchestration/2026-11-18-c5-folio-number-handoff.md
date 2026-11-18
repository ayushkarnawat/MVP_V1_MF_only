# Handoff: c5-folio-number (Batch C, task C-5)
**Status:** OPEN (written 2026-11-18; ready to relay to Codex now, independent of Batch B)
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-c-holdings-hygiene-plan.md` (Task C-5). Design: `Docs/orchestration/2026-11-12-batch-c-planning-workbook.html`, section 4 ("How the number travels").
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-c-hygiene` (git worktree, branch `batch/c-hygiene`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Task
Add the **full folio number** to three payloads, **beside** the old masked fields, which stay exactly as they are (the old staging link `ls-staging` shares this API and reads them). Additive only: no field removed, renamed or changed in meaning.

| Payload | Class and where it is built | Add | Old field that stays |
|---|---|---|---|
| Holdings rows (family and combined views) | `FolioSlice` in `backend/app/services/dashboard/schemas.py:55`, built in `backend/app/services/dashboard/holdings.py:268` | `folio_number: str` = `folio.folio_number` | `folio_masked` (`"XXXX" + folio.folio_number[-4:]`) |
| Fund page folio rows | `FolioOut` in `backend/app/services/fund_page/schemas.py:58`, built in `backend/app/services/fund_page/summary.py:182` | `folio_number: str` = `folio.folio_number` | `folio_masked` (`mask_folio(...)`, `"XXXXX"` + last four letters or digits) |
| Transactions ledger entries | `InvestmentWithdrawalEntry` in `backend/app/services/analytics/schemas.py:361`, filled in `backend/app/services/analytics/investment_withdrawal.py:140` | `folio_number: str \| None = None` = the full folio text | `folio` (masked by `_mask_folio`, `"XXXX"` + last four alphanumerics) |

The value is **the stored text exactly as first printed** (the column is documented "as first printed; display only"): nothing is trimmed, cleaned or reformatted (Q8 A). Example: stored `10234567 / 0` gives `folio_number == "10234567 / 0"` and, unchanged, `folio_masked == "XXXX / 0"` (the last four characters are ` / 0`; that is the existing quirk the new screens stop showing, **do not fix it here**).

## Facts already checked (2026-11-18)
- `mask_folio` (`fund_page/folios.py:12`), `_mask_folio` (`investment_withdrawal.py:55`) and the inline mask in `holdings.py` all stay; so do their tests.
- `full_folio_number(db, user_id, folio_id)` (`fund_page/folios.py:17`) and the route that uses it (the fund page's folio-number endpoint) **stay with their ownership check** (a folio of a member of the signed-in user only). No change.
- The member-only holdings route leaves folios out of its reply: `response_model_exclude={"holdings": {"__all__": {"folios"}}}` in `backend/app/api/dashboard.py:192`. The new field sits inside `folios`, so it is excluded there too: prove it with a test, change nothing.
- Stored ledger results (`analytics_sections`) predate the new field: the ledger field is optional with a default `None`, so an old stored payload still validates; new payloads carry it after the next recompute (the M1 deploy runs the recompute for all households, a later step, not yours).

## Tests first (name them; report which were RED first)
- `backend/tests/services/dashboard/test_holdings.py`: `test_family_row_has_full_folio_number_and_old_masked_field` (a folio stored as `10234567 / 0`: `folio_number == "10234567 / 0"` **and** `folio_masked == "XXXX / 0"` as today); `test_short_folio_and_slash_folio` (`123` gives `folio_number == "123"`, `folio_masked == "XXXX123"`? use the real current output of the old mask as your expectation: write down what the code returns today **before** changing it, then assert it unchanged); `test_folio_with_letters_is_returned_whole`.
- `backend/tests/services/fund_page/test_summary.py`: same three for `FolioOut`, with `folio_masked == mask_folio(...)` unchanged; extend the existing masked assertion (`{"XXXXX9183", "XXXXX5678"}`, line ~228) rather than replacing it.
- `backend/tests/services/analytics/test_investment_withdrawal.py`: a ledger entry carries `folio_number` (full text) and `folio` (masked) both; an entry built without a folio has `folio_number is None`; an old stored payload (without the key) validates through the schema.
- `backend/tests/api/test_dashboard_routes.py` (or the file that tests `api/dashboard.py`): `test_member_only_route_still_omits_folios` (no `folios` key at all in the member-only reply).
- `test_folio_number_endpoint_ownership_check_unchanged`: a folio of another user's member still answers as it does today (find the existing ownership test and keep it; add one only if none exists).
- A response-shape test per payload: the set of old keys is still present and unchanged, and `folio_number` is new.
Run each new test and see it fail for the stated reason (missing field) **before** implementing.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/dashboard/test_holdings.py tests/services/fund_page/test_summary.py tests/services/analytics/test_investment_withdrawal.py -v
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/api -k "dashboard or folio" -v
```
No full suite. (If a test file named above does not exist, say so and put the test beside its closest sibling; list it in the report.)

## Files you may touch
`backend/app/services/dashboard/schemas.py`, `backend/app/services/dashboard/holdings.py`, `backend/app/services/fund_page/schemas.py`, `backend/app/services/fund_page/summary.py`, `backend/app/services/analytics/schemas.py`, `backend/app/services/analytics/investment_withdrawal.py`, and the test files above. Anything else: Deviations in the report.
## Do not touch
`frontend/**`; the three masking helpers and their tests; `fund_page/folios.py`'s `full_folio_number` and its route; `backend/app/api/dashboard.py`; any migration (none is needed: the number is already stored in full); GA4 or logging of a folio (never log a folio number).

## Constraints
`AGENTS.md` non-negotiables; additive only; no real data (invented folios only); git is read-only for you.

## Open questions (flag, do not guess)
- Does any other payload carry a masked folio that the screens read (search `backend/app` for `mask_folio`, `_mask_folio`, `folio_masked` and `"XXXX"`)? List each; do not edit.
- Does any stored or cached payload (`analytics_sections`, a snapshot) hold `FolioSlice` data that would need a recompute to show the new field? Say which.

## Report format
One fenced block `CODEX REPORT: c5-folio-number`: status; baseline HEAD; exact commands with counts; which tests were RED first and why; `git status --short`; the final shape of each changed payload (a real example of one `FolioSlice`, one `FolioOut` and one ledger entry); Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-c5-folio-number-handoff.md (your task: C-5)
Work only in D:\unifolio-c-hygiene on branch batch/c-hygiene. Tests first. Git is read-only. Do not touch frontend/**.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
