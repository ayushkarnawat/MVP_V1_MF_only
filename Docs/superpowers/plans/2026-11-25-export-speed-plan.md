# PDF export: timing log (patch 1) and speed under the look gate (patch 3): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `Docs/orchestration/wave-common-rules.md` and the master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md` first; they win where they differ. Strategy as in M1 to M4 and the XIRR batch: **Claude orchestrates, Codex builds (back end, scripts, and the performance refactors of the print page), Antigravity builds the one UI piece (the progress notice).**

**Goal:** Make a full 24-section report take **under 2 minutes** on staging (today 3.6 to 4.4 minutes), with **the PDF looking exactly as it does today** (the one allowed visible change: the contents page numbers appear). Patch 1 carries only the timing log; patch 3 carries the speed work.

**Architecture:** Measured facts (rounds 1 and 2, `Docs/orchestration/2026-11-25-export-timing-result*.md`): about 195 s of the full report is `page.pdf` printing; four sections (`overlap-common-holdings`, `holdings-all-stocks`, `holdings-top-by-fund`, `analytics-cost`) are about 70% of it; the cover adds about 17 s and its second print never finishes inside 10 s (contents numbers are missing today) and leaves one core busy for about 65 s afterwards; three sections can wait 17 to 26 s for uncached data; 15 browser processes (817 MB) of the old route run at idle. The plan: first a **look gate** (a page-by-page image comparison against a saved baseline) so every later change is provably look-preserving; then replace the second print by a cheap contents-only print that is spliced into the first PDF; stop the idle browsers; fix **why** the heavy sections print slowly without changing what they draw; warm slow data; add honest progress to the dialog.

**Tech Stack:** Python 3.14, FastAPI, Playwright, pypdf, pypdfium2, Pillow (back end). React, TypeScript, Vitest (print page and dialog).

**Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), item 10 (D-9 is Plan 3; this is D-10), decisions **QA-10 A, QA-18 (under 2 minutes), QA-19 A (the PDF must look exactly as today), QA-20 A, QA-21 A**. The page and the two timing records are the evidence; where they disagree with the live code, stop and ask the owner.

## Global Constraints

- **The look rule (owner, 25 Nov):** same pages, same page count, same page breaks, same rows, same colours, charts, fonts and spacing. **Any step that would change how a page looks is not done without the owner's explicit yes** (QA-19: no dropping shadows or gradients, no simpler charts, no fewer rows). The only allowed visible change: the contents page numbers appear. Every task in patch 3 ends with a passing look-gate run; a failing run reverts the change.
- **Target:** a full 24-section report with the cover on, on the staging VM, **under 120 s** both cold and warm; proved by the existing `backend/scripts/measure_export_staging.py` (round 1 mode, no new measuring script) run by the manager's Claude at the end (Task ES-8). If the target is not reached with look-preserving steps, **stop and bring the numbers and the options to the owner**; do not change the look.
- **Back end additive only**; no migration (Alembic 0054); no new required setting; the old `/analytics/export/pdf` route keeps working. Job status JSON keeps every field (an unused `created_at` is already sent).
- New or changed strings (**owner confirms before merge**, they are proposals on the page): `Finishing the PDF`, `${m} min ${s} s so far`, `A full report with all 24 sections can take a few minutes. You can keep using Unifolio; it will be ready to download here.` The built footer sentence in the dialog stays unless the owner confirms its replacement. `Run in background` (the button) is Plan 3.
- Privacy: the baseline PDFs of a real household contain real data: **never committed**; they live in the VM container's temporary files or a local folder outside the repository, and the comparison runs where both PDFs are. Invented data only in repository tests. No token or email in any file.
- Front-end guards for `frontend/src/print/**`: no `<button`; no hex or `rgb(` except `print-tokens.css`, `print-runtime.css`, `print-fonts*.css`; no `Intl`, `toFixed`, `console`, `any`; no literal "as on" or "as of" (use `lib/dataDates.ts`); cross-feature imports only from `mutual-funds/` and `auth/session`. Export dialog guard (`features/export/export.guard.test.ts`): hex only in `export-tokens.css`; every `<button` has `data-clickable` and a `data-effect` in {open, close, select, expand, retry, start, download}; `fetch(` only in `api.ts` and `useExportJob.ts`.
- Tests first, always; run only the affected tests; red test files are fixed once written. Codex does not run async, `TestClient` or Playwright tests nor WSL in its sandbox (it writes them, tries once, reports BLOCKED; Claude runs them).

