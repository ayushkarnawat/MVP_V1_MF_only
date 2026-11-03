# Run 7 common rules (the `cr-r7-*` handoff points here)

Run 7 of 7: logos, one heading per card, the green button token, and the screen parts of the owner's 2 Nov answers (valuation "not enough data" reasons, benchmark explanation and info icon, category-average sentence). Plan: `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, section "Run 7". Commit prefix `cr-r7:`. Worker: Gemini in Antigravity (Gemini 4 "Argon" first, Gemini 3.8 high if that runs out). The orchestrator (Claude) reviews every task, commits and tags. **The worker never runs `git add`, `git commit`, `git push` or any git command that changes anything.**

Everything in `cr-r6-common-rules.md` applies (where to work, the frontend check script, method, hard rules 1 to 9, known failures, report format), with these changes:
- Frontend only. If a task seems to need a backend change, STOP and say what is missing; the backend fields are built by the orchestrator and listed in the handoff's contract sections.
- **Plain words on every label** (no "TRI", "proxy", "fallback", "excluded: no data"). Explanatory text about a benchmark comes from the backend where the handoff says so; the frontend holds only the short display words in `frontend/src/lib/benchmarkDisplay.ts`.
- Old and new payloads: a payload without a new field (an old stored analytics section) must render as before, never crash or blank.
- Legacy, print and phone views stay as they are unless a task names them.
- The Run 7 gate is the orchestrator's: the whole frontend suite, build, lint, a review, then the tag `cr-run-7-done` (local only).
