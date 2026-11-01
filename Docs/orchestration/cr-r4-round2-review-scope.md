# Run 4, scoped second review round: prompt for the Codex desktop app

**Status:** READY TO RUN. Read-only review: Codex edits nothing and commits nothing.

**How it runs (manual overlay).** The owner opens the Codex desktop app on the clone folder `C:\Users\Ayush\cr-run-1` (branch `codex/cr-run-1`, at `f0e3dfc4`), pastes the prompt below as a normal message, waits for the answer in the thread, and pastes the whole answer to the orchestrating Claude. The `/codex:...` slash commands belong to Claude Code and do not exist in the Codex app; there is no status or result step.

**Range note:** the orchestrator handoff names `31e1f3fd..bc52488c`, but that range also contains Run 3's fix commit `ef811f5f`. The Run 4 fix commit alone is `ef811f5f..bc52488c` (4 files), so the prompt uses that range.

## Prompt (paste everything in the block)

```
You are an adversarial code reviewer. This is a READ-ONLY review: do not edit, create or delete any file, do not commit, do not change any git state. Reading files, running `git show` / `git diff` / `git log`, and running existing tests are fine.

Repo: Unifolio (Indian mutual fund tracker). Branch codex/cr-run-1, HEAD should be f0e3dfc4 (confirm with `git log --oneline -1`; tell me if it differs).

Review ONLY this fix commit, money maths only: `git diff ef811f5f bc52488c` (4 files: backend/app/services/dashboard/holdings.py, backend/tests/services/dashboard/test_holdings.py, frontend/src/features/mutual-funds/overview/HoldingsTable.tsx, frontend/src/features/mutual-funds/overview/HoldingsTable.test.tsx). For context only, already reviewed once: commits 510d43a1 (consolidate_holdings and _allocate_paisa) and 31e1f3fd (family holdings table). Read Docs/orchestration/cr-r4-common-rules.md first.

Try hard to break it. Look hardest at, in this order:
1. backend consolidate_holdings in holdings.py: units_held, average_price and each child's average_nav are now formatted with format(x, "f"). Find any input that still produces exponent form ("5E+1", "1E+3", "0E-8") anywhere in the ConsolidatedHolding payload (units, prices, money fields), including zero or negative units, a units value like "100.000", and invested = None. Check average_price is None exactly when units is zero or invested is None, and that no path divides by zero.
2. backend _allocate_paisa and the folio split: the parent's money equals the sum of its children to the paisa, each child equals the sum of its folios to the paisa, no folio goes negative, remainders land deterministically, an all-zero or single-folio input is safe, and no float is used anywhere on rupees or units.
3. frontend splitShares in HoldingsTable.tsx: largest-remainder; shares must total exactly 100.00 whenever total units > 0. Check: zero total, one member, a member with zero units, many members with equal units (tie order), huge unit counts (BigInt), a units string with no decimal point, a leading minus, an invalid string (BigInt must not throw and crash the table), and that the bar widths and the "Member shares" labels use the same numbers.
4. Regression read: parent = sum of children still holds for units, amount_invested, current_value, realized_gain, unrealized_gain, current_profit_total, today_gain; the single-member view and old payloads (no `consolidated` key) are unchanged; Direct and Regular stay separate parents.

Project rules: money is Decimal, never float, strings in payloads; everything additive; section keys unchanged; plain words in user-visible strings; never reword existing messages or labels.

Known failures that are NOT ours, do not report them: 5 backend tests that need backend/.cache/amfi_navall/nav_all.txt; benchmark and investment-withdrawal date tests that only fail on the 31st of a month; load-flaky frontend tests (OverviewPage "failed card shows error and retry refetches only that card", features/home/useNews.test.tsx). If the environment cannot run tests, say so and reason from the code instead.

Report format: start with the verdict (CLEAN or FINDINGS). Then findings, most severe first, each with file:line, the exact input that breaks it, expected versus actual output, and how sure you are. Write "not reproduced" for anything you suspected but could not demonstrate. Do not rewrite code and do not propose large refactors.
```
