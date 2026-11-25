# Handoff: es-3-be (PDF export speed, patch 3: replace the second print by a contents-only print; back end; Codex, lane BE; plan Task ES-3 back-end half)
**Status:** READY TO RELAY (written 2026-11-26). **Approved:** the owner approved the plans on 25 Nov 2026 (QA-18 under 2 minutes; **QA-19 A: the PDF must look exactly as today, the only allowed visible change is that the contents page numbers appear**; QA-20 A; QA-21 A). **Parent plan:** `Docs/superpowers/plans/2026-11-25-export-speed-plan.md` (**Task ES-3**; read "Global Constraints", "Review Focus" 1 to 3 and the task's interfaces). **Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, item 10). The earlier tasks are done and committed on this branch: the timing log (`4ef005d5`) and the look gate (`c81e3119`). If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, backend only. **A sibling Codex task `es-3-pr` (print page, folder `unifolio-es-pr`) builds the front-end hook this one calls; the two touch disjoint files.** **Its sandbox may not run async or fixture-heavy tests (a `C:\tmp` permission error was seen): write the tests and the code carefully, try once, report BLOCKED with the exact error; Claude runs them.** **Important: `pypdf` is not installed in this laptop's Python environment (pinned `pypdf==5.1.0` in `requirements.txt`), so every test that imports `pdf_pages` or splices a PDF cannot run here today: write them anyway; Claude installs the pin (with the owner's yes) before running them.** **Reviewer and committer:** Claude (G1 by the Codex adversarial review).
**Work in:** `C:\Users\Dell\lanes\unifolio-es-be` (worktree, branch `batch/es-be`, **reuse**; it holds the timing log and the look gate). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why
Today a report with the cover on is printed **twice**: the first print finds which page each section starts on, the second print (the whole report again) fills in the contents page numbers. Measurements on staging showed the second pass is the slowest, least reliable step (it can time out, and a timed-out pass left the browser at 100 percent CPU for about 65 seconds). **Replace the second whole-report print by a print of only the cover and contents pages** and **splice** those pages in front of the first PDF. The look must not change: the cover and contents pages are the same pages, now with numbers.

## Wave-start check (report drift, do not fix drift)
In `backend/app/services/export/render.py` (as committed on this branch, with the timing marks): `run_export(...)`; `_second_pdf(page, first_pdf, section_ids, job_id, navigated)` (it computes `section_pages` from the first PDF, calls the page hook `__unifolioSetPrintPages(pages)`, prints again and returns the second PDF only if the page counts match, else `None`); the `if options.cover:` block that wraps it in `asyncio.wait_for(..., timeout=SECOND_PASS_TIMEOUT_SECONDS)` and sets `timings.contents_outcome` (`done` | `timeout` | `error` | `mismatch` | `skipped`) and `timings.contents_ms`; `two_pass` in the `export finished:` line; `_timing_clock` for every timing reading (the original `_clock` call sites must stay exactly as they are: an existing test feeds `_clock` a fixed list of readings). In `pdf_pages.py`: `extract_page_texts`, `section_pages`, `_quiet_parser`. The page hooks live in `frontend/src/print/PrintReport.tsx` (`window.__unifolioSetPrintPages`); the sibling task adds `window.__unifolioShowContentsOnly`.

## The contract (fixed here; do not rename or reshape)
```python
# pdf_pages.py
def splice_first_pages(first_pdf: bytes, replacement_pdf: bytes, count: int) -> bytes
    # pypdf PdfWriter: the replacement's pages [0:count] first, then the first PDF's pages [count:], in that order;
    # raises PdfPagesError when count < 1, when either PDF has fewer than `count` pages, or when pypdf cannot read either file;
    # the first PDF's remaining pages are copied as pages (not re-rendered): they stay byte-identical in content.
# render.py
CONTENTS_PASS_TIMEOUT_SECONDS = 30
async def _contents_pdf(page, first_pdf: bytes, section_ids: list[str], job_id: str, navigated: asyncio.Event) -> bytes | None
```
`_contents_pdf`: (1) `texts = await asyncio.to_thread(extract_page_texts, first_pdf)`, `pages = section_pages(texts)`; if **not all** requested section ids **and** `"notes"` are present in `pages`, return `None`; (2) `n = min(pages.values()) - 1` = the number of cover and contents pages (a cover-on report has the cover on page 1 and the contents right after, before the first section; if `n < 1` return `None`); (3) if the page does not have `window.__unifolioSetPrintPages` **and** `window.__unifolioShowContentsOnly` return `None`; (4) `_check(...)`; `await page.evaluate("pages => window.__unifolioSetPrintPages(pages)", pages)`; `_check(...)`; `await page.evaluate("() => window.__unifolioShowContentsOnly()")`; `_check(...)`; (5) `replacement = await page.pdf(format="A4", print_background=True, prefer_css_page_size=True)`; (6) **if `len(extract_page_texts(replacement)) != n` return `None`** (a different count means the contents-only print is not the cover and contents of the first pass); (7) return `await asyncio.to_thread(splice_first_pages, first_pdf, replacement, n)`.
In `run_export`: replace the `_second_pdf` block by the same shape around `_contents_pdf` with `asyncio.wait_for(..., timeout=CONTENTS_PASS_TIMEOUT_SECONDS)`; **on timeout, on any exception, and when `_contents_pdf` returns `None` for a mismatch the page is closed** (`try: await page.close() except Exception: pass`) so no work is left running in the browser, and the **first PDF is kept** (the report still succeeds, as today); keep `timings.contents_ms`, `timings.contents_outcome` (`done`, `timeout`, `error`, `mismatch`, `skipped`) and the cancel/navigation `_check` behaviour; `two_pass=yes` in the finished line now means **the splice happened**. **Remove** `SECOND_PASS_TIMEOUT_SECONDS` and `_second_pdf` (and any reference). Cover **off**, or a one- or two-section report, must behave exactly as today: no contents pass.
**Not changed:** the job status values, error codes, the PDF of a cover-off report, the first print, the stages, the routes, the front end (the sibling task), any setting, migrations, the timing line's field names.

## Tests first (names fixed by the plan; red for the stated reason)
`backend/tests/services/export/test_pdf_pages.py`: `test_splice_first_pages_replaces_only_the_first_n_pages` and `test_splice_keeps_the_page_count_and_the_remaining_pages_byte_for_byte` (build tiny PDFs with `pypdf.PdfWriter` blank pages carrying distinguishable text or distinct `/MediaBox` sizes; compare the kept pages' content streams), plus `test_splice_rejects_a_bad_count_and_unreadable_input` (`PdfPagesError`). `backend/tests/services/export/test_render.py` (use the **existing fake rig**; the old second-pass tests, around the "two-pass" rig, are **rewritten to these names**; report each old test you replace and what it pinned): `test_contents_pass_prints_only_cover_and_contents_and_splices`, `test_contents_pass_timeout_closes_the_page_and_keeps_the_first_pdf`, `test_contents_pass_page_count_mismatch_keeps_the_first_pdf`, `test_contents_pass_is_skipped_when_the_cover_is_off`, `test_no_page_is_left_open_after_ready` (the rig asserts `page.close` was awaited on **every** path: done, timeout, mismatch, error, cancel), `test_two_pass_flag_means_the_splice_happened`, `test_the_contents_pass_does_not_run_for_one_or_two_sections` (Review Focus 3), `test_a_failing_contents_pass_still_succeeds_with_the_first_pdf`. Keep every other existing test; the timing-log tests (`tests/services/export/test_export_timing.py`) must stay green. Use invented data only.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/services/export -q -p no:cacheprovider
```
Baseline on this branch (Claude, 26 Nov): **10 failed, 112 passed, 2 skipped**; the 10 failures are the missing-`pypdf` ones (`test_pdf_pages.py` x4 and six in `test_render.py`) and are not yours until `pypdf` is installed; do not weaken them, rewrite them only where listed above.

## Files you may touch
`backend/app/services/export/render.py`, `backend/app/services/export/pdf_pages.py`, `backend/tests/services/export/test_render.py`, `backend/tests/services/export/test_pdf_pages.py`. **Do not touch:** `frontend/**`, `backend/app/services/export/timing.py`, `browser_pool.py`, `backend/app/main.py`, migrations, any other file.

## Constraints
Backend additive and look-preserving: **the PDF's pages must come from the same print path as today** (no new rendering route); no migration (Alembic stays 0054); no new dependency (`pypdf==5.1.0` is already pinned); invented data only; no network; git read-only; no deletion flags or recursive deletes. Tests first; red test files are fixed once written. Do not weaken any existing test.

## Report format
One fenced block `CODEX REPORT: es-3-be`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; drift; which tests were red first and why; each old test replaced and what it pinned; files and functions changed with a one-line reason each; commands with pass and fail counts and which tests are BLOCKED (exact errors); `git status --short`; Deviations; Open questions (including anything about a cover-on report whose first section starts on page 2 or a contents list that spans two pages).

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-26-es-3-be-handoff.md (your task: es-3-be, owner-approved)
Open Docs/superpowers/plans/2026-11-25-export-speed-plan.md (Task ES-3) for the context. Work only in C:\Users\Dell\lanes\unifolio-es-be on branch batch/es-be (reuse). Git is read-only. No deletion flags or recursive deletes. The PDF library pypdf is NOT installed on this machine: write the pypdf-dependent tests and code carefully anyway and reply BLOCKED on running them (Claude installs the pinned version and runs them). Write the failing tests first, try them once, then change only the four files the handoff lists. If the sandbox cannot run a test (a C:\tmp permission error, stalls), reply BLOCKED with the exact error.
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
