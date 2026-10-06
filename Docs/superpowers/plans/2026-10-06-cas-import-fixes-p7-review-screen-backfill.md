# CAS Import Fixes — Phase 7: The Gate, Removing the Review Screen, Backfill, Docs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** Once the parser is proven fixed, the import becomes upload → "N members detected" popup → Continue → dashboard (with an "N transactions added" notice), with a tiny fallback dialog only when a held fund can't be identified; existing data is brought up to the new rules; every doc that describes the import is updated.

**Architecture:** The backend adds `needs_review` to the preview (true only when a fund with units is still `ask` after phase 5). The frontend extracts the confirm-request builder out of `MemberRibbonReview` into a pure `buildConfirmBody`, so `useImportFlow` can confirm straight after the popup. The review stage, `ReviewTable` and `ImportConfirmed` leave the normal path; errors, expiry and 409 prompts that lived on the review stage move to the popup/fallback stage. Staging is reset with the existing `scripts/clean-staging-db.sh` (decided default; no production users yet), plus a plan-reclassification script for any data that is kept.

**Tech Stack:** FastAPI, React 19 + TypeScript + Vitest, bash.

**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` "After the fix" ("Removing the review screen"), the order-of-work phases 7–8, and the 6 Oct decisions: *implement, test with synthetic files, remove the review screen only when we are sure the parser is fixed, just before staging; update PRD-01 then* and *phase 7 gate = Import health all ✓ on every synthetic file and upload order and on 1–2 real KFintech statements*. Master index Global Constraints apply.

## Global Constraints

See the master index. Additionally:
- **Task 1 (the gate) must pass before any other task in this phase starts.** If it doesn't, stop and go back to the failing phase.
- **Consequence to record in PRD-01 (Task 5):** the review screen's "Move to…" for funds matched by name (spec M4/F16) disappears; such funds land on the person they were matched to, as the server already defaults. The people popup keeps name entry (U9) and the U8 "leave it" choice.
- PRD-01 FR-5/FR-10 conflict (flagged in the artifact): resolved by Task 5's PRD edit, not silently.

## Review Focus

1. **A family statement where one person needs a name.** The popup still asks for it; Continue confirms everyone in one go. Test: `confirms straight after the people popup` (Task 3).
2. **A single-person statement where the popup is skipped (I1).** Confirm runs automatically after parsing; the user lands on the dashboard. Test: `auto-confirms a single-person statement` (Task 3).
3. **One held fund still unidentified (`needs_review`).** Only that fund is asked about, with candidates and a "Not listed" option; nothing else is shown. Test: `fallback dialog lists only unidentified funds` (Task 3).
4. **Confirm fails (network) after Continue.** The retry dialog appears over the popup, and retry works without re-uploading. Test: `retry after a failed confirm` (Task 3).
5. **The session expired while the popup was open (60 min).** Upload screen with "Your upload timed out. Please upload again." Test: `expired session returns to upload with banner` (Task 3).

---

### Task 1: The gate (no code)

- [ ] **Step 1: Synthetic suite, every file and order.** Run the full loop from phase 1 Task 10, plus these orders: `p20_FY,p20_20yr`, `p20_20yr,p20_FY`, `p20_10yr,p20_3yr,p20_20yr`, `p10_FY,p10_10yr`, `kfin_pk_1yr,kfin_pk_10yr`, `p20_FY,p20_FY_altfolio`, delete-first and delete-last variants of the first two. Required: every folio `match` on the reconciliation, dashboard value = CAS value (₹1 per fund tolerance), zero `pending`/`ask` schemes, history has no gaps except flagged partial months.
- [ ] **Step 2: Real files on staging.** Deploy phases 1–6 to staging (review screen still present). Upload, one at a time: the real `Docs/CAS Files` statements (10-year, FY, last 2 years, the two CP… files, family_cas_1/2) and **1–2 real KFintech statements from the user (ideally the stakeholders' own files)** — ask the user for them now if not yet provided. For each, open Profile → Import health: every row must be ✓ and the NAV check must pass.
- [ ] **Step 3: Record** all results in `Docs/orchestration/2026-10-06-cas-import-baseline.md` under "Phase 7 gate". If anything is not ✓, stop: find the cause, fix it in the owning phase, re-run Steps 1–2.
- [ ] **Step 4: Ask the user to confirm the gate passed** before Task 2 (this removes a PRD-mandated screen).

---

### Task 2: Backend — `needs_review`

**Files:**
- Modify: `backend/app/services/import_/schemas.py` (`ImportPreviewResponse.needs_review: bool = False`, `SchemeMatchPreview.candidates: list[SchemeCandidate] = []` where `SchemeCandidate(amfi_code: str, name: str)`), `backend/app/services/import_/service.py` (`build_import_preview`, `_preview_response`)
- Test: `backend/tests/services/import_/test_service.py`

Rule: `needs_review = any(identification == "ask" and close_units not in (None, 0))`; `candidates` copied from `Identification.candidates`.

- [ ] **Step 1: Write the failing test:**

```python
async def test_needs_review_only_for_unidentified_held_funds(db_session):
    result = family_result([{"name": "ADITI SHARMA", "pan": "ABCDE1234K", "funds": 2}])
    result.schemes[1].isin, result.schemes[1].close_units = "INF999X01ZZ9", Decimal("5")   # unknown, still held
    seed_master_scheme(db_session)                                                           # INF123 known
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
        preview = await build_import_preview(result, "cas.pdf", b"%PDF", db=db_session)
    assert preview.needs_review is True
    assert [s.identification for s in preview.schemes] == ["verified", "ask"]
