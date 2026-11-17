# Batch C: Holdings Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** Fix four small Mutual Funds problems in milestone M1: merged category names in the donut (17a), the "assumed main manager" line removed (17b), full folio numbers with an eye icon (17c), and the new family member shown in the drop-down after an import (17d).

**Architecture:** 17a is one call to the existing `canonical_category()` in the category donut, plus a one-time recompute at deploy. 17b deletes one sentence in the front end. 17c adds a `folio_number` field beside the old masked fields in three payloads (additive only, the old staging link shares this backend) and one shared front-end component with a remembered hide/show setting. 17d makes the import wrapper wait for the member list, then choose the view.

**Tech Stack:** FastAPI, SQLAlchemy, pytest; React, TypeScript, Vitest.

**Spec:** `Docs/orchestration/2026-11-12-batch-c-planning-workbook.html` (16 of 16 answered; the 17 Nov updates: Q3 D, Q5 old fields kept, Q12 B only when the household grew, Q13 A, Q16 A and B). Program rules: `Docs/orchestration/2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets and handoffs are not written here.** The orchestrator (Claude) writes each Codex handoff and each Antigravity packet in detail when its task starts. A handoff has: goal and boundary, the failing test first, facts to re-check, do-not-touch, tests to run, report format.
- **Wave-start check:** re-read each "read in code" fact in the workbook against the repo and report drift: `compute_category_allocation` (note: it is `async`) in `backend/app/services/analytics/allocation.py` line ~36; `canonical_category` in `scheme_universe.py`; `FolioSlice` (`dashboard/schemas.py:55`, built in `dashboard/holdings.py:268`); `FolioOut` (`fund_page/schemas.py:58`, built in `fund_page/summary.py:182`); the ledger entry's masked folio in `analytics/investment_withdrawal.py`; `ASSUMED` and `marker()` in `FundManagerCard.tsx`; `onDone` in `shell/wrappers/ImportWrapper.tsx:66`; `shell/scope/resetRule.ts`.
- **Branch:** `batch/c-hygiene`, cut from `leapswitch-redesign` at wave 1 start. No file is shared with Batch B (B edits `features/auth/`, `features/import/prompts/`, `auth-tokens.css`, `email_templates.py`).
- **Builders:** Codex builds all backend work and all red tests. Antigravity builds the folio eye component's look and the 17d drop-down change only if the packet shows a visual need (see C-8); otherwise Codex builds the front-end logic. Claude orchestrates, writes the deploy step, reviews, commits.

## Global Constraints

- Old staging link stays untouched: **no field removed, renamed or changed in meaning.** `folio_masked` (holdings, fund page) and the ledger's masked folio keep their values and tests. `mask_folio` and `_mask_folio` stay.
- The folio text is returned **as first printed** (the column is "display only"); nothing is cleaned or reformatted (Q8 A). Never sent to GA4, never logged. The member-only holdings route still leaves folios out (`response_model_exclude` in `api/dashboard.py`, Q6 A).
- `schemes.sebi_category` is not changed (Q9). The donut applies `canonical_category` at read time; values stay `Decimal`; percentages still sum to 100; "Unclassified" passes through unchanged.
- `FundManagerCard`: keep `main_source` in types and the `main_source == null` "updating" message.
- The folio-number endpoint and its ownership check (`full_folio_number()` in `fund_page/folios.py`) stay (Q7); the Copy button copies the shown number and is dimmed with the tip "Show the number to copy it" while hidden.
- Eye icon: one click hides/shows **all** folio numbers in the app; hidden form is `XXXX` + last four digits of the folio part + the sub-folio, for example `XXXX4567 / 0`; remembered per browser (not on the account); default is shown; a real button labelled "Hide folio numbers" / "Show folio numbers" with a pressed state; no analytics.
- No migration (Batch B owns 0054). 17a refresh is a script run at deploy, not a migration.
- Phone code (`frontend/src/mobile/**`): not edited except where C-8's check finds a phone screen that renders a folio from these payloads; then only that line, and the old masked field still works there.

## Review Focus

- A folio with a slash and sub-folio ("10234567 / 0"), a short folio ("123"), and a folio with letters all render in full and hide correctly.
- A household with exactly two Flexi Cap funds spelled "Scheme" and "Schemes" gives one slice; Sectoral + Thematic become one slice; sums still 100.
- A fund whose category text no alias knows stays as is (no fuzzy matching), and the scan test reports any surviving "Scheme/Schemes" pair.
- 17d: import adds a member while viewing one person lands on Family Combined; adds none stays; wrong-person import lands on that person (new or existing); a failed member refresh does not block navigation; a second import does not leave a stale list.
- 17d: `resetRule.ts` must not undo the landing or the "stay on the member" decision when the user leaves the import page.
- Hidden folio is never copyable by accident, and survives a reload.

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/analytics/allocation.py` | `compute_category_allocation`: bucket by `canonical_category(category)`. |
| `backend/app/services/dashboard/{schemas,holdings}.py` | `FolioSlice.folio_number: str` next to `folio_masked`. |
| `backend/app/services/fund_page/{schemas,summary,folios}.py` | `FolioOut.folio_number: str` next to `folio_masked`. |
| `backend/app/services/analytics/{schemas,investment_withdrawal}.py` | Ledger entry gains `folio_number: str \| None`; masked field stays. |
| `frontend/src/features/mutual-funds/allocation/FundManagerCard.tsx` | Delete the sentence and `marker()`. |
| `frontend/src/components/mf/FolioNumber.tsx` (new) + `frontend/src/lib/folioVisibility.ts` (new) | The number plus its eye; the remembered setting and the one mask function. |
| `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx`, `individual-fund/overview/{InvestmentDetails,TileDialog}.tsx`, `mutual-funds/transactions/{transactionsLogic.ts,Ledger.tsx}`, `components/mf/OpeningBalanceModal.tsx`, the two `types.ts` | Read `folio_number` through `FolioNumber`. |
| `frontend/src/shell/wrappers/ImportWrapper.tsx`, `features/import/useImportOrchestration.tsx` | Wait for `refreshMembers()`, choose the view, carry the person id for the wrong-person case. |

## Task list

| Task | What | Builder | Size | Order |
|---|---|---|---|---|
| C-1 | Re-check facts, write handoffs | Claude | M | first |
| C-2 | 17b remove the line, rewrite its test | Codex | S | lane 1, first (pipeline check) |
| C-3 | 17a category donut merge | Codex | S | lane 3 |
| C-4 | 17a one-time recompute (deploy note) | Claude | S | with C-3 |
| C-5 | 17c backend: `folio_number` in three payloads | Codex | M | lane 4 |
| C-6 | 17c frontend contract: `lib/folioVisibility.ts`, types, red tests | Codex | S | after C-5 |
| C-7 | 17c `FolioNumber` component and the screens | Antigravity | M | G-a, after C-6 |
| C-8 | 17c phone check and any phone line | Claude, then Codex | S | after C-7 |
| C-9 | 17d member refresh and view rule (logic and tests) | Codex | M | lane 2 |
| C-10 | 17d onboarding upload and phone import path check | Claude, then Codex | S | with C-9 |
| C-11 | Whole-batch review, M1 notes | Claude | M | last |

C-7 is the only Antigravity task: lane G-a, files `components/mf/FolioNumber.tsx` and the screen files listed above. 17b, 17a, 17d have no new visual, so they stay with Codex (workbook section 6).

---

### Task C-1: Re-check facts and write handoffs (Claude)

- [ ] **Step 1:** Run the wave-start check above. For each item, write the handoff at this point (detailed, from the repo as it is that day). Report drift to the user before building.

### Task C-2: Remove the "assumed main manager" line (17b)

**Files:** Modify `frontend/src/features/mutual-funds/allocation/FundManagerCard.tsx`; Test `FundManagerCard.test.tsx` (same folder).

**Interfaces:** Consumes the existing `main_source` field (`"marked" | "assumed" | null`). Produces nothing new.

- [ ] **Step 1: Write the failing test.** Rewrite `shows an assumed marker on assumed managers` as `never shows the assumed sentence, even for an assumed group (cards view)` and add `... (table view)`; assert `screen.queryByText(/Assumed main manager/)` is null. Keep the single-manager absence assertions and the "updating" test.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/mutual-funds/allocation/FundManagerCard.test.tsx`. Expected: the two new tests FAIL.
- [ ] **Step 3: Implement:** delete `ASSUMED`, `marker()` and its two uses (lines ~16, 40, 73, 95). Search once for the sentence in `frontend/src`, `backend`, and PDF export text; none other expected (`features/analytics/FundManagerSection.tsx` has none).
- [ ] **Step 4: Run** the test file, then `npx tsc -b` and `npx oxlint src/features/mutual-funds/allocation`. Expected: PASS, no unused code.

### Task C-3: Group the category donut by merged name (17a)

**Files:** Modify `backend/app/services/analytics/allocation.py` (`async def compute_category_allocation`, bucket key at line ~58); Test `backend/tests/services/analytics/test_allocation.py`.

**Interfaces:** Consumes `canonical_category(category: str) -> str` from `app.services.analytics.scheme_universe` (already used by rankings). Produces: same response shape, merged labels.

- [ ] **Step 1: Write failing tests:** `test_two_spellings_of_one_category_become_one_bucket` (made-up funds "Equity Scheme - Flexi Cap Fund" 15.2 and "Equity Schemes - Flexi Cap Fund" 2.8: one bucket, value summed, 18.0%); `test_sectoral_and_thematic_become_one_bucket` (Q11 A); `test_buckets_still_sum_to_total_and_100_percent`; `test_unclassified_passes_through_unchanged`; `test_no_surviving_scheme_schemes_pair` (scan: for the alias map, no two outputs differ only by "Scheme"/"Schemes").
- [ ] **Step 2: Run** `cd backend && pytest tests/services/analytics/test_allocation.py -v`. Expected: first two FAIL.
- [ ] **Step 3: Implement** `by_category[canonical_category(category)] += value` and the import; `"Unclassified"` skips the call.
- [ ] **Step 4: Run** the file. Expected: PASS.

### Task C-4: One-time recompute at deploy (Claude, no code)

- [ ] **Step 1:** Record for the M1 deploy guide (written at M1, not now): after the deploy, run the recompute script for all households (`backend/scripts/run_analytics_recompute.py --all`, as the October guides show) so stored `analytics_sections` pick up merged names; verify with a two-fund household. Also build one synthetic statement with both spellings under `Docs/CAS Files/synthetic/` for the check (Q16 A and B); invented data only.

### Task C-5: `folio_number` in three payloads (17c backend)

**Files:** Modify `backend/app/services/dashboard/schemas.py` + `holdings.py:268`; `backend/app/services/fund_page/schemas.py` + `summary.py:182` (+ `folios.py` only if the shape needs it); `backend/app/services/analytics/schemas.py` + `investment_withdrawal.py`. Test: `backend/tests/services/dashboard/test_holdings.py`, `backend/tests/services/fund_page/test_summary.py`, `backend/tests/services/analytics/test_investment_withdrawal.py`.

**Interfaces:** Produces `FolioSlice.folio_number: str`, `FolioOut.folio_number: str`, ledger entry `folio_number: str | None`, all equal to the stored text; old masked fields unchanged.

- [ ] **Step 1: Write failing tests:** `test_family_row_has_full_folio_number_and_old_masked_field` (folio "10234567 / 0" gives `folio_number == "10234567 / 0"` and `folio_masked == "XXXX" + "/ 0"` exactly as today); same for fund page (`folio_masked == mask_folio(...)`) and ledger; `test_short_folio_and_slash_folio`; `test_member_only_route_still_omits_folios`; `test_folio_number_endpoint_ownership_check_unchanged`.
- [ ] **Step 2: Run** the three files. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the three additions, field name `folio_number` everywhere (the shared name later code and the search/PDF plans use).
- [ ] **Step 4: Run** the three files. Expected: PASS, old assertions untouched.

### Task C-6: Front-end contract for folios (17c)

**Files:** Create `frontend/src/lib/folioVisibility.ts`; modify the two `types.ts` (`mutual-funds/types.ts`, `individual-fund/types.ts`), fixtures `mfAsks.ts` and the fund page fixtures; Test `frontend/src/lib/folioVisibility.test.ts`, plus red tests listed for C-7.

**Interfaces:** Produces `maskFolio(folio: string): string` (keeps last four digits of the folio part and the sub-folio: `"10234567 / 0"` gives `"XXXX4567 / 0"`; a folio of four or fewer characters gives `"XXXX"` plus itself); `useFolioVisibility(): { hidden: boolean; toggle: () => void }` (module-level store shared by all components, saved in `localStorage` under one key, wrapped in try/catch, default shown).

- [ ] **Step 1: Write failing tests:** `maskFolio` cases (slash, short, letters, no sub-folio); `hidden state is shared by two components and survives remount`; `storage failure leaves the numbers shown`; and the red component tests for C-7: `FolioNumber shows the full number by default`; `eye button has label "Hide folio numbers" and aria-pressed`; `hides all instances at once`; `Copy is disabled while hidden with tip "Show the number to copy it"`; `Copy copies the shown number`; `HoldingsTable expanded rows show 10234567 / 0 (not XXXX / 0)`; `fund page folio rows and dialog`; `ledger row detail`; `OpeningBalanceModal has no private mask`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/folioVisibility.test.ts`. Expected: FAIL. Component tests stay red until C-7.
- [ ] **Step 3: Implement** `folioVisibility.ts` and the type additions (`folio_number`).
- [ ] **Step 4: Run** `folioVisibility.test.ts`. Expected: PASS. Commit red tests with a note of how many fail.

### Task C-7: `FolioNumber` component and the screens (Antigravity, lane G-a)

**Files:** Create `frontend/src/components/mf/FolioNumber.tsx`; modify `HoldingsTable.tsx` (single-member line and expanded rows), `InvestmentDetails.tsx`, `TileDialog.tsx`, `transactionsLogic.ts`, `Ledger.tsx`, `OpeningBalanceModal.tsx`. Tests: those from C-6 (fixed), plus `HoldingsTable.test.tsx`, `InvestmentDetails.test.tsx`, `StatBand.test.tsx`, `Ledger.asks.test.tsx`, `transactionsLogic.asks.test.ts`, `TransactionsPage.asks.test.tsx`, `OpeningBalanceModal.test.tsx`.

**Interfaces:** Consumes `useFolioVisibility`, `maskFolio`. Produces `FolioNumber({ value, showCopy? }: { value: string; showCopy?: boolean })`.

- [ ] **Step 1: Packet.** The orchestrator writes it at this point: workbook section 4 drawings (table, fund page rows, ledger, phone), the existing monospace style, wrapping rules, the eye icon states (open and slashed), focus ring, dark mode, and which screens show the eye (every number, Q4 A). The packet must also list the "Do not touch" files: any backend file, `mobile/**`.
- [ ] **Step 2: Build** one component used everywhere; screens read `folio_number` only, never `folio_masked`; the Copy button's accessible label becomes the number (hidden: dimmed with the tip).
- [ ] **Step 3: Run** the listed test files, then `npx tsc -b` and `npx oxlint src/features/mutual-funds src/features/individual-fund src/components/mf src/lib`. Expected: PASS.
- [ ] **Step 4:** Orchestrator screenshots at 1280x600, 1440x810, phone width, light and dark, shown and hidden; long number wraps.

### Task C-8: Phone check for folios (17c)

- [ ] **Step 1 (Claude):** Search `frontend/src/mobile/**` for reads of `folio_masked` or folio fields (not the word "portfolio"). List each. Because old fields stay, phone screens keep working; if a screen should show the full number, hand Codex a one-line change that reads `folio_number` (still no eye icon on phone unless the packet says so). Report to the user before changing any phone file.

### Task C-9: Member refresh and the view after an import (17d)

**Files:** Modify `frontend/src/shell/wrappers/ImportWrapper.tsx`, `frontend/src/features/import/useImportOrchestration.tsx` (and the prompt host `PromptHost.tsx` if that is where `member_not_in_file` is acknowledged); `ScopeProvider.tsx` / `resetRule.ts` only if the reset test fails. Test: `frontend/src/shell/scope/ScopeProvider.test.tsx`, new `frontend/src/shell/wrappers/ImportWrapper.test.tsx`.

**Interfaces:** Consumes `useScope()` (`refreshMembers(): Promise<...>`, `setMember(id)`, member list, scope mode). Produces: `onDone(notice, { landOnPersonId?: string })` from the import flow when the wrong-person prompt was acknowledged and exactly one person was imported.

- [ ] **Step 1: Write failing tests** (`ImportWrapper.test.tsx`): `waits for the members request before navigating`; `the new member appears in the drop-down without a remount`; `household grew: lands on Family Combined`; `no new member: stays on the viewed member`; `viewing Family Combined: stays`; `wrong-person import, new person: lands on that person`; `wrong-person import, existing person: lands on that person`; `family file with several people does not trigger the wrong-person rule`; `other_account left out: stays`; `failed refresh does not block navigation and stays`; `reset rule does not undo the landing`; `second import does not leave a stale list`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/shell/wrappers/ImportWrapper.test.tsx src/shell/scope/ScopeProvider.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the rule: before the import note the member count; on `onDone`, `await refreshMembers()` (catch and continue); if `landOnPersonId` set `setMember` to it, else if the list is longer switch to Family Combined, else leave scope alone; then navigate with the notice. Read `resetRule.ts` first; if leaving the import page triggers the reset for a household of two or more, apply the landing after the reset (the same "scope intent" idea Batch K needs; keep it small and tested, and tell the orchestrator because K builds on it).
- [ ] **Step 4: Run** both files plus `src/features/import` tests that touch `onDone`. Expected: PASS.

### Task C-10: Other member paths (17d)

- [ ] **Step 1 (Claude):** Read the onboarding family upload and `mobile/features/import/MobileImportView.tsx` paths (read-only). Report whether the drop-down and the phone dashboard pick up a new member. Fix only if broken, with a failing test first (Q14 A).

### Task C-11: Whole-batch review and M1 notes (Claude)

- [ ] **Step 1:** A fresh adversarial reviewer reads the batch diff against Review Focus. Findings are never applied automatically.
- [ ] **Step 2:** Merge `leapswitch-redesign` into `batch/c-hygiene`, rerun the affected tests (`test_allocation.py`, `test_holdings.py`, `test_summary.py`, `test_investment_withdrawal.py`, the frontend files named above), merge in.
- [ ] **Step 3:** Give the M1 deploy guide (written at M1): backend deploys with the old fields intact; the one-time recompute (C-4); expected label changes list (workbook section 2 table); batch checklist from workbook section 9.

## Self-Review notes

- Spec coverage: 17a (C-3, C-4), 17b (C-2), 17c (C-5 to C-8), 17d (C-9, C-10); answered questions Q2 to Q16 map as in the workbook; the 17 Nov updates (eye icon, old fields kept, Q12/Q13) are in Global Constraints and C-6, C-7, C-9.
- Open fact for the wave-start check: the workbook says the 17d "wrong-person" hook is not fully read; C-9 Step 3 names the files to confirm.
- Packets and handoffs: not written here, by instruction.
