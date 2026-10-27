# Packet G7 for Gemini (Antigravity): Home news section and the greeting's top-mover link (Home front-end run 6)
**Status:** READY FOR GEMINI (written 27 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/home-frontend`, in the git worktree `/home/ayush/wt/home-fe` on WSL (open it in Antigravity as `W:\home\ayush\wt\home-fe`). G6 (page assembly, commit `20ba0c97`) is already on this branch; nobody else works in this folder.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-frontend-plan.md` task T10 (Section 8 News); the greeting link is register C99/C120 ("a small G3 and Movers change"). Signed-off copy and structure: the mockup `Docs/orchestration/2026-10-23-home-design-mockups.html` (section 8 and the `r1`, `openMover` code), layout `2026-10-23-home-layout.md` (section 8, states, refetch), register `ui-redesign-decisions-register.md` (C99, C117, C120, C140 to C146). **Backend contract:** the MERGED news route on `leapswitch-redesign` (`backend/app/api/home_news.py`, `backend/app/services/news/schemas.py` and `copy.py`, handoff `ui-redesign-NB-news-backend-handoff.md` section 5). This packet is the whole truth for this run: where the plan, the mockup and this packet differ, **this packet wins** (section 6 lists every difference and why). Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4. Data shapes: `frontend/src/features/home/types.ts` (the News types are already added); real backend answers: the 8 golden fixtures in `frontend/src/features/home/fixtures/news/` (orchestrator-owned, never edit; they are byte-for-byte copies of `backend/tests/fixtures/news/news_*.json`).

## What this run is, in one paragraph
The tests are **already written and committed red** (nine new test files, news fixtures, the News types, a fake-backend update, and three edits to `HomePage.test.tsx`). Write **four new files and make four small edits** so that they pass, one step at a time, running the checkpoint command after every step and keeping the real output. Do not change any test, `types.ts`, a fixture or `testing/homeApi.ts`. The News card shows one to three headlines for the holdings of the person (or family) being viewed, loads last, never blocks the page, hides itself when there is nothing to say, and has a "Why this?" popup, a refresh button and a 5-minute tab-return refetch. The greeting's top-mover name becomes a button that opens the movers popup.

## Rules (read twice)
1. **Scope.** Create **only** the four files and make **only** the four edits in section 3. Anything else (tests, `types.ts`, fixtures, `testing/`, `package.json`, earlier components, anything under `shell/`) is out of bounds.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution).
3. **Run the checkpoint command after every step** and keep its real output; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **No float formatting.** Never `parseFloat`, `toFixed` or `Intl` in any Home file, **comments included** (a guard test greps whole file text). Percentages and amounts shown in the News card are the server's text (`exposure_text`): display them untouched.
6. **No hard-coded colours in `.tsx` files** (no `#` followed by hex digits, no `rgb(`, comments included). Use the existing variables (`var(--ui-text)` and the others used by `Movers.tsx` and `WorthALook.tsx`). **Other features may not be imported** (`../../shell/...`, `../../lib`, `@/components/ui/...`, `@/lib/...` are allowed; `../dashboard`, `../auth/...` are not).
7. **Exact strings, test ids and attributes.** Every string, `data-testid`, `aria-*` and `title` in section 4 must be used exactly as written. A `data-testid` wrapper has no other role: do not add roles or labels to it.
8. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons, `@/` imports for UI-kit and lib code, relative imports for neighbours.
9. **If anything differs from this packet, stop and report it.**
10. **Run every command inside WSL** (Step 0). Never run two `vitest` or `tsc` commands at the same time.