```

- [ ] **Step 2–4:** implement; run `test_service.py`.

---

### Task 3: Frontend — confirm straight after the popup

**Files:**
- Create: `frontend/src/features/import/confirmBody.ts` (+ `confirmBody.test.ts`), `frontend/src/features/import/UnidentifiedFundsDialog.tsx` (+ test)
- Modify: `features/import/MemberRibbonReview.tsx:105-132` (use `buildConfirmBody`), `features/import/useImportFlow.ts` (stages), `features/import/ImportFlow.tsx`, `features/import/useImportOrchestration.tsx:132` (retry dialog over the popup), `features/import/ReviewExpiryBanner.tsx` (shown on the upload screen after a 410), `features/import/PeopleFoundDialog.tsx` (Continue triggers confirm), `features/auth/SoloCasUpload.tsx`, `features/dashboard/MainDashboardFlow.tsx` (both land on the dashboard with a notice), mobile `MobileImportView.tsx`, `MobileReviewView.tsx` (removed from the path)
- Test: `useImportFlow.test.ts`, `ImportFlow.test.tsx`, `PeopleFoundDialog.test.tsx`, `SoloCasUpload.test.tsx`, `MobileImportView.test.tsx`

**Interfaces:**
- `buildConfirmBody(preview, { names, nameAnswers, moved }) -> { people: PersonConfirmation[]; movedFunds: Record<string, string> }` — the exact logic of `handleConfirmImports` today (U8 explicit exclude, unassigned owner always sent), with `moved` empty in the new flow.
- `ImportFlowStage` becomes `"upload" | "parsing" | "prompt" | "notices" | "people" | "fallback" | "confirming" | "error"`; `"review"` and `"confirmed"` are removed. After the popup's Continue (or immediately when the popup is skipped): `preview.needs_review ? "fallback" : confirm()`. On success the hook calls `onDone({ added, skipped, warnings })`.
- Dashboard notice copy: "{added} transactions added" (+ "· {skipped} already saved" when > 0); warnings listed under "Show details".
- `UnidentifiedFundsDialog`: one row per `schemes` with `identification === "ask"`: fund name, folio, units, a select of `candidates` plus "Not listed — import as closed fund" (sends no override; phase 5 imports it as closed only if units are 0, so for held funds the select requires a candidate). Continue → `confirm()` with those `scheme_confirmations`.

- [ ] **Step 1: Write the failing tests:**

```ts
// confirmBody.test.ts
it("matches what MemberRibbonReview sent for a family with one unassigned fund", () => {
  const preview = familyPreview({ unassigned: ["t9"], people: ["p1", "p2"], meKey: "p1" });
  const { people, movedFunds } = buildConfirmBody(preview, { names: {}, nameAnswers: {}, moved: {} });
  expect(people.map((p) => p.person_key)).toEqual(["p1", "p2"]);
  expect(movedFunds).toEqual({ t9: "p1" });
});
```

```tsx
// ImportFlow.test.tsx
it("auto-confirms a single-person statement", async () => {
  mockParse(singlePersonPreview({ needs_review: false }));
  const confirm = mockConfirm({ added: 12, skipped: 0, warnings: [] });
  const onDone = vi.fn();
  renderImportFlow({ onDone });
  await uploadFile();
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ added: 12 }));
  expect(screen.queryByText("Confirm imports")).not.toBeInTheDocument();
});

it("confirms straight after the people popup", async () => {
  mockParse(familyPreview({ people: ["p1", "p2"], needsName: ["p2"] }));
  const confirm = mockConfirm({ added: 30, skipped: 0, warnings: [] });
  renderImportFlow();
  await uploadFile();
  fireEvent.change(await screen.findByLabelText(/name/i), { target: { value: "Meera Sharma" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(
    expect.any(String), expect.arrayContaining([expect.objectContaining({ person_key: "p2", name: "Meera Sharma" })]), {}));
});

it("fallback dialog lists only unidentified funds", async () => {
  mockParse(singlePersonPreview({ needs_review: true, askFunds: [{ temp_id: "t2", name: "Mystery Fund",
    candidates: [{ amfi_code: "1", name: "Mystery Fund - Direct" }] }] }));
  renderImportFlow();
  await uploadFile();
  expect(await screen.findByText("Mystery Fund")).toBeInTheDocument();
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
});

it("retry after a failed confirm", async () => {
  mockParse(singlePersonPreview({ needs_review: false }));
  const confirm = mockConfirm({ added: 3, skipped: 0, warnings: [] });
  confirm.mockReset()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce({ added: 3, skipped: 0, warnings: [], import_id: "i1", people: [] });
  const onDone = vi.fn();
  renderImportFlow({ onDone });
  await uploadFile();
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ added: 3 })));
  expect(confirm).toHaveBeenCalledTimes(2);
});

