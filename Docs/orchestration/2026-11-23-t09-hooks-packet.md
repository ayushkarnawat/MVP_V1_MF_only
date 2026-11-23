# Packet: T09 the search registry, address, intent and scope-jump hooks (Batch K, Antigravity)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner approved Batch K's plan and the 23 Nov decisions (`decisions.md`). Codex's red tests are committed on `batch/k-search` (`44cf2a06`): 37 cases in four files.
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-k-search-plan.md` (Task T09; Global Constraints; Review Focus). **The four test files are fixed: you do not edit, weaken or delete `searchRegistry.test.ts`, `usePageSearchState.test.tsx`, `useSearchIntent.test.tsx` or `useScopeJump.test.tsx`.** The specification you build to (signatures, rules, texts) is **`Docs/orchestration/2026-11-23-t09-hooks-red-tests-handoff.md`, section "The interfaces"**: read it first and follow it exactly.
**Worker:** Antigravity (Gemini). Frontend only. **Your clone:** `C:\Users\Dell\ag-t09` (branch `ag/t09-hooks`, cut from `batch/k-search`). Work only there. Never run a git command that changes anything. Never touch `backend/**`.
Read first: `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins), the handoff above, then this file; then the four test files, `frontend/src/shell/scope/scopeIntent.ts` and `ScopeProvider.tsx` (it already removes the `scope` part of a jump from the history entry and leaves `section` and `open` for **your** `useSearchIntent`), `frontend/src/lib/pageSections.ts`, `frontend/src/shell/registry/{types,buildRegistry}.ts`, `frontend/src/shell/nav/paths.ts`, `frontend/src/components/search/searchResultTypes.ts` and `recentSearches.ts`.
**Checks:** `wsl.exe -d Ubuntu -- env UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash "/mnt/c/Users/Dell/ag-t09/Docs/orchestration/wave-fe-check.sh" ag-t09 test src/components/search` (also `types`, and `lint src/components/search`).

## What to build (four new files in `frontend/src/components/search/`)
`searchRegistry.ts`, `usePageSearchState.ts`, `useSearchIntent.ts`, `useScopeJump.ts`, exactly as the handoff's interface section fixes them. Reminders that decide whether the tests go green:
- **`searchRegistry.ts`:** reads `SECTION_LISTS` from `../../lib/pageSections` (no list of its own); tab to path and label table inside the file (paths from `../../shell/nav/paths`); pages from `buildRegistry()` (`../../shell/registry/buildRegistry`), `built` is `status === "live"`; leave out groups, redirects and parameter paths.
- **`usePageSearchState.ts`:** `useSearchParams` from `react-router`; every write `setSearchParams(next, { replace: true })` keeping other params; a chip is `f=<kind>:<value>` (split at the first `:`); ignore malformed `f`.
- **`useSearchIntent.ts`:** `useLocation` and `useNavigate` from `react-router` (never `window.history`); scroll, a 1.5 s `data-search-highlight` attribute, a `MutationObserver` for a section that appears late (at most 5 s), `onOpen` once, then clear the intent's page keys from the entry with `navigate(location, { replace: true, state })` keeping other state keys; each entry once; clean up timers and observers on unmount.
- **`useScopeJump.ts`:** `resolveScopeSwitch` pure and exported; `useScopeJump(userId: string | null)` uses `useNavigate` and `useScope()` (from `../../shell/scope/ScopeContext`) and `pushRecentFund` from `./recentSearches` only when `userId` is not null.
- **Imports:** nothing from `src/features/*` (the existing `noFeatureImports.test.ts` guards it, plus no `parseFloat`, `toFixed`, `Intl.`, hex colours); `shell/` and `lib/` are allowed.

## Tests first, then build
Run the four test files first and show them fail (modules missing); then build until they pass. Then the whole `src/components/search` folder (the earlier search tests and `noFeatureImports.test.ts` must stay green), `types`, `lint`.

## Files
**Create only:** the four modules. **Do not touch:** the four test files, any other file in `components/search`, `shell/**`, `lib/**`, `features/**`, `package.json`, lockfiles, `backend/**`. If something else needs an edit, stop and report it under Open questions.
Rules: no `any`, `parseFloat`, `toFixed`, `Intl.`, `console.`, no hex; plain words; no new dependency.

## Report (one block)
Lane `ag-t09`; failing counts before and after with the exact commands; `git status --short`; decisions the packet did not cover; anything you think a test or the handoff gets wrong (do not change the tests); anything not checked (visual: nothing is visual here); open questions. No narration.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-t09-hooks-red-tests-handoff.md (the specification: the interfaces and rules)
4. Docs/orchestration/2026-11-23-t09-hooks-packet.md (your task: T09)
Work only in C:\Users\Dell\ag-t09 on branch ag/t09-hooks. The four test files are fixed: run them first (show them fail), then create only the four modules so they pass. Nothing under components/search may import from frontend/src/features. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
