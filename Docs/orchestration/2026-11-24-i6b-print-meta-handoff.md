# Handoff: i6b-print-meta (Batch I: the print page takes its member names and cover facts from the fragment, front end, Codex B)
**Status:** READY TO RELAY after the cash-flow wrapper (written 2026-11-24). A small follow-up to the print foundation (`2026-11-24-i6-print-foundation-handoff.md`). **Why:** a member report's pass cannot call the member-list route (it has no scope parameter, and a member pass is refused on routes without one by design), so the **back end puts the names into the fragment** and the print page makes **no member-list call**. Decision recorded in the I-5 handoff's amendment.
**Worker:** Codex, front end only. **Reviewer, test runner and committer:** Claude. **Work in:** `C:\Users\Dell\lanes\unifolio-i-fe`, branch `batch/i-fe` (same project; I commit between tasks). Read first: `ui-common-rules-codex.md`, `wave-common-rules.md`, the foundation handoff (what exists), then this file.

## The change
1. **`frontend/src/print/printFragment.ts`**: `PrintOptions` gains two **required** fields: `members: { id: string; name: string }[]` (1 to 50 entries; ids must look like UUIDs; names are non-empty strings of at most 120 characters) and `meta: { holderName: string | null; scopeName: string; memberCount: number }` (`memberCount` an integer from 1 to 50, `scopeName` a non-empty string of at most 160 characters). Validation as for the other keys: a missing or malformed value makes `parsePrintFragment` return `null` (the route then shows its error marker); unknown keys stay ignored. The fragment format is otherwise unchanged: `/print/report#pass=<token>&opts=<base64url(UTF-8 JSON)>` with keys `scope`, `sectionIds`, `cover`, `dataDates`, `showFolios`, `jobId`, `members`, `meta`.
2. **`frontend/src/print/PrintReport.tsx`**: the scope provider builds `members` from `options.members` (`{ id, name }`, with no `profile`), `viewMode` and `memberId` as today, and **makes no API call for members**: remove the `getHouseholdMembers` import and call. **`options.meta` is kept available to the later template integration**: put the parsed options (including `meta`) in a small React context `PrintOptionsContext` exported from `frontend/src/print/printOptionsContext.ts` with `usePrintOptions()` so the cover and header can read `meta.holderName`, `meta.scopeName`, `meta.memberCount` without a new fetch.
3. **Guard test** (`printRoute.guard.test.ts`): the import rule goes back to **only** `features/mutual-funds/` and `features/auth/session` (remove the exception for `features/auth/api`).
4. **Tests (update and add; existing assertions in other folders untouched):** `printFragment.test.ts`: valid `members` and `meta` parse; missing `members`, an empty list, 51 entries, a non-UUID id, an empty or over-long name, a missing or non-integer `memberCount`, a missing `scopeName`: each returns null. `PrintReport.test.tsx`: `makes no request for the member list` (spy on `fetch`: no call to `/household-members`); `the scope provider exposes the members from the fragment`; `usePrintOptions returns the options including meta`; the existing "uses only read requests" test is updated to expect **no member-list request** and to keep asserting only GET/HEAD for whatever the sections call; the fragment fixtures in all `src/print` tests gain valid `members` and `meta`.

## Files you may touch
`frontend/src/print/printFragment.ts` (+ test), `frontend/src/print/PrintReport.tsx` (+ test), `frontend/src/print/printRoute.guard.test.ts`, new `frontend/src/print/printOptionsContext.ts`. **Do not touch** anything else.

## Run these only (Claude runs them)
`cd frontend && npx vitest run src/print`, `npx tsc -b`, `npx oxlint src/print`. Codex: say you could not run them; re-read against the tests.

## Report
One fenced block `CODEX REPORT: i6b-print-meta`: status; baseline HEAD; files changed (one line each); tests changed and added; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-24-i6-print-foundation-handoff.md (what already exists)
4. Docs/orchestration/2026-11-24-i6b-print-meta-handoff.md (your task: I-6b)
Work only in C:\Users\Dell\lanes\unifolio-i-fe on branch batch/i-fe (same project; I commit between tasks, so it starts clean). Git is read-only. No deletion flags or recursive deletes. Write the tests first, then the code; touch only the files the handoff lists. The print page must make no member-list request: the names come from the fragment. You cannot run the tests; do not try, and do not change any config. Re-read your code against the tests.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
