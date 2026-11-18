# Batch C whole-batch review (18 Nov 2026): findings and what was done

Reviewer: an independent Sonnet agent, read-only, given the batch diff, the plan's constraints and an attack list (not the orchestrator's conclusions). Verdict: **ready to merge: yes**, no Critical or High. It ran backend (about 430 tests) and frontend (about 1,100 tests across 95 files) and found them green; it did not run types, lint, screenshots or dark mode. A Codex second opinion is available (`2026-11-18-codex-review-prompts.md`, section 3).

| # | Sev | Finding | Disposition |
|---|---|---|---|
| M1 | Medium | A wrong-person import started from Family Combined moves the user to that person; workbook section 5 row 3 says Family Combined stays "for any import", row 5 says wrong-person lands on that person. | **Owner decision needed.** Today: lands on that person (row 5's reason: they are the one person whose funds were just added). If row 3 wins, add `startMode === "member"` to that branch (one line, with a test). |
| M2 | Medium | The unidentified-funds dialog prints a full folio with no eye, so "one click hides all folio numbers" was not true there (`features/dev/ImportHealth.tsx` also, a developer page). | **Fixed** (red test first): the dialog follows the hide setting with no new control. The developer page is left as a recorded exclusion (not a user screen). |
| M3 | Medium | The import waits for the member list with no timeout. | **Fixed** (red test first): after 5 seconds it counts as "no list": the page goes back to Mutual Funds and stays on the viewed member. |
| M4 | Medium | Stored ledger payloads from before the deploy have no `folio_number`, so the ledger row's Folio line is empty until the stored sections are rebuilt. | **Handled in the M1 guide**: `analytics-recompute-all` rebuilds every section; step 8 runs it right after the migration. |
| L | Low | `maskFolio`: a slash early in a folio leaks the rest; a folio of four characters or fewer shows in full. | Both are what the workbook specifies (sub-folio kept as printed; short folio kept). Pinned by a new test for two slashes. |
| L | Low | `FolioNumber` crashed on a missing value. | **Fixed** (red test first): renders nothing. |
| L | Low | Eye has no `title`; hidden-Copy tip is `title` only; 22 px target is under 24 px; dark hover equals the elevated surface. | **Not changed**: matches the workbook drawing; listed for the QA round. |
| L | Low | `membersRef` unused; `fundPageApi.folioNumber` unused; duplicate "Couldn't copy" text. | `membersRef` removed. The other two left (the endpoint stays by design, Q7). |
| L | Low | Whitespace-only category gives an empty-label bucket; the `Unclassified` branch is unreachable (`sebi_category` is NOT NULL). | Left: not reachable from AMFI data; noted. |

**Mutation survivors**, reasoned by the reviewer: `lastIndexOf` for the slash and a renamed storage key (both now pinned by new tests); a changed "Unclassified" label (the donut test asserts its absence; unreachable branch); dropping the `viewMode` check in the growth rule (equivalent, idempotent); dropping the `startMode` check (M1); dim styling only (accepted).
After the fixes: shell, components/mf, features/import and lib: 94 files, 1,018 tests green, types clean, lint 0 errors.
