# Handoff: review-screen-removal
**Status:** DONE — Task 3 built, verified, reviewed; finding fixed and re-review CLOSED. Task 5 docs done (PRD-01 diff awaiting the user). Task 6 (staging) with the orchestrator.
**Parent plan:** `Docs/superpowers/plans/2026-10-06-cas-import-fixes-p7-review-screen-backfill.md`, **Task 3 only** (binding, with the rulings below taking precedence where they differ)
**Orchestrator:** Claude Code (rulings, WSL verification, review, docs = Task 5, staging = Task 6) · **Worker:** Codex (builds Run 1, self-reviews, prints the report)
**Review baseline:** HEAD at the time the user pastes the prompt (run `git log -1 --format=%h` and put it in the report)

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming **Run 1**.
2. Codex reads this file and the plan's Task 3, then implements it test-first.
3. Codex self-reviews (section "Self-review"), fixes what it can, and ends by printing the **CODEX REPORT** (template at the bottom) in one fenced code block.
4. The user pastes the report back to Claude Code, which re-runs the tests in WSL, reviews the diff and either closes the run or writes a fix-round prompt.

## Where things stand — 2026-10-08

- **The Phase 7 gate passed** (user, 8 Oct): synthetic suite plus real CAMS and KFintech statements on staging, Import health all ✓. Recorded in `Docs/orchestration/2026-10-06-cas-import-baseline.md`.
- **Task 2 is already built** (verify, don't rebuild): `ImportPreviewResponse.needs_review` (`backend/app/services/import_/service.py`, around line 334) and `SchemeMatchPreview.candidates` (`schemas.py`, `SchemeCandidate`). Frontend `types.ts` has `needs_review?` and `candidates?`.
- **Prepared pieces already in the tree, unused** (built 6 Oct, then the removal was rolled back until after staging): `frontend/src/features/import/confirmBody.ts` (+ `confirmBody.test.ts`) and `UnidentifiedFundsDialog.tsx` (+ test). Use them. Their signatures are the binding ones, not the plan's older sketch:
  - `buildConfirmBody(preview, people, { names, owners, nameAnswers, schemeConfirmations })` → `{ people, movedFunds }`. `people` is the shown people, i.e. `includedPeople(preview.people, edits)` from `useImportOrchestration.tsx`; `names`/`owners` come from the popup's `PeopleEdits`.
  - `UnidentifiedFundsDialog({ schemes, onContinue(confirmations), onCancel })`.
- Task 4 (`backend/scripts/reclassify_folio_plans.py`) exists; staging will be wiped instead. Not in this run.

## Task — Run 1 = plan Task 3

The import becomes: upload → (prompts / notices) → people popup, or skipped for one named person (I1) → **confirm straight away** → dashboard with a notice. A held fund that couldn't be identified (`preview.needs_review`) gets the small `UnidentifiedFundsDialog` first, listing only those funds. The review screen (`MemberRibbonReview`/`ReviewTable`), the "Import complete" screen (`ImportConfirmed`) and mobile `MobileReviewView` leave the path.

### Rulings (take precedence over the plan text)

1. **Stages:** `ImportFlowStage` = `"upload" | "parsing" | "prompt" | "notices" | "people" | "fallback" | "confirming" | "error"`. Remove `"review"` and `"confirmed"`.
2. **Where the flow goes after the people step** (popup Continue, or straight from parse/notices when the popup is skipped under the existing I1 rule in `stageAfterNotices`): `preview.needs_review ? "fallback" : confirm(...)`. The confirm body is `buildConfirmBody(preview, includedPeople(preview.people, edits), { names: edits.names, owners: edits.owners, nameAnswers })`. When the popup was skipped, `edits` is `NO_EDITS`. The fallback dialog's Continue confirms with the same body plus `schemeConfirmations`.
   - Keep the hook (`useImportFlow`) free of UI: it may expose a `proceed`/`confirm` that the orchestration calls; how you split it is your call, but the auto-confirm must happen exactly once per session (the existing `confirmingRef`/`confirmedRef` guards stay).
3. **While confirming:** stage `"confirming"` shows the same waiting view as `"parsing"` (`ParsingIndicator`). No new copy needed.
4. **Success:** clear the CAS-resume state (`clearCasResumeStep2`, today done on stage `"confirmed"`), then call `onDone` (web) / `onNavigateDashboard` (mobile) with a notice:
   - `text`: `"{added} transactions added"` (`"1 transaction added"` when 1), plus `" · {skipped} already saved"` when `skipped > 0`.
   - `details`: for a family statement (`result.people.length > 1`) one line per person `"{name}: {added} added"` (+ `", {skipped} already saved"` when > 0), then every `result.warnings` entry. Omit `details` when empty.
   - The dashboard already renders `{ text, details }` notices (`MainDashboardFlow.tsx` `importNotice`); reuse that. Don't build a new notice component.
5. **Onboarding (`SoloCasUpload.tsx`):** its `onDone` sets `onboarding_completed` and the app moves to the dashboard. That is enough; don't thread the notice through onboarding. Record it under Deviations if you change anything there.
6. **Already imported** (`already_imported` code): today it sets stage `"confirmed"` and an effect calls `onDone({ text: "This statement was already imported" })`. Keep the same user-visible result (`onDone`/`onNavigateDashboard` with that text) without the `"confirmed"` stage.
7. **Confirm failure** (5xx, network, or 422 `confirm_invalid`): stay on stage `"confirming"` with the error set, and open `ConfirmFailedDialog` over the waiting view (today it opens on `"review"`). "Try again" re-sends `lastConfirm`; "Cancel import" opens `CancelImportDialog`; "Upload again" (the `confirm_invalid` case) cancels. 409 prompts and `already_imported` still go through `handleFailure` as today. Test `retry after a failed confirm` must pass.
8. **Expired session (410):** unchanged behaviour — back to upload with "Your upload timed out. Please upload again." (already in `handleFailure`).
9. **Cancel from the fallback dialog** opens `CancelImportDialog` (as the popup's × does today).
10. **`ReviewExpiryBanner`** shows during `"people"` and `"fallback"` (it showed during `"people"`/`"review"`).
11. **Delete** `ReviewTable.tsx` (+ `.module.css`, test), `MemberRibbonReview.tsx` (+ test), `ImportConfirmed.tsx` (+ `.module.css`, test), `mobile/features/import/MobileReviewView.tsx` (+ test if any) **only after** `git grep` shows nothing else imports them. Anything still imported elsewhere: keep it and list it in the report. Delete with the shell, not git.
12. **Mobile** (`MobileImportView.tsx`): same stages and behaviour as web through `useImportOrchestration`; remove the review and confirmed branches.
13. **The "Move to…" choice disappears** (funds stay with the person they were matched to). Not your doc change: the orchestrator updates PRD-01 in Task 5. Don't edit any doc.

### Tests

The plan's five tests (`auto-confirms a single-person statement`, `confirms straight after the people popup`, `fallback dialog lists only unidentified funds`, `retry after a failed confirm`, `expired session returns to upload with banner`) in `ImportFlow.test.tsx`, adapting the helpers to what `ImportFlow.test.tsx`/`testFixtures.ts` already have (add shared helpers to `testFixtures.ts`, not a new `testUtils.ts`, unless that file can't hold them). Plus:
- `useImportFlow.test.ts`: no test references `"review"`/`"confirmed"`; add one that the auto-confirm fires once (no double confirm on re-render).
- One test for the success notice text and details (family with a warning).
- `MobileImportView.test.tsx`, `PeopleFoundDialog.test.tsx`, `SoloCasUpload.test.tsx`, `MainDashboardFlow.test.tsx`: update whatever depended on the review/confirmed screens.

Run (from `frontend\`): `npx vitest run <each touched test file>` and `npx tsc -b`. Before the final run, `git grep -l "ReviewTable\|MemberRibbonReview\|ImportConfirmed\|MobileReviewView\|\"review\"\|\"confirmed\"" frontend/src` and add every matching test file. **Never run the full suite.**

---

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Never `commit`, `add`, `rm`, `mv`, `reset`, `checkout`, `stash`, `restore`, `rebase`, `merge`, `push`. The user commits.

**Never touch:** `backend/` (Task 2 is done; flag anything missing instead), real CAS PDFs anywhere, `infra/`, `backend/.env`, and the orchestrator's files: `Docs/**`, `DEFERRED_FEATURES.md`, `decisions.md`, `log.md`, `session.md`, `CLAUDE.md`, `AGENTS.md`, `backend.md`, `database.md`.

**Follow the plan and rulings literally.** If the code contradicts them in *mechanics*, adapt minimally and record under "Deviations". If it changes *behaviour or an interface*, stop that part, record it under "Open questions", and continue with what doesn't depend on it.

**Test-first.** Write the test → see it fail for the right reason → implement → green.

**Project rules** (`AGENTS.md`): user-facing copy uses the curly apostrophe (’); LF line endings, UTF-8; no new dependencies; reuse existing components and tokens.

## Approaches considered and rejected (don't re-litigate)

- **Keeping a slimmed review screen** — rejected by the 6 Oct decision: the gate proved the parser; only unidentified held funds are asked about.
- **A new "Import complete" page after confirm** — rejected: the plan sends the user to the dashboard with a notice.
- **Rebuilding `buildConfirmBody` or the fallback dialog** — they exist, were tested on 6 Oct and mirror `MemberRibbonReview`'s confirm rules exactly. Use them.

## Open questions (Codex: flag back, don't guess)

- Any caller of `ImportFlow` other than `SoloCasUpload` and `MainDashboardFlow` that relied on the "Import complete" screen.
- If `buildConfirmBody`'s output differs from what `MemberRibbonReview.handleConfirmImports` would send for any existing `MemberRibbonReview.test.tsx` case, list the case before deleting that test.

---

## Self-review (before printing the report)

1. `git diff --stat` and `git status --porcelain`: every changed, new or deleted file belongs to Task 3. Undo anything else.
2. `git diff --cached --stat` is empty.
3. Review the diff as a hostile reviewer (run Codex `/review` on the uncommitted changes if available). Check: each Review Focus item in the plan has its test; no double confirm; no path where a confirm error leaves the user stuck without a dialog; the 409 prompt and 410 paths still work from every stage; mobile and web behave the same; no dead imports; `tsc -b` clean.
4. Fix what you find, re-run the affected tests, list every finding in the report.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — review-screen-removal — Run 1
Run date/time: <…>    Environment: Windows    Node: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task 3: DONE | PARTIAL | BLOCKED — <one line>

2. FILES
   Changed (tracked):   <git diff --stat summary>
   New (untracked):     <from git status --porcelain>
   Deleted:             <list>
   Kept although planned for deletion (still imported by): <list or none>
   Staged (must be empty): <git diff --cached --stat>

3. TESTS (exact command + last 3 lines of output)
   RED:   <command> → <failed as expected because …>
   GREEN: <command> → <N passed …>
   Extra files added via grep: <files>
   tsc -b: <result>

4. DEVIATIONS FROM THE PLAN/RULINGS (mechanics only)
   - <ruling/step> — said <…>; code needed <…>; file:line — why

5. OPEN QUESTIONS / BLOCKERS
   - <question> — what I'd need decided

6. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — <finding> — FIXED | NOT FIXED (why)

7. ANYTHING ELSE CLAUDE SHOULD KNOW

8. CONFIRMATIONS
   - No git write commands used: YES/NO
   - Full suites not run: YES/NO
   - backend/ and Docs/ untouched: YES/NO
   - No real CAS file opened: YES/NO
```

---

## Run 1 result (8 Oct, orchestrator)

- **Codex report:** Task 3 built; 9 frontend files changed, ReviewTable / MemberRibbonReview / ImportConfirmed / MobileReviewView deleted, nothing left importing them; backend and Docs untouched. Codex's own self-review fixed a High (a fallback-dialog confirm could be replaced by an auto-confirm body without the fund choices).
- **Open question ruled:** no units in `UnidentifiedFundsDialog` (not in the preview contract; name + folio identify the fund). Task 3 counts as complete without it.
- **WSL verification:** 9 affected test files, 132 tests pass; `tsc -b` clean; all changed files LF.
- **Independent review (Opus):** no defects in the confirm logic, backend acceptance (every `ask` fund is covered by `needs_review`; `unclassified` can no longer occur), stuck states, or web/mobile parity. **One Important finding:** in onboarding, a failed `updateMe({ onboarding_completed })` after a successful import left the user on the spinner (the "Get my first score" button that used to allow a retry is gone). **Fixed by the orchestrator** (review-loop fix authorship: one small file): `SoloCasUpload.handleDone` catches and shows "Your statement is saved, but we couldn’t finish setting up your account." with Try again; test `SoloCasUpload.finish.test.tsx` failed first, then passes. Also removed the now-dead `ctaLabel` prop. Below the bar, not fixed: the fallback dialog also lists funds of an other-account person the user left out (their answers are dropped).
- **Scoped re-review: CLOSED.** Polish applied: the retry message stays up while the retry is in flight (no flash of the upload form).