## Step 0: environment check (do this first, and report the output)
Every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL: `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run and report the output of each:
```
git branch --show-current          # expect: feat/home-frontend
git log --oneline -4               # expect the top line to start with: test(home): failing tests for the news slot and the greeting link (G7)
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect exactly 24 error lines, all in test files: "Cannot find module" for './newsCopy', '../newsCopy', './NewsCategoryIcon', './News', './useNews'; "has no exported member 'getNews'"; "'onTopMover' does not exist" (2) and "openRequest" does not exist (16)
npx vitest run src/features/home/sections/Greeting.test.tsx src/features/home/sections/Movers.test.tsx   # expect: Test Files 2 passed (the earlier runs are present)
npx vitest run src/features/home                       # expect: Test Files 9 failed | 33 passed (42); Tests 38 failed | 485 passed | 1 skipped (524)  (red state)
npx vitest run src/shell src/App.test.tsx              # expect: Test Files 27 passed (27); Tests 348 passed (348)
```
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report**.

## Goal
Home section 8 (News) mounted where the empty marked slot was, plus the greeting's top-mover button, exactly as signed off, with every state of the news feed handled (items, general-only, stale, hidden, empty, disabled, loading, failed).
**Non-goals:** the failed-import banner (no backend route yet); a "See affected holdings" destination (greyed, as the layout says); fund pages (names stay greyed); the mockup's "Preview: general news" toggle (a design aid, not a feature); the About page credit (the GDELT credit is not on the card, owner decision E14 B); analytics tracking; any change to the shell, the kit, `types.ts` or the route.

## 3. File map
**Create (4), all under `frontend/src/features/home/`:**
- `newsCopy.ts`
- `components/NewsCategoryIcon.tsx`
- `useNews.ts`
- `sections/News.tsx`

**Edit (4, nothing else in these files):**
- `api.ts`: add `NewsResponse` to the type import and append `getNews` (Step 1).
- `sections/Greeting.tsx`: the `onTopMover` prop and the button (Step 5).
- `sections/Movers.tsx`: the `openRequest` prop and one effect (Step 5).
- `HomePage.tsx`: mount `News` in place of the slot, wire the link (Step 6).

**Do not touch:** every `*.test.ts(x)` file, `features/home/testing/`, `types.ts`, `fixtures/` (including `fixtures/news/` and `fixtures/newsFixtures.ts`), `package.json`, `package-lock.json`, `src/index.css`, `src/shell/**`, `src/components/ui/**`, `src/lib/**`, everything created in earlier runs, anything under `backend/` or `Docs/`.
**Tests to satisfy (committed; read each before its step):** `newsCopy.test.ts` (41), `api.news.test.ts` (5), `components/NewsCategoryIcon.test.tsx` (16), `useNews.test.tsx` (14), `sections/News.test.tsx` (34), `sections/Greeting.link.test.tsx` (9), `sections/Movers.open.test.tsx` (10), `HomePage.news.test.tsx` (22), `fixtures/newsFixtures.test.ts` (already green); three edited lines in `HomePage.test.tsx` (the id `home-news` replaces `home-news-slot`, and the old empty-slot test is replaced). `guards.test.ts` is checked at the end and scans your new files. `testing/homeApi.ts` is the fake backend: it now answers `news` from the golden fixtures (family: `news_specific_three`, member: `news_member_debt`) and lets a test override one answer.
**Available to import:** `./api` (`getNews`), `./useHomeSection`, `../../lib/apiClient` (`invalidateApiCache`), `./types`, `@/components/ui/dialog` (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`), `@/components/ui/skeleton`, `lucide-react` (all 14 icons named in Step 2 exist in the installed version).

## 4. Specifications

### Step 1: `newsCopy.ts` and the `api.ts` edit
Read `newsCopy.test.ts` and `api.news.test.ts`.
- `api.ts`: add `NewsResponse` to the existing `import type { ... } from "./types"` list (alphabetical, after `MoversView`) and append at the end of the file, written exactly like the other fetchers:
```ts
export async function getNews(
  scope: HomeScopeArg,
  signal?: AbortSignal
): Promise<NewsResponse> {
  const res = await authFetch(homePath(scope, "news"), { signal });
  return res.json();
}
```
(`homePath` already accepts `"news"`: the section name was added to `types.ts`.)
- `newsCopy.ts` exports (types from `./types`):
  - `NEWS_GENERAL_NOTE` = `"Nothing specific to your holdings right now. Showing general market news."`
  - `NEWS_WHY_TEXT` = `"A headline appears only when it matches something you hold. We look at your stocks first, then fund categories, fund houses, asset classes, sectors and rates. If nothing specific matches, general market news is shown. The card never changes on a timer."`
  - `NEWS_HOW_WE_PICK: readonly string[]`, the seven lines in this order: `"Stocks you hold (your 5 largest)"`, `"Fund categories you hold"`, `"Fund houses you hold"`, `"Asset classes, such as gold or debt"`, `"Sectors"`, `"Interest rates and the economy"`, `"General market news, only when nothing above matches"`.
  - `NEWS_HOW_NOTE` = `"The card changes only when a matching headline arrives or your holdings change, never on a timer. A specific headline stays for one day, a general one for three."`
  - `newsAge(publishedAt: string, nowIso: string): string`. `seconds = Math.floor((Date.parse(nowIso) - Date.parse(publishedAt)) / 1000)`. If `!(seconds >= 60)` return `"just now"` (this also covers a negative age and an unparsable date). Otherwise `minutes = Math.floor(seconds / 60)`; under 60 return `` `${minutes} min ago` ``; `hours = Math.floor(minutes / 60)`; under 24 return `` `${hours} h ago` ``; else `` `${Math.floor(hours / 24)} d ago` ``.
  - `staleLabel(feedAsOf: string, nowIso: string): string` = `` `Updated ${newsAge(feedAsOf, nowIso)}` ``.
  - `newsKindLabel(item: Pick<NewsItemOut, "kind" | "icon_key">): string`: `stock` "Company news"; `fund_category` "Fund category"; `fund_house` "Fund house"; `asset_class` "Gold and silver"; `sector` "Sector news"; `rates_macro` "Rates and macro"; for `general`: icon `regulation` "Regulation", `markets` "Markets", `rates_rbi` "Rates and macro", any other icon "Market news".
  - `newsMetaLine(item: NewsItemOut, nowIso: string): string` = `` `${newsKindLabel(item)} · ${item.source} · ${newsAge(item.published_at, nowIso)}` `` (the separator is the middle dot `·` with a space each side).
  - `isSafeUrl(url: string): boolean` = `/^https?:\/\//i.test(url)`.
  - `hasNewsToShow(data: NewsResponse | null): boolean` = `data !== null && data.enabled && data.state === "items" && !data.hidden && data.items.length > 0`.
  - `isGeneralOnly(items: readonly NewsItemOut[]): boolean` = `items.length > 0 && items.every(item => !item.specific)`.
  - Why the clock is the server's: every age is measured against the response's own `computed_at`, never the browser clock, so a wrong laptop clock cannot disagree with the server's stale (over 36 h) and hidden (over 72 h) rules, and the tests are deterministic.
**Checkpoint 1** (from `frontend/`): `npx vitest run src/features/home/newsCopy.test.ts src/features/home/api.news.test.ts src/features/home/api.test.ts src/features/home/api.encode.test.ts` → expect **Test Files 4 passed, Tests 65 passed** (41 + 5 new, plus the 16 and 3 already there).

### Step 2: `components/NewsCategoryIcon.tsx`
Read `NewsCategoryIcon.test.tsx`. Export `NewsCategoryIcon({ iconKey }: { iconKey: NewsIconKey })`. It renders one tile:
`<span data-testid="news-icon" data-icon={name} aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ui-card)] text-[var(--ui-text)]">` containing the lucide icon at `size={20}` with `aria-hidden`. The 14 keys map to these lucide icons (`data-icon` is the kebab name): `banks_financials` Landmark `landmark`; `it_tech` Cpu `cpu`; `pharma_health` Pill `pill`; `auto_ev` Car `car`; `consumer_fmcg` ShoppingBasket `shopping-basket`; `energy` Fuel `fuel`; `metals_mining` Pickaxe `pickaxe`; `realty_infra` Building2 `building-2`; `gold_silver` Coins `coins`; `rates_rbi` Percent `percent`; `funds_amc` ChartPie `chart-pie`; `markets` ChartCandlestick `chart-candlestick`; `regulation` Scale `scale`; `general` Newspaper `newspaper`. Keep the table as one `Record<NewsIconKey, { name: string; Icon: ComponentType<...> }>` constant. An unknown key (the backend may add one) falls back to the `general` entry: `ICONS[iconKey] ?? ICONS.general`.
**Checkpoint 2:** `npx vitest run src/features/home/components/NewsCategoryIcon.test.tsx` → expect **16 passed**.

### Step 3: `useNews.ts`
Read `useNews.test.tsx` (14 tests). Exports: `NEWS_FOCUS_THROTTLE_MS = 5 * 60 * 1000`, the type `NewsSection` and the hook `useNews(scope: HomeScopeArg, scopeKey: string): NewsSection`, where `NewsSection = { status: "loading" | "data" | "error"; data: NewsResponse | null; refreshing: boolean; refresh: () => void }`. Write it exactly like this (the logic is subtle; do not restructure it):
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { invalidateApiCache } from "../../lib/apiClient";
import { getNews } from "./api";
import type { HomeScopeArg, NewsResponse } from "./types";
import { useHomeSection } from "./useHomeSection";

export const NEWS_FOCUS_THROTTLE_MS = 5 * 60 * 1000;

export interface NewsSection {
  status: "loading" | "data" | "error";
  data: NewsResponse | null;
  refreshing: boolean;
  refresh: () => void;
}

// The first answer comes from useHomeSection like every other section. A later refresh (the button, or
// coming back to the tab) keeps the headlines on screen and swaps them when the new answer arrives; a
// failed refresh changes nothing. Changing scope forgets all of it, so one member's news never shows
// under another.
export function useNews(scope: HomeScopeArg, scopeKey: string): NewsSection {
  const base = useHomeSection(signal => getNews(scope, signal), [scopeKey]);

  const [latest, setLatest] = useState<{ key: string; data: NewsResponse } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const keyRef = useRef(scopeKey);
  keyRef.current = scopeKey;
  const inFlight = useRef<AbortController | null>(null);
  const checkedAt = useRef<number | null>(null);

  useEffect(() => {
    if (base.status === "data") checkedAt.current = Date.now();
  }, [base.status, base.data]);

  useEffect(() => {
    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
      checkedAt.current = null;
      setLatest(null);
      setRefreshing(false);
    };
  }, [scopeKey]);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const key = keyRef.current;
    checkedAt.current = Date.now();
    setRefreshing(true);
    // The client caches GET answers for a minute; a refresh must reach the server.
    invalidateApiCache();
    getNews(scopeRef.current, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setLatest({ key, data });
      })
      .catch(() => {})
      .finally(() => {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setRefreshing(false);
        }
      });
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (checkedAt.current === null) return;
      if (Date.now() - checkedAt.current < NEWS_FOCUS_THROTTLE_MS) return;
      refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refresh]);

  const fresh = latest !== null && latest.key === scopeKey ? latest.data : null;
  return {
    status: fresh ? "data" : base.status,
    data: fresh ?? base.data,
    refreshing,
    refresh,
  };
}
```
Why each part: the first request is `useHomeSection`, so a scope change shows a skeleton with no old data; `invalidateApiCache()` because the shared client would otherwise answer a refresh from its 60-second cache; one refresh at a time; a refresh answer that arrives after a scope change is dropped (`aborted`); the five-minute wait counts from the last answer or refresh start and is measured with `Date.now()`; nothing happens before the first answer (`checkedAt` is `null`) or when the tab is being hidden.
**Checkpoint 3:** `npx vitest run src/features/home/useNews.test.tsx` → expect **14 passed**.

### Step 4: `sections/News.tsx`
Read `News.test.tsx` (34 tests). Export `News` and the type `NewsProps = { status: "loading" | "error" | "data"; data: NewsResponse | null; refreshing: boolean; onRefresh: () => void }`. Local state: `openId: string | null` (the item whose popup is open) and a ref `returnFocus: HTMLElement | null`.
**States.**
- `status === "loading"`: `<section role="status" aria-label="Loading news" className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 space-y-4">` with a `Skeleton` `h-6 w-56` and three `Skeleton` `h-14 w-full rounded-lg`.
- Otherwise, when `status !== "data"` or `data === null` or `!hasNewsToShow(data)`: **return `null`** (a failed request, a hidden feed (over 72 h), an empty feed, a switched-off feed and "no items" all show nothing: no message, no retry; the page never blocks on news).
**The card** (`now = data.computed_at`): `<section aria-labelledby="news-title" className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">` (a region named by its heading), containing in this order:
1. A header row `flex items-start justify-between gap-3`: left, `<h3 id="news-title" className="text-base font-semibold text-[var(--ui-text)]">{data.texts.title}</h3>` and under it `<p data-testid="news-subtext" className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{data.texts.subtext}</p>`; right, the refresh button: `<button type="button" aria-label="Refresh news" aria-busy={refreshing} title=...>` with the `RefreshCw` icon (`size={16}`, `aria-hidden="true"`, class `animate-spin` only while `refreshing`). `title` is `staleLabel(data.feed_as_of, now)` when `feed_as_of` is not null, else `"Refresh news"`. `onClick` calls `onRefresh()` **only when not `refreshing`**. Button classes: `rounded-lg p-1.5 text-[var(--ui-text-muted)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]`.
2. When `data.stale && data.feed_as_of`: `<p data-testid="news-stale" className="mt-2 text-xs text-[var(--warn-text)]">{staleLabel(data.feed_as_of, now)}</p>` (it follows the server's `stale` flag, not your own arithmetic).
3. When `isGeneralOnly(data.items)`: `<p data-testid="news-general-note" className="mt-2 text-sm text-[var(--ui-text-muted)]">{NEWS_GENERAL_NOTE}</p>`.
4. `<ul className="mt-3 divide-y divide-[var(--ui-divider)]">` with one `<li key={item.id} data-testid={`news-item-${item.id}`} className="relative flex gap-3 rounded-lg px-2 py-3 hover:bg-[var(--ui-row-hover)]">` per item, **in the order sent**. Inside: `<NewsCategoryIcon iconKey={item.icon_key} />` and `<div className="min-w-0 space-y-0.5">` with
   - the headline: when `isSafeUrl(item.url)`, `<a data-testid="news-headline" href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold leading-snug text-[var(--ui-text)] hover:underline after:absolute after:inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{item.headline}</a>` (the `after:` classes stretch the link over the whole row); otherwise a plain `<span data-testid="news-headline" className="text-sm font-semibold leading-snug text-[var(--ui-text)]">{item.headline}</span>` (never a link for an address that is not http or https);
   - `<div data-testid="news-meta" className="text-xs text-[var(--ui-text-muted)]">{newsMetaLine(item, now)}</div>`;
   - **only when `item.specific`**: `<div data-testid="news-exposure" className="text-xs text-[var(--ui-text-muted)]">` holding, when `item.exposure_text` is not null, the text then ` · ` (middle dot, one space each side), and then the button `<button type="button" aria-label={`Why this? ${item.headline}`} className="relative z-10 font-medium text-[var(--ui-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">Why this?</button>`. Its `onClick` stores `event.currentTarget` in `returnFocus.current` and calls `setOpenId(item.id)`. (`relative z-10` keeps it above the stretched link, so pressing it does not open the publisher.) A general headline has no exposure line and no button. With no `exposure_text` (low coverage) the line is just the button.
5. `<p data-testid="news-disclaimer" className="mt-3 text-xs text-[var(--ui-text-muted)]">{data.texts.disclaimer}</p>` as the **last child of the section before the dialog** (the test checks that it is the section's last element, so the dialog, which renders in a portal, adds no element there).
6. The popup, at the end of the section: `<Dialog open={opened !== undefined} onOpenChange={next => { if (!next) setOpenId(null); }}>` where `opened = data.items.find(item => item.id === openId)`. `<DialogContent onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus(); }}>` (returns focus to the Why this? button, as the Ask Mira dialog does) containing:
   - `<DialogHeader>` with `<DialogTitle>Why this?</DialogTitle>` and `<DialogDescription data-testid="why-reason" className="font-semibold text-[var(--ui-text)]">{opened?.reason}</DialogDescription>`;
   - `<p className="text-sm text-[var(--ui-text-muted)]">{NEWS_WHY_TEXT}</p>`;
   - **only when `opened.funds.length > 0`**: a block with `<h4 className="text-xs font-medium text-[var(--ui-text-muted)]">Funds involved</h4>`, `<ul data-testid="why-funds" className="divide-y divide-[var(--ui-divider)]">` with one `<li key={fund.scheme_id} className="py-2 text-sm">` per fund (order as sent) holding `<span aria-disabled="true" title="Coming soon" className="cursor-not-allowed text-[var(--ui-disabled-text)]">{fund.name}</span>`, and after the list `<span aria-disabled="true" title="Coming soon" className="inline-block cursor-not-allowed text-sm text-[var(--ui-disabled-text)]">See affected holdings</span>` (greyed text, not a button and not a link, as in the Movers footer);
   - `<details data-testid="why-how" className="text-sm text-[var(--ui-text-muted)]">` with `<summary className="cursor-pointer font-medium text-[var(--ui-text)]">How we pick these headlines</summary>`, an `<ol className="mt-2 list-decimal space-y-1 pl-5">` with one `<li key={step}>` per `NEWS_HOW_WE_PICK` entry, and `<p className="mt-2 text-xs">{NEWS_HOW_NOTE}</p>`.
**Checkpoint 4:** `npx vitest run src/features/home/sections/News.test.tsx` → expect **34 passed**.

### Step 5: the greeting link (`Greeting.tsx` and `Movers.tsx`)
Read `Greeting.link.test.tsx` (9) and `Movers.open.test.tsx` (10).
**`Greeting.tsx`.** Add `onTopMover?: () => void;` to `GreetingProps` and to the destructured props. After `const sentence = buildStatusSentence(summary);` add:
```ts
  // The closing clause "<name> drove most of the gains." makes the name a button (register C99): found by
  // the clause, not by the name alone, because the same words can also appear earlier in the sentence.
  const topName = summary.top_contributor;
  const clauseAt =
    sentence && onTopMover && topName ? sentence.lastIndexOf(` ${topName} drove most of`) : -1;
```
and replace the single `{sentence}` child of the `<p data-testid="greeting-sentence" ...>` by:
```tsx
          {clauseAt >= 0 && topName ? (
            <>
              {sentence.slice(0, clauseAt + 1)}
              <button
                type="button"
                data-testid="greeting-top-mover"
                aria-haspopup="dialog"
                onClick={onTopMover}
                className="font-semibold text-[var(--ui-text)] underline decoration-[var(--ui-accent)] underline-offset-[3px] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
              >
                {topName}
              </button>
              {sentence.slice(clauseAt + 1 + topName.length)}
            </>
          ) : (
            sentence
          )}
```
The sentence's text must stay identical to `buildStatusSentence(summary)` (the button only wraps the name). Nothing else in the file changes.
**`Movers.tsx`.** Add to `MoversProps`: `openRequest?: { name: string; token: number } | null;` (with the comment `// Set by the greeting's top-mover link: open the popup of the row with this label once the fund rows are showing.`), destructure it with the default `openRequest = null`, and add this just before the `if (status === "loading")` early return (the component already imports `useRef` and `useEffect`):
```ts
  // Each request is handled once, even if the user closes the popup and the rows are reloaded.
  const handledToken = useRef<number | null>(null);
  useEffect(() => {
    if (!openRequest || handledToken.current === openRequest.token) return;
    if (status !== "data" || !data || data.view !== "fund" || view !== "fund") return;
    handledToken.current = openRequest.token;
    const bar = [...data.gains, ...data.losses].find(row => row.label === openRequest.name);
    if (bar) setOpened({ bar, view: "fund" });
  }, [openRequest, status, data, view]);
```
Why it waits for `data.view === "fund"`: when the page switches the grouping, the movers keep their old rows on screen until the fund rows arrive (stale-while-loading); the request must open the popup on the fund rows, not on the old ones. Opening reuses the existing `opened` state, so the existing focus effect moves focus into the dialog.
**Checkpoint 5:** `npx vitest run src/features/home/sections/Greeting.link.test.tsx src/features/home/sections/Movers.open.test.tsx src/features/home/sections/Greeting.test.tsx src/features/home/sections/Movers.test.tsx` → expect **Test Files 4 passed, Tests 57 passed**.

### Step 6: `HomePage.tsx`
Read `HomePage.news.test.tsx` (22 tests) and the three edited places in `HomePage.test.tsx`. Five small changes:
1. Imports: `import { News } from "./sections/News";` after the `Movers` import, and `import { useNews } from "./useNews";` before the `useStaleWhileLoading` import.
2. State, after `miraOpen`: `const [topMoverRequest, setTopMoverRequest] = useState<{ name: string; token: number } | null>(null);`
3. Right after `const movers = useStaleWhileLoading(moversRaw, scopeKey);` add (the news hook goes **after** every other section hook, so its request is sent last):
```ts

  // Last, so the request goes out after the other sections' requests.
  const news = useNews(scope, scopeKey);
```
4. Before `handleBenchmarkChange` add:
```ts
  // The greeting's top mover: show the Fund grouping and open that fund's popup in the movers card.
  const handleTopMover = () => {
    const name = summary.data?.top_contributor;
    if (!name) return;
    setMoversView("fund");
    setTopMoverRequest(previous => ({ name, token: (previous?.token ?? 0) + 1 }));
  };
```
   and pass the two new props: `onTopMover={handleTopMover}` on `<Greeting>` (after `onImport`) and `openRequest={topMoverRequest}` on `<Movers>` (after `onRetry`).
5. Replace the two lines of the news slot (the `{/* NEWS SLOT ... */}` comment and `<div data-testid="home-news-slot" aria-hidden="true" />`) by:
```tsx
          <div data-testid="home-news" className="empty:hidden">
            <News
              status={news.status}
              data={news.data}
              refreshing={news.refreshing}
              onRefresh={news.refresh}
            />
          </div>