it("expired session returns to upload with banner", async () => {
  mockParse(singlePersonPreview({ needs_review: false }));
  const confirm = mockConfirm({ added: 0, skipped: 0, warnings: [] });
  confirm.mockReset().mockRejectedValueOnce(new ApiError(410, { code: "session_expired", message: "This review has expired" }));
  renderImportFlow();
  await uploadFile();
  expect(await screen.findByText("Your upload timed out. Please upload again.")).toBeInTheDocument();
  expect(screen.getByLabelText(/choose file|upload/i)).toBeInTheDocument();
});
```

(`mockParse`, `mockConfirm`, `renderImportFlow`, `uploadFile`, `singlePersonPreview`, `familyPreview`: put these in `features/import/testUtils.ts`; reuse whatever the existing ImportFlow tests already define for parsing and confirming.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Delete the `review` and `confirmed` stage branches from `ImportFlow.tsx` and `MobileImportView.tsx`. Leave `ReviewTable.tsx`/`MemberRibbonReview.tsx`/`ImportConfirmed.tsx` files in place for one release only if a test or route still imports them; otherwise delete them and their tests (grep first).
- [ ] **Step 4: Run, expect PASS** — every file in **Files** plus `grep -rl "ReviewTable\|MemberRibbonReview\|ImportConfirmed\|\"review\"" frontend/src` results; `npx tsc -b`.

---

### Task 4: Bring existing data up to the new rules

**Files:**
- Create: `backend/scripts/reclassify_folio_plans.py` (+ `backend/tests/scripts/test_reclassify_folio_plans.py`)

Default (decided in the artifact, phase 8 "or wipe staging"): staging has no real users, so **reset staging with the existing `scripts/clean-staging-db.sh`** (wipes user-domain data only; reference tables, including the new scheme master, stay) and re-upload test data. Ask the user to confirm the wipe before running it — it deletes every staging account's imports.

For any environment whose data must be kept, the reclassify script:
- For every folio: run phase 5's `identify_scheme` against the folio's scheme (using the scheme's ISIN and the latest import's CAS NAV from `raw_parser_output`), set `plan_type` and `plan_verified`; never write `unclassified`.
- Invalidate every member's snapshots and holdings cache.
- Prints counts; `--dry-run` prints without writing.
- Opening balances / twin rows / row types for kept data are fixed by re-uploading the user's statements (the matcher heals NULL balances and the opening rule fills gaps); the script prints, per member, "re-upload recommended" when the phase 1 reconciliation shows any non-✓ folio.

- [ ] **Step 1: Write the failing test:** a folio with `plan_type=unclassified` whose scheme is a master Direct row → after the script, `plan_type=direct`, `plan_verified=True`; `--dry-run` changes nothing.
- [ ] **Step 2–4:** implement; run the test.

---

### Task 5: Documentation

**Files:**
- Modify: `Docs/PRDs/PRD-01*.md` (FR-5 plan classification now from AMFI data, ARN never decides; FR-10 review screen replaced by auto-confirm + fallback dialog; the M4 "Move to…" consequence), `Docs/App-Flow-Unifolio.md` (import flow), `Docs/Database-Schema-Unifolio.md` (migrations 0025–0029: `transactions.origin/cost_source/balance_units/occurrence`, new type values, `folios.folio_key/plan_verified`, `transaction_imports`, `schemes` master columns and nullable `amfi_code`, `portfolio_snapshots` columns, `imports.preview_state` + `previewing`), `database.md`, `backend.md`, `decisions.md` (append: gate passed on {date}, review screen removed, PRD-01 updated), `log.md` (append the narrative), `session.md` (overwrite current status), `CLAUDE.md` Session State pointer (one line; resolve the "10-year CAS discrepancy" still-open item), `DEFERRED_FEATURES.md` (no change unless something moved), `Docs/superpowers/specs/2026-08-18-active-sips-cadence-redesign-design.md` (already superseded in phase 6 — check)
- No tests.

- [ ] **Step 1:** Make each edit. Keep each doc's own conventions (append-only `log.md`/`decisions.md`; `session.md` overwritten).
- [ ] **Step 2:** Ask the user to review the PRD-01 diff specifically (it changes a product requirement).

---

### Task 6: Stage

- [ ] **Step 1:** With the user's go-ahead, deploy to staging (follow the latest deploy guide in `Docs/orchestration/`; migrations 0025–0029 run on deploy).
- [ ] **Step 2:** Run `scripts/jobs/refresh_scheme_master_daily.py` once as a one-off ECS task (the schedule only fires next morning), then confirm the EventBridge schedule `scheme-master-daily` is `ENABLED` (`aws scheduler list-schedules`).
- [ ] **Step 3:** Upload one synthetic file and one real file through the new flow end to end: upload → popup → Continue → dashboard notice; Import health all ✓.
- [ ] **Step 4:** Report to the user with the baseline doc link.
