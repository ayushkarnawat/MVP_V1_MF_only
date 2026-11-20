# Packet search-fe-2 (Batch K, T07): the index request, the store, the hook and the recents (Antigravity, front end, lane G-b2)
**Batch K.** Plan: `Docs/superpowers/plans/2026-11-17-batch-k-search-plan.md` (Task T07; "Global Constraints" and "Review Focus": privacy, stale responses, logout clearing). **Spec:** `Docs/orchestration/2026-11-09-search-bar-planning.html` (sections 1 and 4: the index request, the box's states "index error", recents). One of four lanes that run at the same time on disjoint files (K-T06 `ag-k1`, K-T07 this, E-3 `ag-e3`, F-3/F-4 `ag-f34`). The backend (`GET /household/search-index`, Codex task search-be-1) is **not built yet**: build against the contract and test with a mocked fetch.

**Your clone:** `C:\Users\Ayush\ag-k2` (branch `ag/k2-search`, cut from `batch/k-search`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this packet.

## The contract you build against
`frontend/src/components/search/searchTypes.ts` (exists; **do not edit**): `SearchIndexResponse { generated_at, funds: SearchFund[] }`. Request: `GET /household/search-index`, the signed-in user's bearer token (`Authorization: Bearer <token>`), **no server cache, and the browser's own URL cache bypassed** (`cachedFetch(url, { cache: "no-store" })`: `cachedFetch` in `frontend/src/lib/apiClient.ts` keeps a 60-second GET cache otherwise, and a second user must never see the first user's index). Errors: `ApiError` / `parseErrorDetail` from the same file.
**The one allowed import from `features`:** `getToken` from `frontend/src/features/auth/session` (the Mutual Funds guard allows it for features; nothing else under `components/search` may import any feature: a guard test in your folder must prove it, see below). Everything else: `@/lib/apiClient`, React, your own files, `searchTypes.ts`.

## The task (tests first: show them fail, then make them pass)
Create under `frontend/src/components/search/`, a test file beside each:
1. **`searchApi.ts`**: `export async function fetchSearchIndex(token: string | null, signal?: AbortSignal): Promise<SearchIndexResponse>` (adds the bearer header only when a token exists; throws `ApiError` on a non-OK answer).
2. **`searchIndexStore.ts`** (module-level store, no React): `export type SearchIndexStatus = "idle" | "loading" | "ready" | "error"`; `export interface SearchIndexState { status: SearchIndexStatus; data: SearchIndexResponse | null }`; `getSearchIndexState(token: string | null): SearchIndexState`; `subscribeSearchIndex(listener: () => void): () => void`; `loadSearchIndex(token: string | null): Promise<void>` (**one fetch** however many callers; a second call while loading joins the first; a call when `ready` does nothing unless invalidated); `retrySearchIndex(token: string | null): Promise<void>` (forces a new fetch after an error); `invalidateSearchIndex(): void` (the data is stale: the next `loadSearchIndex` fetches again; **keeps showing the old data** meanwhile, status stays `ready`; used after a statement import finishes); `clearSearchState(): void` (drops every token's data and state, cancels in-flight work, clears the recents (below); called at logout). **Keyed by token:** the state read for token B never shows the data fetched for token A, and a response that arrives for an old token or after `clearSearchState()` is **dropped** (sequence guard: **a slow answer must not overwrite a newer one**). A failed fetch gives status `error` and `data: null` for that token (the pages keep working; the box says "some results unavailable").
3. **`useSearchIndex.ts`**: `export function useSearchIndex(): { status: SearchIndexStatus; data: SearchIndexResponse | null; retry(): void; load(): void }` built on `useSyncExternalStore` and `getToken()`. **It does not fetch by itself**: `load()` is what the box calls on its first open (so no request is made on pages where nobody opens the box). `retry()` calls `retrySearchIndex`.
4. **`recentSearches.ts`**: per signed-in **user id** (passed in; this file never reads the auth context), browser `localStorage` only, **every access inside try/catch** (blocked storage must never throw), keys like `unifolio.search.recents.<userId>`, **never sent anywhere, never logged**, the typed text **never reaches analytics**. `readRecentSearches(userId: string | null): string[]` (newest first, at most 5), `pushRecentSearch(userId, text): void` (trim; ignore empty or one-character text; move a repeat (case-insensitive) to the front; keep 5), `readRecentFunds(userId): string[]` (fund ids, newest first, at most 5), `pushRecentFund(userId, schemeId): void`, `clearRecents(): void` (removes **every** key with the prefix, for every user). A null user id reads `[]` and writes nothing.

## Tests (write first)
`searchApi.test.ts` (mock `cachedFetch` as `lib/api.test.ts` does; the request carries `cache: "no-store"` and the bearer header; a non-OK answer throws `ApiError`). `searchIndexStore.test.ts`: **one fetch for many callers**; keyed by token (A then B never leaks); a slow answer for an old token is dropped; `invalidateSearchIndex` refetches on the next load and keeps the old data until then; `clearSearchState` drops everything and an in-flight answer arriving afterwards is ignored; failure gives `error`; retry works. `useSearchIndex.test.tsx` (React Testing Library, `fireEvent` only; no `user-event`): no request until `load()`; status transitions; `retry()`. `recentSearches.test.ts`: five newest, dedupe, case-insensitive, per user, a null user, **blocked storage (a `localStorage` that throws) never throws**, `clearRecents` removes every user's keys. **`noFeatureImports.test.ts`** (a guard, scanning `components/search/*.ts(x)` sources excluding tests): the only `features/` import allowed in the whole folder is `features/auth/session` (relative or `@/` form); any other fails; plus no `parseFloat`, `toFixed`, `Intl.` and no hard-coded colour.

## Files you may change
Exactly the four files and four test files above plus `noFeatureImports.test.ts`, all under `frontend/src/components/search/`. Anything else: stop and report.
## Do not touch
`searchTypes.ts`, `AuthContext.tsx` (the orchestrator wires logout), `lib/apiClient.ts`, any page, `backend/**`, `frontend/src/mobile/**`, `package.json`, lockfiles.

## Checks (PowerShell, from your clone)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-k2 test src/components/search
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-k2 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-k2 lint src/components/search
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run src/components/search`, `npx tsc -b`, `npx oxlint src/components/search`.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the exact exports (names and signatures); decisions the packet did not cover (list each); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-search-fe-2-packet.md (your task: search-fe-2)
Work only in C:\Users\Ayush\ag-k2 on branch ag/k2-search. Tests first (show them fail), then make them pass. Create only the files the packet lists; do not edit searchTypes.ts or AuthContext.tsx. The only import from frontend/src/features that anything under components/search may use is getToken from features/auth/session. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
