# Packet: E-5b wire the date strip into Allocation and Other Analytics (Batch E, Antigravity)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner's date decisions of 23 Nov (`decisions.md`): a strip only on **Allocation** and **Other Analytics**; the per-card date lines go once the strip says it.
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-e-dates-plan.md` (Task E-5, step 4: the frame places the strip under the tabs; amendments at its end). The strip component and its logic exist and are tested (E-5: `frame/DateStrip.tsx`, `frame/stripEntries.ts`); you only **connect them to the data** and **remove the duplicates**. **The existing tests `stripEntries.test.ts` and `DateStrip.test.tsx` are fixed: do not edit them.**
**Worker:** Antigravity (Gemini). Frontend only. **Your clone:** `C:\Users\Dell\ag-e5b` (branch `ag/ag-e5b`, cut from `batch/e-dates`). Work only there. Never run a git command that changes anything. Never touch `backend/**`.
Read first: `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins), then this file; then open `frame/MutualFundsFrame.tsx`, `frame/DateStrip.tsx`, `frame/stripEntries.ts`, `data/analyticsStore.ts` (`useMfAnalytics`), `types.ts` (the section payload types) and the four cards named below.
**Checks:** `wsl.exe -d Ubuntu -- env UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash "/mnt/c/Users/Dell/ag-e5b/Docs/orchestration/wave-fe-check.sh" ag-e5b test src/features/mutual-funds` (also `types`, and `lint src/features/mutual-funds`).

## What to build
1. **`frame/TabDateStrip.tsx`** (new): `TabDateStrip({ tab }: { tab: MfTabId })` returns `null` for every tab except `allocation` and `analytics`; for those it renders one of two small inner components (so each calls its own hooks, never conditionally):
   - **Allocation:** `useMfAnalytics("asset_allocation")` gives `nav_as_of` and `holdings_as_of`; `useMfAnalytics("cap_allocation")` gives `classification_as_of`. Build `stripEntriesForTab("allocation", { pricesIso, holdingsIso, marketCapListIso })` from them (a `null` or missing payload means `null` dates: no entry, no crash). Older-holdings marker: `olderHoldingsMarker(...)` over the `coverage.funds` of the asset-allocation payload, if that payload carries `coverage` (read `types.ts`; if it does not, no marker and say so in the report).
   - **Other Analytics:** `useMfAnalytics("valuation")` gives `nav_as_of`, `holdings_as_of`, the ratio date (`pe.as_of_date`, else `pb.as_of_date`) and `coverage.funds` for the marker; `useMfAnalytics("ter")` gives `reference_period` for fees. Build `stripEntriesForTab("analytics", { pricesIso, holdingsIso, ratiosIso, feesIso })`.
   - Render `<DateStrip entries={...} olderMarkers={marker ? [marker] : []} />`. While a payload is still loading the strip simply shows the entries it has (it renders nothing when there are none); it never shows a spinner.
2. **`MutualFundsFrame.tsx`**: put the strip **under the tab bar, above the cards**, by returning it together with the tab bar from the `tabs` value (`<>{tabBar}<TabDateStrip tab={tab} /></>`), so `PageLayout`'s header slots (`search`, `actions`) are untouched. Change nothing else in the frame (another branch edits it next: keep your edit to these lines).
3. **Remove the duplicates** (the strip now says them; the cards keep everything else exactly as it is):
   - `allocation/AssetClassCard.tsx`: the `data-testid="as-on"` line (prices and holdings dates).
   - `allocation/MarketCapCard.tsx`: the dates in the `as-on` line go; **the sentence `No applicable AMFI classifications for these holdings.` stays exactly** (keep that line, drop only the date parts and the separators; when a classification date exists the line is simply not drawn).
   - `other/ValuationSpectrum.tsx`: the `valuation-dates` line; and in each metric's coverage line (`coverage-<kind>`) drop the ` · Ratios as on ...` part and keep `Ratio data cover X% of equity exposure`.
   - `other/TerLadder.tsx`: the `ter-ref` span (the fees date).
   Update the tests that asserted those lines (list each in the report): `AssetClassCard.test.tsx`, `MarketCapCard.test.tsx`, `ValuationSpectrum.test.tsx`, `TerLadder.test.tsx`; assert instead that the card has **no** date line, and add a test per tab in a **new** file `frame/TabDateStrip.test.tsx`: `Allocation shows prices, holdings and the market-cap list from the section payloads`; `Other analytics shows prices, holdings, ratios and fees`; `no other tab renders a strip`; `a missing payload leaves that entry out without a crash`; `the older-holdings marker appears only when a fund is tagged older than 60 days and its info names the fund`; `the strip sits under the tab bar and the page header slots are unchanged` (assert order in the DOM: tab bar, then strip, then the page content). Mock `useMfAnalytics` the way `ValuationByFund.test.tsx` does; invented fund names only.
4. **`guards.test.ts`**: bump the source-file count by exactly one (`TabDateStrip.tsx`; the file is `features/mutual-funds/guards.test.ts`, assertion `toHaveLength(58)` becomes `59`). That is the only edit allowed there.
Run `src/features/mutual-funds` whole (the page tests, `MutualFundsFrame.test.tsx`, route tests), `types`, `lint`.

## Files
**May change:** `frame/TabDateStrip.tsx` and `frame/TabDateStrip.test.tsx` (new), `frame/MutualFundsFrame.tsx` (the `tabs` value only), the four cards and their four tests, `guards.test.ts` (the count). **Do not touch:** `DateStrip.tsx`, `stripEntries.ts` and their tests, `lib/dataDates.ts`, `ValuationByFund.tsx`, `SectionCard.tsx`, any Home or fund-page file, `frontend/src/mobile/**`, `backend/**`, `package.json`, lockfiles. Anything else that needs an edit: stop and report it.
Rules: tokens only, no hex; no `any`, `parseFloat`, `toFixed`, `Intl.`, `console.`; no new requests (the section hooks share one store: **the route tests that count analytics requests must still pass**); plain words; no em dashes. You cannot see the screen: say so.

## Report (one block)
Lane `ag-e5b`; failing counts before and after with the exact commands; `git status --short`; every old assertion removed or edited (file, old text, new); whether the asset-allocation payload carries the coverage list for the marker; decisions the packet did not cover; anything not checked (visual); open questions. No narration.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-e5b-wire-strip-packet.md (your task: E-5b)
Work only in C:\Users\Dell\ag-e5b on branch ag/ag-e5b. Tests first for the new TabDateStrip (show them fail), then build, then remove the duplicate date lines and update their tests as the packet lists. Touch only the files the packet lists. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