## Review Focus

1. **The contents-only print:** the number of cover and contents pages equals the first pass's (`min(section_pages) - 1`); if they differ, the first PDF is kept, the page is closed, and the report still succeeds. [Task ES-3]
2. **A timed-out or failed contents print leaves no work behind:** the page is closed; CPU returns to idle (the 65 s leftover is gone). [Task ES-3]
3. **A one-section or two-section report** and a report with the cover **off**: unchanged behaviour (no contents pass). [Task ES-3]
4. **The old route after the idle browsers stop:** `/analytics/export/pdf` launches its browser on first use and still returns a PDF; start-up no longer launches one. [Task ES-4]
5. **A section lightened for speed:** the look gate passes page by page on the synthetic household **and** on the real staging household; a section with no look-preserving gain of at least 30% is left alone and reported. [Task ES-5]
6. **Cancel and Run in background during a long print:** both still work; the dialog's elapsed time keeps counting after it is reopened. [Task ES-7]
7. **The gate itself:** two exports of the same data by the same code compare equal (no false alarms from dates or fonts); a one-pixel change in a chart is caught. [Task ES-2]

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/export/timing.py` (new) | `ExportTimings` marks and the one log line |
| `backend/app/services/export/render.py`, `pdf_pages.py` | Marks (ES-1); contents-only print and `splice_first_pages` (ES-3) |
| `backend/scripts/export_look_gate.py` (new) | `capture` and `compare` for the look gate |
| `backend/app/main.py`, `backend/app/services/analytics/pdf_export.py` | Idle browsers stop; the old route launches lazily (ES-4) |
| `frontend/src/print/PrintReport.tsx`, `print.css` | `__unifolioShowContentsOnly` hook and its rule (ES-3); performance refactors (ES-5) |
| `frontend/src/print/groups/**` (the four heavy sections' files) | ES-5, one section at a time |
| `frontend/src/features/export/ExportDialog.tsx`, `useExportJob.ts`, `api.ts`, `exportTypes.ts` | Honest progress (ES-7) |
| Tests: `backend/tests/services/export/test_render.py`, `test_pdf_pages.py`, `test_export_timing.py` (new), `backend/tests/scripts/test_export_look_gate.py` (new), `backend/tests/test_main_startup.py`, `backend/tests/api/test_analytics_export_route.py`; `frontend/src/print/*.test.tsx`, `features/export/*.test.tsx` | |

## Lanes, branches and folders (confirm each path when a handoff or packet is written)

Patch 1 part: integration branch `batch/es1` cut from `patch/qa1`. Patch 3 part: `batch/es` cut from `patch/qa3`. Capacity: two Codex tasks at once, on disjoint files.

| Lane | Tasks | Worker | Folder | Branch |
|---|---|---|---|---|
| BE | ES-1 (patch 1); then ES-2, ES-3 (back end), ES-4, ES-6 (patch 3), in order | Codex | `C:\Users\Dell\lanes\unifolio-es-be` (new worktree) | `batch/es-be` |
| PR | ES-3 (front-end hook), ES-5 (refactors, one section per sub-task) | Codex | `C:\Users\Dell\lanes\unifolio-es-pr` (new worktree) | `batch/es-pr` |
| FE | ES-7 | Antigravity | `C:\Users\Dell\ag-es` (new clone) | `ag/es-progress` |
| Claude | ES-0, ES-8, ES-9 | Claude | `C:\Users\Dell\lanes\unifolio-es` (integration; check lane `es`) | `batch/es` |

## Handoff and packet rules

As in the master plan. Codex handoffs for ES-5 carry the section's profile numbers and the look-gate command; the Antigravity packet for ES-7 is very detailed (the page's progress mockup, every string, DOM, `data-testid`s, states: preparing, long wait, reopened, ready, failed, dark).

## Task ES-0: Wave-start check (Claude)

- [ ] **Step 1:** cut the branches and folders; add lane lines to `wave-fe-check.sh`.
- [ ] **Step 2: Confirm the code this plan names still looks as described:** `run_export(job_id, user_id, options, members, meta)` (`render.py` ~L171-289: stages at ~L216, L219, L240; first `page.pdf` ~L242; second pass under `asyncio.wait_for(..., SECOND_PASS_TIMEOUT_SECONDS)` only when `options.cover`, ~L246-249; log line ~L288); `_second_pdf(page, first_pdf, section_ids, job_id, navigated)` (~L153-168); `pdf_pages.py` `extract_page_texts`, `section_pages`; `browser_pool.acquire_browser(user_id)` (~L243-279); `main.py` ~L120-123 (`start_browser()`, `stop_browser()`, `close_pool()`); `analytics/pdf_export.py` `start_browser`, `stop_browser`, `get_shared_browser`; the print page hooks `__unifolioSetPrintPages` (`PrintReport.tsx` ~L29, L47-55) and the `[[sec:id]]` markers; `ExportDialog.tsx` preparing view (~L509-592, footer ~L562-568); `useExportJob.ts` polling (2 s) and `ROWS`.
- [ ] **Step 3: Answer in the drift note:** (a) who else calls `get_shared_browser` or `render_analytics_pdf` (grep): the plan expects only `api/analytics.py` and tests; (b) is `pypdf` the installed 7.x or the pinned 5.1.0, and does `PdfWriter` page copying work in both; (c) can the whole stack (backend, frontend dev server, a synthetic household from the existing seed) run on the owner's laptop for a local capture? If not, the gate runs on staging only (Task ES-2 says how).
- [ ] **Step 4: Record the baseline:** run `backend/tests/services/export/`, `backend/tests/api/test_export_routes.py`, `test_analytics_export_route.py`, `backend/tests/test_main_startup.py`, the front-end `print/*.test.tsx` and `features/export/*.test.tsx`; note which pass.

## Task ES-1: The timing log (Codex, lane BE; patch 1; changes no behaviour)

**Files:** Create `backend/app/services/export/timing.py`, `backend/tests/services/export/test_export_timing.py`; modify `render.py`.

**Interfaces:**
- Produces:
  ```python
  @dataclass
  class ExportTimings:
      slot_wait_ms: int | None = None      # waiting for a browser slot (acquire_browser)
      browser_start_ms: int | None = None  # cold launch, 0 when pooled
      goto_ms: int | None = None
      build_wait_ms: int | None = None
      pdf1_ms: int | None = None           # the first page.pdf
      contents_ms: int | None = None       # the second pass (or the contents-only print later)
      contents_outcome: str = "skipped"    # "done" | "timeout" | "error" | "mismatch" | "skipped"
      store_ms: int | None = None
      def log_fields(self) -> str          # "slot_wait_ms=12 browser_start_ms=0 ... contents_outcome=timeout"
  ```
  `run_export` fills it with `_clock()` marks around the existing calls and logs **one extra line** `export timing: <log_fields> pdf_bytes=<n> proxied_requests=<n>` in the existing `finally`, beside `export finished: ...` (which is unchanged).

- [ ] **Step 1: Write the failing tests** (names fixed, on the existing fake rig in `test_render.py`): `test_run_export_logs_a_timing_line_with_every_stage`, `test_contents_outcome_is_logged_for_done_timeout_error_mismatch_and_skipped`, `test_timing_line_contains_no_names_ids_or_amounts`, `test_the_export_finished_line_is_unchanged`, `test_timing_does_not_change_the_job_status_or_the_pdf`.
- [ ] **Step 2: Run; red (Claude runs the async ones). Step 3: Implement. Step 4: Claude runs `backend/tests/services/export/`; green. Step 5: Claude verifies against the allowed list and commits** `feat(export): one timing log line per export (no behaviour change)`. **G1** on this small diff by the Codex adversarial review at the patch-1 gate.

## Task ES-2: The look gate (Codex, lane BE; patch 3)

**Files:** Create `backend/scripts/export_look_gate.py`, `backend/tests/scripts/test_export_look_gate.py`.

**Interfaces:**
- Produces:
  ```
  python scripts/export_look_gate.py capture --pdf PATH --out DIR [--dpi 72]
      # renders every page of PATH to DIR/page-NNN.png (pypdfium2 + Pillow) and writes DIR/manifest.json:
      # {"page_count": N, "sections": {"<id>": first_page, ...} (from the [[sec:id]] markers), "text_sha256": ["<hash per page>", ...]}
  python scripts/export_look_gate.py compare --baseline DIR --candidate DIR [--max-diff-ratio 0.0005] [--mask FILE] [--allow-pages "1-3"]
      # exit 0 only if: same page_count; same section start pages; for every page not in --allow-pages: text hash equal and the share of differing pixels <= max-diff-ratio outside the mask regions
      # prints "page N: differs (x.xxxx%)" for each failure and a final PASS or FAIL line; prints no text content
  python scripts/export_look_gate.py make-pdf-export ...   # NOT built: the real PDFs come from the API (below)
  ```
  The real PDF is produced by the running system: on the laptop by a local capture if ES-0 (c) allows (backend, frontend dev server and a synthetic household; `POST /export/report` then download), on staging by the existing `measure_export_staging.py` helpers plus a new `--save-pdf PATH` flag added to `run_one`'s download step (an additive option; the default stays "download and discard"). `--mask FILE` is JSON `{"pages": {"1": [[x0,y0,x1,y1], ...]}}` for volatile areas (a cover date).

- [ ] **Step 1: Write the failing tests** (names fixed; fixture PDFs built with Pillow's PDF writer from images, no browser): `test_compare_passes_for_identical_pdfs`, `test_compare_fails_when_the_page_count_differs`, `test_compare_fails_when_a_section_starts_on_another_page`, `test_compare_catches_a_one_pixel_change_above_the_ratio`, `test_compare_ignores_changes_inside_the_mask`, `test_allow_pages_permits_only_the_listed_pages_to_differ`, `test_compare_prints_no_text_content`, `test_capture_writes_pages_and_a_manifest_with_section_pages`, `test_two_captures_of_the_same_pdf_compare_equal`.
- [ ] **Step 2: Run; red. Step 3: Implement** (pypdfium2 `PdfDocument(...)[i].render(scale).to_pil()`, `pdf_pages.section_pages` for the manifest). **Step 4: Claude runs; green.**
- [ ] **Step 5: Claude verifies and commits** `tools(export): the look gate (capture and compare)`. **Step 6 (Claude with the manager's Claude): capture the baseline** from the **currently deployed** code on staging (the owner's household, 24 sections, cover on, and one cover-off report), kept in the container's temporary files only; and, if ES-0 (c) allows, a synthetic-household baseline from the pre-change tag on the laptop. Record the manifest numbers (page count, section pages; no content) in the Execution log.

## Task ES-3: Replace the second print by a contents-only print (Codex lanes BE and PR; patch 3)

**Files:** Modify `backend/app/services/export/render.py`, `pdf_pages.py`; `frontend/src/print/PrintReport.tsx`, `frontend/src/print/print.css` (a rule) and the print test files named below; backend tests `test_render.py` (the two-pass tests ~L395-499 change), `test_pdf_pages.py`.

**Interfaces:**
- Produces (back end):
  ```python
  # pdf_pages.py
  def splice_first_pages(first_pdf: bytes, replacement_pdf: bytes, count: int) -> bytes   # pypdf PdfWriter: replacement pages [0:count] then first pages [count:]
  # render.py
  CONTENTS_PASS_TIMEOUT_SECONDS = 30
  async def _contents_pdf(page, first_pdf: bytes, section_ids: list[str], job_id: str, navigated: asyncio.Event) -> bytes | None
  ```
  `_contents_pdf`: computes `section_pages` from `first_pdf` (all section ids and "notes" present, else None); `n = min(section_pages.values()) - 1` cover and contents pages; calls the page hooks `__unifolioSetPrintPages(pages)` then `__unifolioShowContentsOnly()`; prints once; returns None if the replacement has a page count different from `n`; otherwise `splice_first_pages(first_pdf, replacement, n)`. `run_export` wraps it in `asyncio.wait_for(..., CONTENTS_PASS_TIMEOUT_SECONDS)` and **on timeout or error closes the page** (`await page.close()`, errors swallowed) and keeps the first PDF; fills `ExportTimings.contents_ms` and `contents_outcome`; `two_pass=yes` in the finished line means the splice happened. `SECOND_PASS_TIMEOUT_SECONDS` and `_second_pdf` are removed.
- Produces (front end): `window.__unifolioShowContentsOnly(): void` (declared beside `__unifolioSetPrintPages`) sets `document.documentElement.dataset.printContentsOnly = "true"`; `print.css`: `html[data-print-contents-only="true"]` hides every tab block, section and the notes page so only the cover and the contents remain, **without any other style change**.

- [ ] **Step 1: Write the failing tests** (names fixed). Back end: `test_splice_first_pages_replaces_only_the_first_n_pages`, `test_splice_keeps_the_page_count_and_the_remaining_pages_byte_for_byte`, `test_contents_pass_prints_only_cover_and_contents_and_splices`, `test_contents_pass_timeout_closes_the_page_and_keeps_the_first_pdf`, `test_contents_pass_page_count_mismatch_keeps_the_first_pdf`, `test_contents_pass_is_skipped_when_the_cover_is_off`, `test_no_page_is_left_open_after_ready` (the rig asserts `page.close` awaited on every path), `test_two_pass_flag_means_the_splice_happened`, and the old second-pass tests rewritten to these names. Front end (`print/*.test.tsx`): `contents_only_mode_hides_sections_tab_headings_and_notes`, `contents_only_mode_keeps_cover_and_contents_unchanged`, `the_hook_is_declared_and_sets_the_flag`, and the existing print tests stay green.
- [ ] **Step 2: Run; red** (async and Playwright-free rig tests: Claude runs). **Step 3: Implement** (two Codex tasks at once: BE and PR on disjoint files). **Step 4: Claude runs `backend/tests/services/export/`, the print tests, guards; green.**
- [ ] **Step 5: The gate:** Claude captures a candidate report from the branch (laptop, or staging after the integration deploy) and runs `compare --baseline ... --candidate ... --allow-pages "<cover and contents pages>"`: **PASS means only the contents pages differ**, and the contents page shows numbers. Commit `feat(export): contents page numbers from a cheap contents-only print, no leftover work`. **G1:** Codex adversarial review of the back-end diff.

## Task ES-4: Stop the idle browsers of the old route (Codex, lane BE; patch 3; QA-21 A)

**Files:** Modify `backend/app/main.py`, `backend/app/services/analytics/pdf_export.py`; tests `backend/tests/test_main_startup.py`, `backend/tests/api/test_analytics_export_route.py`, `backend/tests/services/analytics/test_pdf_export_integration.py` (marker `playwright`).

**Interfaces:** `get_shared_browser()` launches the browser **on first use** (an `asyncio.Lock`-guarded lazy start); `main.py` no longer calls `start_browser()` in the lifespan; `stop_browser()` and `close_pool()` still run at shutdown (a no-op if never started). The route and its payload are unchanged.

- [ ] **Step 1: ES-0 (a) must have shown nothing else uses the shared browser;** write the failing tests: `test_startup_does_not_launch_a_browser` (update `tests/test_main_startup.py` L28-29), `test_the_old_route_launches_its_browser_on_first_use`, `test_two_concurrent_first_requests_launch_one_browser`, `test_shutdown_is_a_no_op_when_the_browser_never_started`.
- [ ] **Steps 2 to 5 as in ES-1** (commit `perf(export): the old route launches its browser on first use; start-up launches none`). Claude checks on the laptop that the old route still returns a PDF (the playwright test).

## Task ES-5: The four heavy sections, one at a time, look-preserving (Codex, lane PR; patch 3)

**Sub-tasks:** ES-5a `overlap-common-holdings` (56.5 s alone), ES-5b `holdings-all-stocks` (27 s), ES-5c `holdings-top-by-fund` (26.6 s), ES-5d `analytics-cost` (26 s); then, only if still above target, `overview-mutual-funds` and `analytics-category` (about 10 s each).

**Each sub-task has the same steps:**
- [ ] **Step 1: Profile** (Claude and Codex): open the section alone in the print page with the synthetic fixture and, through the manager's Claude, with the real household; record element count, table rows and cells, SVG node count, the number of shadows and filters, and the single-section export time; write the numbers and the hypothesis in `Docs/orchestration/2026-11-2x-es5-<section>-profile.md` (counts and times only, no content).
- [ ] **Step 2: Decide.** Allowed fixes change **how** the same pixels are produced, not what is drawn: fewer wrapper elements per cell, plain `<td>` instead of a component per cell, memoised or hoisted per-row work, removing elements that draw nothing, drawing the same chart marks with fewer nodes, avoiding repeated style recalculation or font and image loads per row. **Not allowed without the owner's yes:** dropping shadows or gradients, simplifying a chart, showing fewer rows, changing sizes or spacing. If no allowed fix is expected to gain at least 30% of the section's print time, **stop, report the numbers to the owner, and leave the section alone.**
- [ ] **Step 3: Write the failing tests first** where a structural change can be pinned (`<section>_print_renders_the_same_text_and_rows_as_before` against a text inventory captured from today's component, `<section>_print_uses_at_most_<N>_elements_for_the_fixture` with N set from the profile) plus the section's existing print tests untouched; run; red.
- [ ] **Step 4: Implement the fix;** Claude runs the section's tests, `tsc -b`, `oxlint`, the print guards; green.
- [ ] **Step 5: The look gate** (Task ES-2) on the synthetic household and then on the real household: **PASS or the change is reverted.** Measure the section's single export again; record the gain.
- [ ] **Step 6: Claude commits** `perf(print): <section> prints faster with the same look`.

## Task ES-6: Warm the data the slow sections wait for (Codex, lane BE; patch 3; decision gate)

Three sections wait 17 to 26 s for uncached data (`holdings-top-by-fund`, `overlap-top-pairs`, `transactions-cash-flow`); in round 1 the whole build stage took 2.6 s when data was cached.

- [ ] **Step 1: Investigate (Codex, read-only):** which API calls each section's print component makes, which cache or stored result each hits (`analytics_sections` stored rows, or on-demand compute with a process cache of about 15 minutes), and why it is slow cold. Write `Docs/orchestration/2026-11-2x-es6-data-waits.md` (names and times only).
- [ ] **Step 2: Decide with the owner if a product choice is involved** (for example, adding these sections to the nightly stored recompute changes what runs at night; warming at request time adds work before the first page prints). Do not decide silently.
- [ ] **Step 3: Write the failing tests for the chosen approach** (names set from the investigation; the contract is: the first export after a quiet period does not wait more than a few seconds for these three sections; no stored result is changed in shape), implement, Claude runs, commit `perf(export): the slow-loading sections no longer wait on cold data`.

## Task ES-7: Honest progress in the dialog (Codex red tests, then Antigravity; patch 3; QA-20 A)

**Files:** `features/export/ExportDialog.tsx`, `useExportJob.ts`, `api.ts`, `exportTypes.ts`, `export-tokens.css` (tokens only) and the export tests.

**Interfaces (fixed here):**
- `api.ts` job status type gains `created_at: string` (already sent by the server); `useExportJob` exposes `elapsedSeconds: number` (computed from `created_at`, ticking once a second while preparing, continuing after the dialog is reopened); `exportTypes.ts` `progress` gains `elapsed: string`.
- `ExportDialog.tsx` preparing view (~L509-592): the stage line reads `Finishing the PDF` while the stage is `finishing`; `${m} min ${s} s so far` beside it; the footnote sentence under the progress bar becomes the proposed sentence **only if the owner confirms it**; the buttons (`Cancel`, `Run in background`) are unchanged.
- Test ids: `export-elapsed`, `export-stage-line`, `export-long-note`.

- [ ] **Step 1: Codex writes the red tests:** `shows_the_elapsed_time_while_preparing`, `elapsed_time_keeps_counting_after_the_dialog_is_reopened`, `formats_minutes_and_seconds_without_Intl` (the guard forbids `Intl`), `shows_the_long_note_only_while_preparing`, `buttons_and_their_callbacks_are_unchanged`. **Step 2: Antigravity builds** from the packet (lane `ag-es`; tests, `types`, `lint`, `build` green). **Step 3: Claude screenshots** the preparing view at 0 s, 2 min 10 s and after reopening, light and dark, against the page's progress mockup; commit `feat(export): honest progress in the dialog`.

## Task ES-8: Acceptance on staging (Claude, the manager's Claude)

- [ ] **Step 1:** write the patch 3 deploy guide (master plan Task M3) with this step: after the deploy, the manager's Claude runs the **existing** `measure_export_staging.py` (round 1 mode: full cold, full warm, small warm, small cold; minted session from the owner's email, no token) and gives the output as printed.
- [ ] **Step 2: Acceptance:** full cold and full warm under **120 s**; the contents page numbers present; the look gate PASS on the real household (baseline from the pre-patch code, candidate from the deployed patch); the timing log lines present; container memory about 800 MB lower at idle. **If a number is missed:** record it, bring the numbers and the options to the owner (more section work, or a look-changing step, or parallel printing by tab); do not change the look.
- [ ] **Step 3: QA rows:** M4-3 (the dialog), M4-8 (timing), an export row for the contents page numbers, and an export-look row (the owner opens a new export next to an old one). `decisions.md`, `session.md`, delegation-log lines.

## Task ES-9: Contingent: print in parallel pieces (not planned in detail)

Only if ES-8 misses the target **after** ES-3 to ES-6 and the owner agrees: print the report in chunks **by tab** (every tab starts on a new page: `print-tab-heading` has `break-before: page`; sections within a tab flow continuously, so chunking by section is **not** look-preserving) at the same time and join the PDFs with pypdf; the contents numbers then come from the chunk page counts. It needs spare cores on the VM (unknown) and its own plan, written at that point.

## Self-review against the page

Item 10: the timing log (ES-1, patch 1); the look rule and gate (Global Constraints, ES-2); the second-print replacement and the contents numbers (ES-3); the idle browsers (ES-4, QA-21 A); the heavy sections under the look gate (ES-5, QA-19 A); data waits (ES-6); honest progress (ES-7, QA-20 A); the target and the acceptance run (ES-8, QA-18); parallel printing only as a last resort (ES-9). D-9's button label is Plan 3. Tests named on the page for the look gate are in ES-2 and ES-3.

## Execution log

*(Claude appends below: drift note, profiles, gate results, the baseline manifest numbers, the acceptance output, deploy record link.)*
