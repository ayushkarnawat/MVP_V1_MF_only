# Packet search-fe-1 (Batch K, T06): the matcher, the query parser and the result builder (Antigravity, front end, pure logic, lane G-b1)
**Batch K.** Plan: `Docs/superpowers/plans/2026-11-17-batch-k-search-plan.md` (Task T06; "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-09-search-bar-planning.html`, section 4 ("How matching works"), section 3 of the UI part ("One row of every result type, and what clicking it does") and "Typing a fund house". Pure logic, no React, no network, no storage. One of four lanes that run at the same time on disjoint files (K-T06 this, K-T07 `ag-k2`, E-3 `ag-e3`, F-3/F-4 `ag-f34`).

**Your clone:** `C:\Users\Ayush\ag-k1` (branch `ag/k1-search`, cut from `batch/k-search`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this packet. (No colours or screens in this packet.)

## The task
Create, under `frontend/src/components/search/`, with a test file beside each (tests first: show them fail, then make them pass): `matcher.ts`, `queryParser.ts`, `buildResults.ts`, and the new types file `searchResultTypes.ts`. `searchTypes.ts` (the index reply types) already exists: **do not edit it**. **No new dependency; our own code.** No `parseFloat`, `toFixed` or `Intl.` (a feature guard forbids them; keep the same rule here). No hard-coded colours (there are none to write).

### matcher.ts
`export function normalise(text: string): string` (lower case; remove "₹" and commas; collapse runs of spaces; treat "-" and "&" as spaces; trim). `export function matchesItem(words: string[], item: SearchableItem): number` returns a rank, **0 = no match**, higher is better.
- `export interface SearchableItem { fields: SearchableField[] }` with `SearchableField { value: string; kind: "name" | "alias" | "text" | "amount" }` (`name` = name-like, the only kind that may be spelling-forgiven; `alias` = fund-house short names and similar; `text` = category, plan words, other labels; `amount` = never forgiven).
- **Word rules:** every query word must be found in at least one field of the item. A word is found if it is the **start of a word in the field**, **or** if it is **inside a word and is 3 or more letters** long ("in" must not match everything).
- **Ranking:** exact beats forgiven. Order of ranks, best first: the item's first name field **starts with** the whole normalised query; a name word starts with the query words; any field matches; **spelling-forgiven matches rank below every exact match**.
- **Spelling forgiveness:** a word of **4 to 7 letters** may differ by **one** edit (a wrong, missing, extra or **swapped adjacent** letter); a word of **8 or more** may differ by **two**; words of 3 letters or fewer are never forgiven. **Name-like fields only** (`kind: "name"`), never `amount`. Own code, a small bounded edit-distance (Damerau, adjacent transposition counts as one edit); no library.
### queryParser.ts
`export function parseQuery(text: string): ParsedQuery` with `ParsedQuery { words: string[]; typeWord?: string; year?: number; month?: string; amount?: string }`. **Type words** (removed from `words`, returned in `typeWord`): "purchase", "redemption", "switch" (and the plural or common forms "purchases", "redemptions", "switches"; keep it a small constant table). **A year** = four digits 1990 to 2100 (returned as a number, removed from `words`). **A month name plus a year** (full or 3-letter, any case) gives `month` as the 3-letter lower-case name and `year`. **An amount** = a number (digits, with commas or ₹ removed) that is not a year, returned as a string, removed from `words`. Everything else stays in `words` (normalised). An empty or whitespace query gives empty `words`.
### searchResultTypes.ts (new; you define it; the box, the pages and the hooks will import it, so keep it small and stable)
```ts
export type ResultKind = "fund" | "category" | "manager" | "member" | "sip" | "transactions" | "stocks" | "page";
export type ResultAction =
  | { type: "jump-fund"; schemeId: string; switchTo: { memberIds: string[]; label: string } | null }   // null = already in scope
  | { type: "filter"; chip: { kind: "category" | "member" | "period"; value: string } }
  | { type: "go"; path: string; sectionId?: string; text?: string }                                  // a move to another page / section / hand-off with text
  | { type: "switch-member"; memberId: string; label: string }
  | { type: "none" };                                                                                   // greyed "Coming soon"
export interface ResultRow { id: string; kind: ResultKind; title: string; subtitle?: string; tag?: string; action: ResultAction; disabled?: boolean }
export interface ResultGroup { kind: ResultKind; label: string; rows: ResultRow[]; total: number }       // rows = the shown rows (capped), total = all matches
export interface PageFilterSource { pageKey: string; noun: string; total: number; matched: number; chipsAllowed: Array<"period" | "member" | "category">; extraResults?: ResultRow[] }
export interface SectionEntry { id: string; title: string; path: string; tabLabel: string; built: boolean }   // from F's list; `built: false` renders "Coming soon"
export interface Recents { funds: string[]; searches: string[] }                                              // fund ids (newest first), last typed searches (newest first, at most 5)
export interface SearchScope { memberIds: string[] | "family" }                                              // who the page is showing now
```
### buildResults.ts
`export function buildResults(query: ParsedQuery, source: PageFilterSource, index: SearchIndexResponse | null, registry: SectionEntry[], recents: Recents, scope: SearchScope): ResultGroup[]`. Rules (from the spec; the plan's Global Constraints win on a conflict):
- **Eight kinds only:** funds, categories, fund managers (**the fund's `main_manager` only**), members, SIPs (including stopped), "transactions" (one hand-off row "Search transactions for "<text>"", only when there are text words, a type word, a year, a month or an amount), "stocks" (one hand-off row "Search stocks for "<text>"", only when there are text words), pages and sections (from the `registry`). **Not results:** fund houses as their own row (typing a house name or its short form just finds its funds; the fund row's second line shows the house), folios, sectors, terms, actions.
- **Empty query:** if `recents` has anything, return a "recent funds" group (fund rows for ids still in the index, in order) and the recent searches are handled by the box (not here). Otherwise `[]`.
- **Fund rows:** title = fund name; subtitle = `<amc_name> · <Direct|Regular> · <category> · <holder names that hold it open>`; ties in rank go to funds the family holds **open**, then by name. `action`: `jump-fund` with `switchTo` = `null` when any holder is in the current scope (`scope.memberIds` is "family" or contains one of the fund's holder member ids); else `{ memberIds: [the single holder] , label: that holder's name }` if exactly one holder, or `{ memberIds: [], label: "Family" }` meaning "switch to Family" when several holders and none is in scope (the plan: one holder: that person; several holders not including the viewed one: Family). The row `tag` is "Switches to <label>" when switching, "open" / "sold" style tags for holders otherwise.
- **Category rows:** distinct `sebi_category` values that match, `action` = `filter` with chip `category`, subtitle "<n> funds"; **only** when `source.chipsAllowed` contains `"category"`, otherwise `go` to `/portfolio/mutual-funds/allocation`. **Manager rows:** distinct `main_manager` that match, subtitle "Main manager · <n> funds open", action `go` to the Allocation page (`path: "/portfolio/mutual-funds/allocation"`, `sectionId: "allocation-fund-manager"`). **Member rows:** members seen in `holders`, subtitle "Member · <n> funds", action `switch-member`. **SIP rows:** one per holder whose `sip` is not null, title "SIP · <fund name>", subtitle "<Active|Stopped> · next <dd Mon>" (use the date text as given; no `Intl`), action `go` to `/portfolio/mutual-funds` with `sectionId: "overview-sips"`. **Page rows:** match the `registry` titles (all words); an entry with `built: false` has `disabled: true`, `action: { type: "none" }`, tag "Coming soon"; **at most two page rows per search**.
- **Caps:** at most **3 rows per group**, `total` carries the full count (the box offers "See all N" up to 20), **30 rows maximum in all**. The first group is always the page's own match line when `source.matched` is known (that line is the box's job, not yours: do not add it).
- Deterministic: same input, same output order. Never mutate the inputs. No rupee amounts anywhere.

## Tests (you write them first; show them fail, then make them pass)
`matcher.test.ts`: normalisation cases; "parag-parikh" and "parag parikh" match each other; every word must match in any order; a word starts a field word; "in" does not match inside words but "ikh" (3 letters) does; ranking order; exact beats forgiven; **wrong-letter** ("paragg"/"parag" style: "flxi cap" finds "flexi cap" only if within one edit rule: choose clear cases), **missing letter**, **extra letter**, **swapped letters** ("flexi" vs "felxi"); words too short to forgive (3 letters) do not match with an error; a forgiven match in an `amount` field never happens; 8-letter word two edits. `queryParser.test.ts`: type word, year, month plus year, amount, mixed ("hdfc redemption 2025"), empty. `buildResults.test.ts`: group caps (3, total, 30 overall); the "hdfc" journey (two funds, one held by another member shows "Switches to <name>"); "sbi" alias through a small alias table you pass in or stub (the real alias helper `getAmcInfo` lives in a feature: **do not import it**; accept an optional `aliases?: (amcName: string) => string[]` parameter on `buildResults` and test with a stub); no fund-house row exists; a house with no holdings gives no rows; empty query with recents; pages "Coming soon" disabled and capped at two; category rows depend on `chipsAllowed`; scope rules for `switchTo` (one holder, several holders, in scope); transactions and stocks hand-off rows only when text qualifies; stopped SIPs appear; manager search matches only `main_manager`.

## Files you may change
Exactly: `frontend/src/components/search/{matcher,queryParser,buildResults,searchResultTypes}.ts` and `{matcher,queryParser,buildResults}.test.ts`. Anything else: stop and report.
## Do not touch
`searchTypes.ts`, every other file, `backend/**`, `frontend/src/mobile/**`, `package.json`, lockfiles. **Imports:** nothing under `components/search` may import from `frontend/src/features/*` (a later guard enforces it); only `searchTypes.ts` and your own files.

## Checks (PowerShell, from your clone)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-k1 test src/components/search
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-k1 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-k1 lint src/components/search
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run src/components/search`, `npx tsc -b`, `npx oxlint src/components/search`.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the exact exports (names and signatures); decisions the packet did not cover (list each); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-search-fe-1-packet.md (your task: search-fe-1)
Open Docs/orchestration/2026-11-09-search-bar-planning.html, the matching rules and the result-row table, for the detail. Work only in C:\Users\Ayush\ag-k1 on branch ag/k1-search. Pure logic: tests first (show them fail), then make them pass. Create only the files the packet lists; do not edit searchTypes.ts. Nothing under components/search may import from frontend/src/features. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
