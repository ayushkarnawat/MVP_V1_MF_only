# Codex second-opinion reviews (18 Nov 2026)

Why: the reviews so far were done by independent Claude (Sonnet) agents. The model-orchestration skill prefers a reviewer from a different model family than the author, so these prompts give Codex the same job. Claude's findings stay on record; Codex's are a second, independent read. Findings are never applied automatically: each one that reproduces becomes a red test first (then a fix), as before.

Rules that apply to every review below: read-only (Codex works in a scratch copy, never the worktree), **no deletion flags of any kind** (`rsync --delete`, `rm -rf` outside its own scratch folder, `git clean`, `git reset`), no commit, no push, no stash, no checkout, no secrets or real data in the report, invented data only. Codex cannot run API tests that use `TestClient` or asyncio in its sandbox (a loopback socket stalls); it runs the service-level and unit tests and **reads** the route tests; say which tests it could not run.

---
## 1. Review of the B-2 address guard and the phone fix (ready now)

Paste into Codex:

```
You are an adversarial reviewer (independent second opinion) for Unifolio's sign-in request guard. Another model reviewed it already and found nine issues, all since fixed; find what it missed. Do not write feature code and do not modify the repository.

Setup (read-only): the code is on branch batch/b-journey in D:\unifolio-b-journey at commit a3885221 or later. Make your own copy with `git -C D:\unifolio-b-journey archive HEAD backend Docs/orchestration frontend/src/features/auth | tar -x -C <your scratch folder>` and work only there (read the Docs paths named below from that copy). Never run rsync with --delete, git clean, git reset or any recursive delete outside your scratch folder.

Read first: Docs/orchestration/2026-11-18-b2-review-findings.md (what was found and fixed; do not report those again unless the fix is wrong), Docs/orchestration/2026-11-18-b2-address-guard-handoff.md (the spec), Docs/orchestration/wave-common-rules.md.

Files under review: backend/app/services/auth/request_guard.py, backend/app/services/auth/schemas.py (normalize_phone and the three validators), backend/app/services/auth/otp.py (resend rule and the 429 carrying retry_after_seconds), backend/app/api/auth.py (every guard call and every record_outcome), backend/app/services/auth/device_info.py (client address), backend/app/models/auth.py (AuthRequestGuard), backend/alembic/versions/0054_auth_request_guard.py, backend/app/scripts/clean_auth_guard.py, backend/app/config.py and backend/app/main.py (the secret and the production start-up refusal).
Tests to read: backend/tests/services/auth/test_request_guard.py, backend/tests/api/test_phone_spellings.py, backend/tests/api/test_auth_routes.py, backend/tests/functional_postgres/test_auth_guard_concurrency.py.

Hunt for (each finding needs a reproduction: exact inputs, wrong result, right result):
1. Address handling: can a caller choose or spoof the address that is counted (X-Forwarded-For with many entries, spaces, ports, IPv6 zone ids, IPv4-mapped IPv6, the unspecified address, an empty header)? Behind an AWS load balancer that appends and Caddy that replaces, what is the last entry? Can two clients share one bucket by accident, or one client get many?
2. Limit arithmetic: the 10-minute sliding window, "distinct identifier stays counted until its newest row expires", the seconds-left figure (never 0, never negative, never more than the window), the check limit (30) versus the code limit (10), 'held' and 'code_sent' counting, one row per address and identifier, rows left 'pending' by a crash.
3. The new Postgres advisory lock (pg_advisory_xact_lock with a fixed class and hashtext of the address hash): is it always released (every route path: success, 409, 404, 429, 502, exception, client disconnect, rollback inside a savepoint)? Can a request take it twice and deadlock itself? Can it be held across a slow email send long enough to make other users from the same address fail open? Is lock_timeout restored correctly, and does the route's own later row locking keep the database's own setting? Pool exhaustion if many requests wait on one address (the pool is small): can an attacker from one address starve other users' sign-ins? Hash collisions of hashtext (32-bit) between addresses: harmless or not?
4. Fail-open paths: every place the guard returns None or skips (empty secret, no address, table missing, lock timeout, database error). Can an attacker trigger one on purpose to switch the guard off? Is anything logged that contains a code, token, secret, raw address or raw identifier?
5. Phone canonical form (normalize_phone): spellings it should fold and does not, values it folds and should not (a number that is really somebody else's), Unicode digits and spaces, a leading + in the middle, very long input, input with a newline. Compare with the browser's validateIndianPhone in frontend/src/features/auth/validation.ts: any input where the two disagree? Does every place that stores or looks up a phone number now receive the canonical form (OTP request and verify, sign-up, login, head-of-family contact change, account lookup by phone)? Can an existing account whose number was stored in another spelling be locked out?
6. Information leaks: do the 429 bodies, their timing or the choice between 'otp_throttled' and 'request_limited' reveal whether an account or an email or a number exists?
7. API compatibility: the old staging front end shares this backend and database. Is every response and field unchanged for a normal request (additive only)? The 429 shape {detail, code, retry_after_seconds}: anything an old client would misread?
8. Migration 0054 and the cleanup script: upgrade and downgrade, indexes, the unique constraint, running twice, running while requests are in flight, the 24-hour purge versus the 10-minute window.
9. Tests that pass for the wrong reason: pick eight mutations of request_guard.py (flip a comparison, change the window, drop the lock, drop the IPv4-mapped fix, count the wrong outcomes) and list which survive the tests. Say which tests you could not run in your sandbox.

Write your result to <your scratch folder>/b2-codex-adversarial.md and paste the same text in your reply: verdict (safe to deploy to the staging VM: yes/no, and safe for production: yes/no), findings ranked Critical/High/Medium/Low with file:line and reproduction, the mutation survivors, what you could not check. No finding without a reproduction; mark anything you only reasoned about as "reasoned, not run".
```

