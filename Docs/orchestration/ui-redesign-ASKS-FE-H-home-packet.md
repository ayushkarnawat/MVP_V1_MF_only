# Packet ASKS-FE-H for Gemini (Antigravity): news fund weight and the greeting scheme-id link (Home follow-up)
**Status:** READY FOR GEMINI (written 27 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/home-frontend`, git worktree `/home/ayush/wt/home-fe` on WSL (Antigravity: `W:\home\ayush\wt\home-fe`). G7 (`39b7988f`) is already on this branch; nobody else works in this folder.
**Parent:** register C149 (the two additive backend asks), C153 (G7 verified), C158 (backend PR #21 merged them: optional `weight_pct` on `NewsFundOut`, optional `top_contributor_scheme_id` beside `top_contributor`). Method and shape: the finished sibling packet `ui-redesign-G7-home-news-packet.md` (same Step 0, checkpoints, report template). This packet is the whole truth for this run.

## What this run is
Tests, byte-identical backend golden fixtures and the two optional types are **already committed red**. Make **three small edits** so they pass. Do not change any test, fixture, `types.ts` or `testing/`.
1. **News popup:** each fund row in "Funds involved" also shows the fund's `weight_pct` (server text, 2 decimals, e.g. `38.41`) as `38.41%`. When the server sends none (absent or null) that row shows only the name.
2. **Greeting top-mover link:** `HomePage` passes the summary's `top_contributor_scheme_id` with the request; `Movers` opens the row whose `key` (the scheme id in the Fund grouping) equals it. The name match is used **only when no id came** (null or missing). An id that matches no row opens nothing (no fall back to the name).

## Rules
Same as G7 rules 1 to 10, plus: no `parseFloat`, `toFixed`, `Intl` anywhere under Home (comments included); no hex or `rgb(` colours in `.tsx`; the weight is the server's text plus `%`, never reformatted. **Run every command inside WSL** (`wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe/frontend -- <cmd>`; a command with `|` via `bash -c`); never two vitest/tsc at once; if timeouts, add `--maxWorkers=4` (a lone failure in `src/shell/portedFlow.test.tsx` under load is a known timeout: rerun with `--maxWorkers=2`). No `npm install`, no commit, no push.

## Step 0 (report the outputs; stop if any expectation fails)
```
git branch --show-current          # feat/home-frontend
git log --oneline -3               # top line starts: test(home): failing tests for the news fund weight and the greeting scheme-id link (ASKS-FE-H)
git status --short                 # nothing printed
cd frontend && npx tsc -b          # exactly 5 error lines, all TS2353 "'schemeId' does not exist in type" in sections/Movers.open.test.tsx (lines 84, 89, 94, 100, 105)
npx vitest run src/features/home   # Test Files 3 failed | 39 passed (42); Tests 12 failed | 632 passed | 1 skipped (645)
npx vitest run src/shell src/App.test.tsx   # 27 files / 348 passed
```
The 12 failures are: Movers.open 4, News 4, HomePage.news 4.

## File map
**Edit (3, nothing else in these files):** `sections/News.tsx`, `sections/Movers.tsx`, `HomePage.tsx` (all under `frontend/src/features/home/`). **No new files.**
**Do not touch:** every test, `types.ts`, `fixtures/**`, `testing/`, `backend/**`, `Docs/**`, anything else.

## Steps
### Step 1: `sections/News.tsx` (the `li` of the funds list, about line 214)
Replace the `<li>` so it reads exactly:
```tsx
                  <li key={fund.scheme_id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span
                      aria-disabled="true"
                      title="Coming soon"
                      className="cursor-not-allowed text-[var(--ui-disabled-text)]"
                    >
                      {fund.name}
                    </span>
                    {/* The server sends its own 2-decimal text; shown untouched, and left out when it sends none. */}
                    {fund.weight_pct ? (
                      <span data-testid="why-fund-weight" className="shrink-0 text-[var(--ui-text-muted)]">
                        {fund.weight_pct}%
                      </span>
                    ) : null}
                  </li>
```
The weight span has no `aria-disabled`. **Checkpoint 1:** `npx vitest run src/features/home/sections/News.test.tsx` -> **38 passed**.
### Step 2: `sections/Movers.tsx`
1. Prop type: `openRequest?: { name: string; schemeId?: string | null; token: number } | null;`
2. In the open-request effect replace the single `const bar = [...data.gains, ...data.losses].find(row => row.label === openRequest.name);` by:
```ts
    // In the fund grouping a row key is the scheme id: match on it when the server gave one (names can be
    // renamed or shared); fall back to the label only when no id came, never when an id matched nothing.
    const rows = [...data.gains, ...data.losses];
    const bar = openRequest.schemeId
      ? rows.find(row => row.key === openRequest.schemeId)
      : rows.find(row => row.label === openRequest.name);
```
**Checkpoint 2:** `npx vitest run src/features/home/sections/Movers.open.test.tsx src/features/home/sections/Movers.test.tsx` -> all pass (Movers.open **16**).
### Step 3: `HomePage.tsx`
1. State type: `useState<{ name: string; schemeId: string | null; token: number } | null>(null);`
2. In `handleTopMover` replace the `setTopMoverRequest(...)` line by:
```ts
    const schemeId = summary.data?.top_contributor_scheme_id ?? null;
    setTopMoverRequest(previous => ({ name, schemeId, token: (previous?.token ?? 0) + 1 }));
```
**Checkpoint 3:** `npx vitest run src/features/home/HomePage.news.test.tsx src/features/home/HomePage.test.tsx src/features/home/HomePage.controls.test.tsx src/features/home/HomeRoute.test.tsx` -> all pass (HomePage.news **27**).
### Step 4: final checks (from `frontend/`, paste outputs)
```
npx tsc -b                                         # no output
npx oxlint src/features/home                       # no output
npx vitest run src/features/home --maxWorkers=4    # Test Files 42 passed; Tests 644 passed | 1 skipped (645)
npx vitest run src/shell src/App.test.tsx --maxWorkers=4   # 27 / 348
npx vitest run src/components/ui/charts src/lib src/styles # 16 / 188
npm run build                                      # "built in", no error
cd .. && git status --short                        # exactly the three lines below
```
```
 M frontend/src/features/home/HomePage.tsx
 M frontend/src/features/home/sections/Movers.tsx
 M frontend/src/features/home/sections/News.tsx
```
**Do not commit.** Stop and report if Step 0 differs, a checkpoint fails twice, a test seems to contradict this packet, or a file outside the map is needed.

## Report template
```
GEMINI REPORT - ui-redesign - ASKS-FE-H
Model and tool:    Date/time:
0. ENVIRONMENT and Step 0 outputs:
1. FILES EDITED (exact paths):
2. CHECKPOINTS 1 to 3 (command + last lines):
3. FINAL CHECKS (full outputs):
4. ANYTHING THAT DIFFERED, and what you did:
5. TESTS THAT SEEMED WRONG (exact assertion):
6. COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched; types.ts/fixtures/testing untouched; nothing outside the map; no npm install; nothing committed (yes/no each)
```

## Orchestrator notes (not for Gemini)
**Red commit:** `f6f8ddd8` on `feat/home-frontend` (not pushed). Fixtures synced byte-identical (Get-FileHash checked) from `backend/tests/fixtures`: news `news_low_coverage.json`, `news_specific_three.json` (changed: weights); the other 6 news files were already identical; home `summary_empty/family/member/partial/statement_priced_fund/weekend.json` (changed: `top_contributor_scheme_id`). The same 6 summary goldens were also copied into the worktree's `backend/tests/fixtures/home/` (stale there; the existing file-for-file guard in `fixtures.test.ts` would otherwise fail). `backend/tests/fixtures/news` is still absent on this branch, so its guard stays skipped.
**Test changes:** `fixtures.test.ts` (summary key list gains `top_contributor_scheme_id`), `newsFixtures.test.ts` (+1: every fund has exactly name/scheme_id/2-dp weight, each item's weights sum to 10000 cents, 8 funds), `News.test.tsx` (funds row test adapted to name+weight, +4), `Movers.open.test.tsx` (+6), `HomePage.news.test.tsx` (+5; the "Nobody Fund" test now also nulls the id so it keeps testing the name fallback). Weights derived exactly: 38.41+23.22+19.38+18.99 = 100.00.
**Reference** `C:\Users\Dell\Desktop\MVP v1\ref\home-fe-ref-h`: tsc 0, oxlint 0, Home 42 files / 644 passed + 1 skipped, shell+App 27 / 348 (one load timeout in `portedFlow.test.tsx` at `--maxWorkers=4` once, green on rerun), kit 16 / 188, build ok.
**Defaults for the register:** (1) weight shown as the server's text + `%`, right-aligned, muted (not greyed); (2) weight hidden per fund when null or absent; (3) id present but unmatched opens nothing (no name fallback), as the brief says fallback only when the id is absent; (4) the greeting button label stays `top_contributor` (name); (5) `HomePage` passes `schemeId ?? null` and Movers treats an empty string as absent. **Backend asks:** none. **Unverified:** visual parity; real-data behaviour.

## Gemini prompt (paste into the Gemini window for folder `W:\home\ayush\wt\home-fe`)
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\home-fe (WSL path /home/ayush/wt/home-fe, branch feat/home-frontend). Before anything else run `git status --short` and `git log --oneline -3`; the first must print nothing and the top commit must be the red-test commit the packet names (test(home): failing tests for the news fund weight and the greeting scheme-id link (ASKS-FE-H)). If not, STOP and report; do not fix it yourself. Read, completely and in order, Docs/orchestration/ui-redesign-ASKS-FE-H-home-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-ASKS-FE-H-home-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already written and red; you edit only the three files the packet names (News.tsx, Movers.tsx, HomePage.tsx), exactly as specified, and create no files. Never edit a test, fixture, types.ts or testing/homeApi.ts, never run npm install, never commit. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe ...) and never run two vitest or tsc commands at once. If tests time out under load, rerun with --maxWorkers=4. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```

