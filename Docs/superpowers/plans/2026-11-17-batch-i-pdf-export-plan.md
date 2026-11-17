# Batch I: PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** In wave 5 (milestone M4), ship one "Export PDF" button in the top bar and a dialog (who: family or one member; what: Full report, This tab, Custom), producing a branded A4 report (cover, contents, running header and footer, every chosen section, notes page) from a repaired, multi-worker-safe server pipeline.

**Architecture:** Keep the server-side headless Chromium approach (Q1 A, with the browser's print page as a fallback only after a failed export). Replace the in-process one-time token with a short-lived, read-only export pass (signed token, one scope, a few minutes, bound to our renderer) so any worker can serve both steps; the print page loads the real sections through the normal routes with that pass. One browser started on demand, at most two exports at once. Sections are the screens' own components in a print mode, with print variants only where a card needs one; the section list drives the dialog, the contents and the order.

**Tech Stack:** FastAPI, Playwright (already in the image), pytest; React, TypeScript, Vitest, bundled DM Sans and Manrope fonts.

**Spec:** `Docs/orchestration/2026-11-13-batch-i-planning-workbook.html` (Q1 A with B behind it, Q2, Q3 A: folios printed in full as on screen, tied to the eye icon; 17 Nov: the button is in the top bar; sections 2 to 5; the sample report folder `2026-11-13-batch-i-sample-report/`). Program rules: `2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets and handoffs are not written here.** The orchestrator writes the Antigravity packets (cover, contents, running header/footer, last page, export dialog and button look) and each Codex handoff in detail when the task starts, from the workbook drawings and the sample PDF.
- **Waits for (program section 4):** E, F, K merged; A's fixes (the PDF prints the same XIRR, ranks, averages and the disclaimer lines); D (static print version of the graph, the legend and colours); C's folio rule (the eye icon's setting); K has put search in the top bar so the button is added after K (shared file `shell/layout/TopBar.tsx`: K first, then I).
- **Conflict flagged, not resolved silently:** the workbook's defaults table still says the button appears "in the shared slot" on the Mutual Funds tabs; section 3 and the 17 Nov decision put it in the **top bar** on every page, between Ask Mira and the family selector. This plan follows the 17 Nov top-bar decision. The button state on non-Mutual-Funds pages starts on Full report and does not offer "This tab".
- **Wave-start check:** confirm `backend/app/services/analytics/pdf_export.py` (`store_export_payload`, `consume_export_payload`, `start_browser`, `stop_browser`, `get_shared_browser`, `render_analytics_pdf`, a module-level dict as the token store), `backend/app/api/analytics.py` (`POST /analytics/export/pdf` at line ~115), `backend/app/main.py` (starts a browser at start-up), `backend/tests/api/test_analytics_export_route.py`, the print route in `frontend/src/main.tsx` and `features/analytics/print/PrintAnalyticsView`, `deploy/leapswitch/docker-compose.yml` (3 uvicorn workers, `--workers 3`), `FRONTEND_BASE_URL` in `backend/app/config.py` and on the staging server (must be `ls-redesign.unifolio.in`), `Logo/` files, `self_name` on the account. **Task I-2 (read-only measurement on staging) comes first** and its result decides how much of F3 is real.
- **Branch:** `batch/i-export` from `leapswitch-redesign` at wave 5 start. Ships in M4, then production.
- **Builders:** Codex = pipeline, export pass, on-demand browser, print route and mode, print variants, dialog logic, all tests, one task at a time. Antigravity = cover and contents template, header and footer, the dialog and button look; lanes G-a (print template) and G-b (dialog and button) with disjoint files. Claude = measurements, the security brief, page-by-page PDF checks, orchestration.

## Global Constraints

- Backend additive only; the old staging link shares the backend: the existing `POST /analytics/export/pdf` keeps working for the old screen (new routes are added beside it; the old route is not removed).
- Export pass: issued only to a signed-in user for scopes they own; valid for one export and a few minutes (a constant `EXPORT_PASS_TTL_SECONDS = 300`); read-only (cannot change anything); tied to one scope and one renderer; revoked as soon as the export ends; nothing held in one process's memory; a **security review before it ships** (I-4). A signed token, not a table: no migration (if the review prefers a stored pass, flag it first; it would be the first migration here).
- PAN never printed in any form. Folio numbers printed in full as on screen (Q3 A); the dialog's "Show folio numbers" option starts from the eye icon's setting (shown by default; if the user has hidden folios on screen the option starts off and the PDF carries the masked form). Names appear; the file name carries no name, PAN or folio (`Unifolio-portfolio-report-YYYY-MM-DD.pdf`). The file is not kept on the server.
- Cover: Unifolio logo and green band; "Mutual Fund Portfolio Report"; "Prepared for" the account holder's name and "and family" (from `self_name`) or the member's name; if the name is missing, "Your family" or the line omitted, never guessed; scope; date generated; data dates in E's wording; a confidentiality line; no PAN, folio or contact details. A4 portrait, always light, DM Sans and Manrope **bundled** (no Google at render time), the brand green.
- Limits: one browser started on demand and closed after a quiet period; **at most two exports at once** (the rest wait); a short per-user cooldown; one export at a time per user; failures logged without content; a failed export cleans up its page.
- Logs and analytics: only that an export happened, its size and duration, never content. No GA4 events (paused).
- The PDF carries the same numbers and wording as the screens (same routes, same components); the app version is printed; each section's data dates sit in its footer (E's module).
- Fonts, colours and layouts follow the sample report; where it differs from a real component, the real component in print mode wins.
- Phone out of scope. No new dependency (Playwright is already in the image).

## Review Focus

- The two steps (create and render) running in separate worker processes: the pass is not process memory.
- A pass used for a different scope, after expiry, twice, or on a write route: rejected.
- A forged scope or member id belonging to another account: rejected.
- Five exports in a row succeed; two at once both finish; a third waits; a cancelled export leaves no browser page running.
- A 40-lakh household: time and memory within the limits measured in I-10; size limit with an offer to export fewer sections.
- PDF text scan finds no PAN pattern, and folios only in the form the setting allows.
- The renderer opens the wrong front end (`FRONTEND_BASE_URL` still pointing at the old link): the deploy check and the app version on the cover catch it.
- A section empty or failed for this household: the report notes it in place; the dialog warns first.
- Fonts embedded in the PDF (a test checks).
- The fallback print page works without the server's browser and says in one line what differs.

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/export/pass_token.py` (new) | `issue_export_pass`, `verify_export_pass` (signed, scoped, short-lived). |
| `backend/app/services/export/browser_pool.py` (new) | On-demand browser, idle close, two-at-once limit, per-user cooldown. |
| `backend/app/services/export/render.py` (new) | `render_report_pdf(pass_token: str, options: ExportOptions) -> bytes`. |
| `backend/app/api/export.py` (new) + one `include_router` line in `main.py` | `POST /export/report`, status and download; reads the section list names it is given. |
| `backend/app/services/analytics/pdf_export.py`, `backend/app/main.py` | Start-up browser removed for the new path; the old route keeps working. |
| `backend/app/api/deps` auth layer | Accept the export pass on read routes only. |
| `frontend/src/print/` (new) | Print route, `PrintReport`, print mode wrapper, `printSections.ts` (variants), bundled fonts, cover, contents, header, footer, notes page. |
| `frontend/src/features/export/` (new) | `ExportButton.tsx`, `ExportDialog.tsx`, `useExportJob.ts`. |
| `frontend/src/shell/layout/TopBar.tsx` | Mounts `ExportButton` (after K). |
| `frontend/src/main.tsx` | The print route (new path beside the old one). |

## Task list

| Task | What | Builder | Size | Order |
|---|---|---|---|---|
| I-1 | Wave-start check; handoffs and packets | Claude | M | first |
| I-2 | Read-only measurement of the old pipeline on staging; check `FRONTEND_BASE_URL`, Chromium memory | Claude, manager | S | first |
| I-3 | On-demand browser and limits | Codex | M | after I-2 |
| I-4 | Export pass, tests, security review | Codex, Claude | L | after I-2 |
| I-5 | Render service and export routes | Codex | M | after I-3, I-4 |
| I-6 | Print route, print mode, bundled fonts | Codex | M | after I-4 |
| I-7 | Section print audit (from F's list) and print variants | Claude, then Codex | L | after F merged |
| I-8 | Red tests for cover, contents, header, footer, notes | Codex | S | after I-6 |
| I-9 | Cover, contents, running header and footer, notes page look | Antigravity (G-a) | M | after I-8 |
| I-10 | Red tests for button and dialog | Codex | M | after K merged |
| I-11 | Button and dialog look | Antigravity (G-b) | M | after I-10 |
| I-12 | Progress, cancel, download, errors, file name; the fallback print page | Codex | M | after I-5 |
| I-13 | Render time and memory for 5 and 40 lakh; background-job decision | Codex, Claude | M | after I-6 |
| I-14 | Static print version of the graph (with D) | Codex | S | after D |
| I-15 | PDFs checked page by page for three households | Claude | M | after I-9, I-14 |
| I-16 | Whole-batch review, security review result, M4 notes | Claude | M | last |

---

### Task I-2: Measure the old pipeline (Claude with the manager)

- [ ] **Step 1:** A small read-only script in the style of Batch D's diagnosis kit (`backend/scripts/diagnose_export_pipeline.py`, new): does `POST /analytics/export/pdf` work on staging, how often does it fail across three workers, how long does it take; print `FRONTEND_BASE_URL`, container memory with three idle Chromium processes. Counts, times and flags only. The manager runs it on the VM from a written prompt; Claude reads the output. Record results in `Docs/orchestration/2026-11-xx-export-pipeline-measurement.md`.

### Task I-3: On-demand browser and limits

**Files:** Create `backend/app/services/export/browser_pool.py`; modify `backend/app/main.py` (no start-up browser for the new path; the old path keeps its own start if still used); Test: `backend/tests/services/export/test_browser_pool.py`.

**Interfaces:** Produces `async with acquire_browser(user_id: uuid.UUID) as browser:` (starts one browser if none; a second concurrent export gets a slot; a third waits; raises `ExportBusyError` if the user already has one running or is in cooldown); `close_idle(after_seconds: int = 120)`; constants `MAX_CONCURRENT_EXPORTS = 2`, `USER_COOLDOWN_SECONDS = 15`.

- [ ] **Step 1: Write failing tests (Playwright faked):** `test_one_browser_started_on_first_use`; `test_two_at_once_third_waits`; `test_same_user_second_export_rejected`; `test_cooldown`; `test_browser_closes_after_quiet_period`; `test_failed_export_closes_its_page`; `test_cancelled_export_releases_slot`.
- [ ] **Step 2: Run** `cd backend && pytest tests/services/export/test_browser_pool.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run.** Expected: PASS.

### Task I-4: The export pass (and its security review)

**Files:** Create `backend/app/services/export/pass_token.py`; modify the auth dependency so a pass is accepted on read routes only; Test: `backend/tests/services/export/test_pass_token.py`, `backend/tests/api/test_export_pass_access.py`.

**Interfaces:** `issue_export_pass(user_id: uuid.UUID, scope: ExportScope, now: datetime) -> str` where `ExportScope = Literal["family"] | member_id`; `verify_export_pass(token: str, now: datetime) -> ExportPass` (`user_id`, `scope`, `expires_at`) raising `ExportPassError`; HMAC-signed with a secret from config (`export_pass_secret`, refuse to issue with an empty secret in production); `revoke(token)` (the renderer calls it at the end; revocation lives in a short-lived store shared across workers, such as a small expiring table-free mechanism the spec chooses: signed token with a nonce plus the render job's end clearing it; if that needs shared state, ask the user before adding a table).

- [ ] **Step 1: Write failing tests:** `test_valid_pass_verifies`; `test_expired_pass_rejected`; `test_pass_for_other_scope_rejected`; `test_pass_cannot_call_a_write_route` (POST/PATCH/DELETE return 403); `test_pass_for_a_member_of_another_account_rejected`; `test_tampered_token_rejected`; `test_pass_works_in_a_different_process` (create in one process, verify in another with the same secret); `test_revoked_pass_rejected`; `test_empty_secret_refused_in_production`.
- [ ] **Step 2: Run** the two files. Expected: FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5 (Claude):** Write the security brief for a fresh reviewer ("attack the pass": scope widening, replay, header injection, the renderer-only binding, write routes, logging) and run the review before I-5 merges. Findings are never applied automatically.

### Task I-5: Render service and export routes

**Files:** Create `backend/app/services/export/render.py`, `backend/app/api/export.py`; one `include_router` line in `main.py`; Test: `backend/tests/api/test_export_routes.py`, `backend/tests/services/export/test_render.py`.

**Interfaces:** `ExportOptions(scope: "family" | uuid, section_ids: list[str], cover: bool, data_dates: bool, show_folios: bool)`; `POST /export/report` -> `{ job_id }`; `GET /export/report/{job_id}` -> `{ status: "preparing" | "ready" | "failed", detail? }`; `GET /export/report/{job_id}/file` -> the PDF (not stored after download); `DELETE /export/report/{job_id}` cancels. Section ids are validated against the front end's list names passed in (the server does not hard-code sections; it rejects an unknown id).

- [ ] **Step 1: Write failing tests:** `test_create_requires_signed_in_user_and_owned_scope`; `test_two_steps_across_workers`; `test_unknown_section_id_rejected`; `test_status_ready_then_download_once`; `test_file_not_kept_after_download`; `test_file_name_has_no_personal_detail`; `test_large_report_returns_a_clear_failure_with_fewer_sections_hint`; `test_old_export_route_still_works_unchanged`; `test_logs_have_size_and_duration_only`.
- [ ] **Step 2: Run** the two files. Expected: FAIL. **Step 3: Implement** (render opens `FRONTEND_BASE_URL` + the print route with the pass, waits for a ready marker, prints A4 with backgrounds, revokes the pass in a `finally`). **Step 4: Run.** Expected: PASS.

### Task I-6: Print route, print mode, bundled fonts

**Files:** Create `frontend/src/print/PrintReport.tsx`, `printMode.tsx`, fonts under `frontend/src/print/fonts/` (the brand fonts already licensed in the repo); modify `frontend/src/main.tsx` (new print route beside the old one); Test: `frontend/src/print/PrintReport.test.tsx`.

**Interfaces:** `PrintReport({ pass, options })` loads each chosen section through the normal routes with the pass, waits until every section is loaded or failed, sets a ready marker (`data-print-ready="true"` on `<body>`), always light, animations off, tables expanded, charts at a fixed width; `PrintMode` context components read to drop sticky rows, buttons and hover-only content.

- [ ] **Step 1: Write failing tests:** `waits for every section before setting the ready marker`; `a failed or empty section is noted in place`; `always light whatever the stored theme`; `no sticky rows or buttons in print mode`; `fonts load from the bundle, not Google` (no external font URL); `uses only read requests`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/print`. Expected: FAIL. **Step 3: Implement.** **Step 4: Run** it, `npx tsc -b`, `npx oxlint src/print`. Expected: PASS.

### Task I-7: Section print audit and variants

- [ ] **Step 1 (Claude):** For every section in F's list (`frontend/src/lib/pageSections.ts`) review: wide tables, charts, controls, empty and error states; decide print variants; write the list in `Docs/orchestration/2026-11-xx-print-audit.md`.
- [ ] **Step 2 (Codex, one handoff per few sections):** For each variant write failing tests (`<section> renders without controls, tables expanded, chart at fixed width, legend printed`), implement in `frontend/src/print/printSections.ts` and the section's own print branch; run the section's tests and `src/print`. Expected: PASS.

### Task I-8 / I-9: Cover, contents, header, footer, notes

**Files:** Create `frontend/src/print/{Cover,Contents,RunningHeader,RunningFooter,NotesPage}.tsx`; Test: `frontend/src/print/Cover.test.tsx` and siblings.

- [ ] **Step 1 (I-8, Codex red tests):** `cover shows "Mutual Fund Portfolio Report", "Prepared for <name> and family" or the member's name, the scope, the date generated, E's data dates and the confidentiality line`; `cover never shows PAN, folio or contact details`; `missing account name shows "Your family" or omits the line`; `contents list the chosen sections by tab with page numbers from the section list`; `running header shows the ring, title and scope; footer shows date, price date and "Page n of N"`; `notes page repeats the "i" explanations and "Indicators, not a recommendation"`; `app version printed`.
- [ ] **Step 2: Run** `npx vitest run src/print`. Expected: FAIL.
- [ ] **Step 3 (I-9, Antigravity packet):** orchestrator writes it at this point from the sample PDF (`2026-11-13-batch-i-sample-report/`) and workbook section 4: A4 proportions, green band, ring, margins, type scale, header and footer measurements, contents leaders and page numbers, continuing tables with repeated header rows. "Do not touch": the pipeline, the section components, tests.
- [ ] **Step 4: Build.** **Step 5: Run** `src/print`, `tsc -b`, `oxlint`. Expected: PASS.

### Task I-10 / I-11: Button and dialog

**Files:** Create `frontend/src/features/export/{ExportButton,ExportDialog,useExportJob}.tsx|ts`; modify `frontend/src/shell/layout/TopBar.tsx` (after K); Test: `frontend/src/features/export/*.test.tsx`, `TopBar.test.tsx`.

**Interfaces:** `useExportJob(): { state: "idle" | "preparing" | "ready" | "failed"; start(opts: ExportOptions): Promise<void>; cancel(): void; reopen(): void }`; the dialog builds its checklist from `SECTION_LISTS` (never hard-coded sections).

- [ ] **Step 1 (I-10, Codex red tests):** `button sits between Ask Mira and the family selector`; `outlined, download icon, label "Export PDF", not green`; `below 1100 px shows the icon alone with the same tip`; `disabled with "Add data first" when the household has no funds`; `starts on This tab on Mutual Funds tabs and the fund page, on Full report elsewhere, and "This tab" is not offered elsewhere`; `who: Family Combined or one member, independent of the page's own selector`; `presets fill the checklist from the shared list; Custom lets the user pick; counts shown`; `"Show folio numbers" starts from the eye setting`; `cover and data dates on by default`; `while running: spinner and "Preparing…"; clicking reopens the progress dialog; one export at a time`; `ready: download starts, a second download is offered, file name has no personal detail`; `failure: message with Try again and an offer to export fewer sections`; `fallback choice (open the print page) appears only after a failed export and carries the one-line browser warning`.
- [ ] **Step 2: Run** `npx vitest run src/features/export src/shell/layout/TopBar.test.tsx`. Expected: FAIL.
- [ ] **Step 3 (I-11, Antigravity packet):** orchestrator writes it from workbook section 3 drawings (top bar, hover tip, progress, ready, failed): measurements, the four dialog states, copy, dark mode; "Do not touch": `useExportJob`, K's top-bar box, tests.
- [ ] **Step 4: Build.** **Step 5: Run** the files, `tsc -b`, `oxlint src/features/export src/shell`. Expected: PASS.

### Task I-12 / I-13 / I-14

- [ ] **Step 1 (I-12, Codex):** Wire progress, cancel, download, error handling, the file name, and the fallback print page (the same print route in a new tab with the browser print window and a test that it works without the server's browser). Tests: `useExportJob.test.ts`, `PrintFallback.test.tsx`. Run them. Expected: PASS.
- [ ] **Step 2 (I-13, Codex and Claude):** Script `backend/scripts/measure_export.py` (read-only; counts, times, memory only) on invented households of about 5 lakh and 40 lakh; Claude recommends whether a large report needs a background job; if so it is planned in a new task and the user decides.
- [ ] **Step 3 (I-14, Codex, after D):** Static print version of the shared graph (fixed width, no hover, colours that print, printed legend) with a test `graph prints with its legend and without controls`.

### Task I-15 / I-16 (Claude)

- [ ] **Step 1 (I-15):** Generate PDFs for three invented households and check page by page against the sample and mockups: cover, contents with page numbers, every chosen section, dates in E's words, no PAN, folios as the setting says, fonts embedded, tables continuing with repeated headers. A test scans the PDF text for PAN patterns and for chosen figures versus the screen's.
- [ ] **Step 2 (I-16):** A fresh adversarial reviewer reads the diff against Review Focus, plus the dedicated export-pass review from I-4; merge `leapswitch-redesign` into `batch/i-export`, rerun affected tests, merge in. Give the M4 deploy guide (written at M4) its facts: new routes (backend before frontend), new setting `EXPORT_PASS_SECRET`, check `FRONTEND_BASE_URL` points at the redesign front end, bundled fonts, Chromium memory after removing the idle browsers (memory checked during the export test), avoid the 05:40 to 06:35 job window, the draft staging check (workbook section 9).

## Self-Review notes

- Spec coverage: pipeline repairs (F3, F5, F7, F8 -> I-3, I-4, I-5, I-6), button and dialog (I-10, I-11), cover and template (I-8, I-9), privacy (Global Constraints, I-4, I-15), measurements (I-2, I-13), fallback (I-12).
- The workbook's two statements about where the button goes disagree; the 17 Nov top-bar decision is followed and flagged above.
- Packets and handoffs: not written here, by instruction.