---
## 2. Whole-batch review of Batch B (use after B-9, B-13 prep and the screens are all committed)

The orchestrator fills `<final commit>` and sends this when Batch B is complete. Same rules and setup as above.

```
You are an adversarial reviewer (independent second opinion) for Batch B of the Unifolio November 2026 release: the sign-up and sign-in journey. Do not write feature code and do not modify the repository. Work in your own copy made with `git -C D:\unifolio-b-journey archive <final commit> backend frontend Docs/orchestration | tar -x -C <scratch>`; never use rsync --delete, git clean, git reset or a recursive delete outside your scratch folder.
Spec: Docs/superpowers/plans/2026-11-17-batch-b-journey-plan.md and the design workbook Docs/orchestration/2026-11-12-batch-b-planning-workbook.html (the workbook is the design; every screen, state, copy string and measurement must match; a deviation is a defect). Colours: Docs/orchestration/2026-11-18-palette-reference-for-workers.md. Rules: Docs/orchestration/wave-common-rules.md. Already reviewed and fixed, not to be reported again unless the fix is wrong: Docs/orchestration/2026-11-18-b2-review-findings.md.
Hunt for: a screen, state or string that differs from the workbook; wrong or missing error and countdown states (login countdown, the per-network message, the wrong-person warning, the tick, onboarding option A and the green switch); the structured 429 contract against every consumer (the old staging front end must still work: additive only); the four Head of Family emails (escaping of hostile names, token only after # in the link, no link in the three others, no personal data in image addresses, alt text, dark mode, plain-text part, "their" not a guessed pronoun); accessibility (labels, focus order, live regions, contrast on the palette greens); the five window sizes (1280x600, 1366x650, 1440x810, 1536x730, 1920x1080) with no scrolling on the sign-up, log-in and onboarding screens; tests that pass for the wrong reason (eight mutations, list survivors).
Run the frontend tests you can, read the ones you cannot. Result: a verdict (ready to merge into the M1 candidate: yes/no), findings ranked Critical/High/Medium/Low with file:line and a reproduction each, mutation survivors, what you could not check.
```

## 3. Whole-batch review of Batch C (use after C-10 and C-11)

Same shape as 2, with: plan `Docs/superpowers/plans/2026-11-17-batch-c-hygiene-plan.md`, workbook `Docs/orchestration/2026-11-12-batch-c-planning-workbook.html`, worktree `D:\unifolio-c-hygiene` branch `batch/c-hygiene`, and the hunt list: the folio number everywhere it is shown (eye, Copy, masked by default, no PAN, no real data), the additive-only contract (`folio_number` beside the masked fields; golden fixtures), the assumed-opening line, the import landing rules (which view after an import, every case in workbook section 5; the replaced-refresh, view-picked-during-wait and household-growth rules), phone folio findings (report only, no phone change), and every batch C change against the old staging front end.
