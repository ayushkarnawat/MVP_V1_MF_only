# Handoff: Factsheet benchmark readers and name normaliser (T3.2)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 3 review gate)
**Run:** 3 of 7 | **Slug:** `cr-r3-factsheet-benchmarks` | **Commit prefix:** `cr-r3:` | **Tasks:** T3.2
**Order:** After T3.1 and T3.1b. Edits migration 0049 in place (adds the `scheme_benchmark` table).
**Rules:** `Docs/orchestration/cr-r3-common-rules.md` (read first), then `cr-r2-common-rules.md`. **Task text (authoritative):** plan, the task sections named above (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Notes
- Readers per house from local text fixtures (`backend/tests/fixtures/factsheets/`); real PDFs only for local read-only checks at `/mnt/c/Users/Dell/Desktop/Unifolio/Factsheets/`. List each house's real printed benchmark names you found and the reading you chose; flag ambiguity instead of deciding silently.
- Name normaliser handles TRI / Total Return Index, S&P BSE to BSE, price-only names (treated as TRI and marked), composites with weights, and BSE to NSE labelled substitution; CRISIL and other unavailable series return no key and keep the declared name.
- A house that failed this month keeps last month's mapping, marked with its age.
- Plain words in anything user-visible.