```
It stays inside the existing `!noHoldings` fragment, after the `home-worth` wrapper and outside `home-grid` (full width). Nothing else in the file changes.
**Checkpoint 6:** `npx vitest run src/features/home/HomePage.news.test.tsx src/features/home/HomePage.test.tsx src/features/home/HomePage.controls.test.tsx src/features/home/HomeRoute.test.tsx` → expect **Test Files 4 passed, Tests 83 passed**.

### Step 7: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/home                        # expect: no output, exit code 0 (this version prints nothing when clean)
npx vitest run src/features/home --maxWorkers=4     # expect: Test Files 42 passed (42); Tests 628 passed | 1 skipped (629)
npx vitest run src/shell src/App.test.tsx --maxWorkers=4   # expect: Test Files 27 passed (27); Tests 348 passed (348)
npx vitest run src/components/ui/charts src/lib src/styles # expect: Test Files 16 passed, Tests 188 passed
npm run build                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short                         # expect exactly the eight lines below
```
The one skipped test is the "matches the backend's generated set" file comparison, which skips itself when the `backend/tests/fixtures/news` folder is not in the checkout (it is not on this branch); that is expected.
Expected `git status --short`:
```
 M frontend/src/features/home/HomePage.tsx
 M frontend/src/features/home/api.ts
 M frontend/src/features/home/sections/Greeting.tsx
 M frontend/src/features/home/sections/Movers.tsx
?? frontend/src/features/home/components/NewsCategoryIcon.tsx
?? frontend/src/features/home/newsCopy.ts
?? frontend/src/features/home/sections/News.tsx
?? frontend/src/features/home/useNews.ts
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3; a command needs `npm install`.

## 5. Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT — ui-redesign — G7 (Home news section and the greeting's top-mover link)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all seven):
1. FILES CREATED AND EDITED (exact paths):
2. CHECKPOINTS: for each of 1 to 6, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 7), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched: yes/no; types.ts, fixtures and testing/ untouched: yes/no; files outside the file map untouched: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## 6. Spec conflicts, defaults and backend asks (not for Gemini; for the orchestrator and the register)
**Conflicts found and how this packet resolves them (precedence: mockup, register and owner decisions, design docs, plan; a backend text the owner decided counts as an owner decision):**
- **Card title and footer.** The mockup says "Top news affecting your portfolio" and a footer "Headlines about companies your funds hold. Not investment advice."; the merged backend sends `texts.title` "News affecting top holdings" (owner decision E8 c, the title from the PDF), `texts.subtext` and `texts.disclaimer`. Default: the page shows the backend's three texts (title, a small subtext line under it, the disclaimer as the last line) and never hard-codes them. Owner may veto and ask for the mockup wording.
- **Top-mover link target.** The mockup links the top *sector* gain and opens the *sector* popup; the real `top_contributor` the server sends is a *fund* name. Default: the button switches the Movers card to the Fund grouping and opens that fund's popup (the popup then lists that one fund). If the fund is not among the four rows the fund view shows (it can be in "others"), only the grouping switches. Matching is by name because the response carries no id (backend ask 2).
- **Kind label.** The mockup's "Company results" does not fit every stock headline; default "Company news" (full table in Step 1).
- **Mockup popup amounts.** The mockup's "Funds involved" rows show a percentage per fund; the contract gives names only. Default: names only, greyed (backend ask 1).
- **Mockup "A headline stays for one day".** The backend keeps general headlines three days (specific one day). Default: the wording says so (Step 1, `NEWS_HOW_NOTE`).
- **Mockup toast on refresh** ("Checked for new headlines...") has no toast machinery in the front end: the button spins and sets `aria-busy`; its tooltip shows the feed's last update.
- **Mockup "Preview: general news" link** is a design aid: not built.
**Defaults taken, needing register entries (C149, numbered here for the entry):**
1. The card shows the backend texts (title, subtext, disclaimer); the GDELT credit string is not shown (E14 B).
2. Meta line = kind label, publisher, age; labels as in Step 1; ages are measured against the response's `computed_at` ("just now", "N min ago", "N h ago", "N d ago").
3. Error, hidden (over 72 h), empty, disabled and no-items all show no section and no message (layout F-row); loading shows a skeleton card; no retry control.
4. Stale (server flag, over 36 h) keeps the headlines and adds "Updated N d ago" under the title.
5. "Why this?" only on specific headlines; the popup shows the reason, the explanation, the funds (greyed names, at most the five the server sends), a greyed "See affected holdings" (only when funds are listed) and a collapsed "How we pick these headlines" list; focus returns to the button on close.
6. The whole row opens the publisher in a new tab (stretched link, `noopener noreferrer`); an address that is not http or https is shown as plain text.
7. Refresh: button with spinner and `aria-busy`, one request at a time, bypasses the 60-second client cache, keeps the old headlines on a failure; no toast. Tab return refetches when five minutes have passed since the last answer or refresh start (throttle measured with `Date.now()`).
8. The news request is sent after the other sections' requests and is never repeated by period, benchmark or movers changes; a scope change shows a skeleton, never another member's headlines.
9. The news section is inside the "has holdings" part of the page (hidden with the other sections for an empty portfolio); the wrapper id is `home-news` (replacing `home-news-slot`).
10. Greeting top mover: button inside the sentence (shown only when the server names a contributor and the day is not flat); click switches Movers to Fund and opens that fund's popup (see conflicts).
**Backend asks (additive; none blocks the run, the element is hidden or reduced by default):** (1) optional per-fund weight or amount on `NewsFundOut` so the popup can show the mockup's percentages; (2) an id (scheme id) next to `top_contributor` on the summary so the greeting link can match a Movers row without comparing names. **Still open elsewhere:** the failed-import banner (needs the import-status backend route).
**Verification record (orchestrator, 27 Oct):** the reference solution at `C:\Users\Dell\Desktop\MVP v1\ref\home-fe-ref-g7` passes: `tsc -b` exit 0, `oxlint src/features/home` exit 0, Home folder 42 files / 628 passed + 1 skipped, shell + App 27 / 348, kit (`charts`, `lib`, `styles`) 16 / 188, `npm run build` ok. Baseline before the red commit: Home 33 / 465, shell + App 27 / 348 (both confirmed on G6 `20ba0c97`). Mutation checks on the reference (all caught except one equivalent mutant): refresh without cache invalidation, throttle boundary, news hook first, handled-request token, link without `noopener`, Why this? on general rows, scope-return stale data.

## 7. Gemini prompt (paste into the Gemini window for folder `W:\home\ayush\wt\home-fe`)
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\home-fe (WSL path /home/ayush/wt/home-fe, branch feat/home-frontend). Before anything else run `git status --short` and `git log --oneline -3`; the first must print nothing and the top commit must be the red-test commit the packet names (test(home): failing tests for the news slot and the greeting link (G7)). If not, STOP and report; do not fix it yourself. Read, completely and in order, Docs/orchestration/ui-redesign-G7-home-news-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-G7-home-news-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already written and red; you create the four implementation files and edit only the four files the packet names (api.ts, Greeting.tsx, Movers.tsx, HomePage.tsx), exactly as specified. Never edit a test, fixture, types.ts or testing/homeApi.ts, never run npm install, never commit. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe ...) and never run two vitest or tsc commands at once. If tests time out under load, rerun with --maxWorkers=4. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```
