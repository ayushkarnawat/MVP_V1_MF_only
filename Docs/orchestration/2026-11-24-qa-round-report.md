# QA round report, M1 to M4 (24 Nov 2026; owner's run on staging, Chrome and Edge)
Source: the owner's stage-by-stage results and six screenshots, read against `2026-11-19-combined-qa-checklist.md`. **Nothing has been fixed or changed yet; this is the report only.** Each defect below becomes a failing test first, then a fix, then a patch deploy, after the owner decides what to do with each.

## 1. Summary
| | Count |
|---|---|
| Rows in the checklist | 82 (M1 22, M2 28, M3 16, M4 16) |
| Rows passed (some with a note) | 74 |
| Failed | 2 (M2-06 on Performance, known and being fixed in another session; M4-12, see D-2) |
| Not run | 6 (M1-11, M1-17, M1-18, M1-19, M2-03, M2-04); partly run: M4-13 (Firefox and Safari not tried) and M2-02 (Corporate Bond not held) |
| Defects and changes found (section 2) | 12 |

**The two that matter most:** the Head of Family dialog (D-11) stopped Stage 9, so the four emails (M1-17 to M1-19) are untested; and the category average and rank counts disagree at 1 year (D-12), which looks like a real number defect, not a look defect.

## 2. Defects and changes, in the order I suggest looking at them
Type: **Bug** (wrong behaviour), **Design** (look or wording), **Decision** (needs the owner first), **Perf** (speed).

| ID | Type | Row | What was seen | My reading | Needs |
|---|---|---|---|---|---|
| D-11 | Bug or UX (check first) | Stage 9 | The "Choose who will be Head of Family" dialog shows every member greyed with "Finish or cancel the statement you are importing first." and Next disabled, though all details were added | The text is the guard `import_in_progress` (`ChangeHeadDialog.tsx`). The earlier screenshot shows a CAMS request still open ("Waiting for CAMS email", 0 of 5 done, importing for ROHAN VIJAY KULKARNI). **Most likely a pending import blocks the change by design.** Real problems either way: (a) the dialog does not say which import or give a way to cancel it, (b) if a stale request is blocking after "Cancel request", that is a real bug. **Test:** on the import page press "Cancel request", then reopen the dialog; if it is still blocked, it is a bug | Owner re-test, then fix (a) at least |
| D-12 | **Bug (numbers)** | M2-01 (looks like it passed but does not hold) | Rank pool and category-average pool differ at 1 year. Screenshots 4 and 5: HDFC Flexi Cap rank 19 of **42** (1Y) but "Category average covers **37** funds (1Y), 37 (3Y), 27 (5Y)"; Axis Midcap 7/**30** vs **28**; ICICI Large Cap 32/**32** vs **30**; Nippon Small Cap 22/**30** vs **25**; Kotak Flexi Cap 32/**42** vs **37**. At 3Y and 5Y the two counts match in all five funds (37, 28, 30, 25, 37 and 27, 21, 27, 21, 27) | The M2 promise was "the category average uses exactly the same funds as the ranking, so the two always agree" (M2-01: "N is the same in the ranking and in the category average card"). At 1Y they do not, in every fund seen. The 1Y average count equals its 3Y count each time, so the average's 1Y pool looks limited to funds that also have 3 years of history, while the rank's 1Y pool is not. Inference from screenshots only; needs a look at the pool code and a check on the data | Investigate, then fix and test |
| D-2 | Decision (browser limit) | M4-12 | Request from CAMS opens the floating checklist, with its own "Open the CAMS form" button; the owner wants the click to go straight to the CAMS site, with the checklist floating above that tab | This is the H-7 spike result (23 Nov): in Chrome one click can open the floating window or a new tab, **not both, in either order**. The current design (checklist first, button inside it opens CAMS) was the recommendation, with the owner's yes still marked open. The owner's wish needs both from one click | Owner decision: see options in section 4 |
| D-1 | Design (whole app) | M1 screens | Green buttons show black text on sign-up, log-in and onboarding; the owner wants white on every green button, checked across the whole app | Earlier rows set "white on the deep green" (M1-12) but "dark label on the bright green" (M2-10), and the palette reference has no text-on-green rule. White on the **bright** green is low contrast (roughly 2 to 1; accessibility wants 4.5 to 1 for button text); on the **deep** green it is fine | Owner decision: which greens go white, see section 4 |
| D-3 | Design | M3-2 | The first time the search box opens, only an empty white strip drops below it (screenshot 1) | The empty-box state shows nothing until recents exist | Show a hint, recents or a short "Try a fund, a member, a page" line; never an empty strip |
| D-4 | Bug (look) | M3-2 | On a member result, the "Switches to PRIYA ROHAN KULKARNI" badge shows **twice** on hover (screenshot 3) | A result's action badge is drawn twice (once as chip, once on hover) | Fix and a test |
| D-5 | Design | M2-15 | Nothing says "choose up to 3" before the limit is hit, or why a fourth box is blocked | The message "Choose up to 3" exists only on the blocked tick | Add a standing hint ("Choose up to 3") in the control |
| D-6 | Design | M2-21 | "View all by day's change" does not feel clickable | Link style is too quiet | Underline or button treatment on hover and at rest |
| D-7 | Design | M3-12 | The small icon (the owner wrote "eye"; I read it as the "i" info icon) is hard to see | Contrast too low | Larger or darker icon, stronger hover |
| D-8 | Design | M1-02 | Onboarding icons look plain and generated | Placeholder-style icons | Designer's pass |
| D-9 | Design (wording) | M4-3 | The "Keep working" button on the export progress is unclear | It means "close this and keep using the app while the PDF prepares" (`ExportDialog.tsx`, `onKeepWorking`) | Two to three words, for example **"Run in background"** or "Continue browsing"; owner picks |
| D-10 | Perf | M4-3, M4-8 | Export takes very long, especially from "building the pages" onward | Not measured yet. Suspects: 24 sections drawn one after another, the 90-second ready wait, and the second print pass for the page numbers | Need the real times (how many minutes for which household and sections) and the VM log timings before changing anything |

## 3. Observations that are not defects
- **Side rail on Mutual Funds tabs:** only Overview, Performance, Allocation, Overlap and Other Analytics have the "On this page" rail; Holdings and Transactions do not. This is **as built and as documented** (the M3 guide lists those five). Adding it to the other two is an enhancement the owner may want.
- **M2-05 on the Holdings column and M2-06 on Performance:** the owner knows the fix is in progress in another session; nothing to do here. (M2-06 passed on Holdings, failed on Performance.)
- **M2-02:** Large & Mid Cap (Direct) shows **out of 33** (Mirae Asset Large & Midcap, 1Y: 25/33), which matches the expected 33 (was 32), so this is a **pass for that fund**. Corporate Bond (Direct) is not held, so its expected 21 is **not verified**. (The "5 of 21 comparisons" line in the intro counts fund-and-period comparisons, 7 funds times 3 periods; it is not the Corporate Bond count.)
- **M2-04:** the screenshot holds no Sectoral/Thematic or Liquid fund (categories shown: Flexi Cap, Mid Cap, Large Cap, Small Cap, ELSS, Large & Mid Cap, Index Funds), so the 0.27% and 13.80% / 2.13% and 4.28% figures **cannot be checked from it**. Mark **not run** until such a fund is held.
- **M2-13 (digest mail):** taken as reported (it needs the morning mail after the run).

## 4. Decisions the owner needs to make
1. **D-2 (floating checklist):** options: (a) **keep** the current design (checklist opens first, its first-step button opens CAMS), the form the spike recommended; (b) **CAMS opens as before** (the click goes to CAMS) and the checklist appears as the in-page panel plus a "Float this checklist" button the user clicks when back on Unifolio (floating cannot start from the CAMS tab); (c) a short new test of other orders and the browser's picture-in-picture rules before deciding (a few hours; may still say no).
2. **D-1 (green buttons):** white on every green, or white on the deep green and keep dark on the bright green for contrast? If white everywhere, the bright green should be darkened a little so white reads.
3. **D-9:** the new button wording.
4. **D-11:** re-test (cancel the pending request, reopen the dialog) before I spend time on it.
5. **D-10:** send the real times so the speed work starts from numbers.

## 5. Full results by row
**M1:** 01 pass · 02 pass (icons, D-8) · 03 pass · 04 pass · 05 pass · 06 pass · 07 pass · 08 pass · 09 pass · 10 pass · **11 not run** (no 11 mailboxes) · 12 pass · 13 pass · 14 pass · 15 pass · 16 pass · **17 not run** · **18 not run** · **19 not run** (all three blocked by D-11) · 20 pass · 21 pass · 22 pass.
**M2:** 01 pass (but D-12) · 02 pass for Large & Mid Cap, Corporate Bond not verified · **03 not run** · **04 not run** · 05 pass on Home, Holdings deferred to the other session · **06 fail on Performance (known, other session)**, pass on Holdings · 07 pass · 08 pass · 09 pass · 10 pass · 11 pass · 12 pass · 13 pass (as reported) · 14 pass · 15 pass (D-5) · 16 pass · 17 pass · 18 pass · 19 pass · 20 pass · 21 pass (D-6) · 22 to 28 pass.
**M3:** 1 pass · 2 pass (D-3, D-4) · 3 pass · 4 pass on every tab · 5 pass · 6 pass · 7 pass · 8 pass · 9 pass (rail absent on two tabs, as designed) · 10 pass · 11 pass · 12 pass (D-7) · 13 pass · 14 pass · 15 pass · 16 pass.
**M4:** 1 pass · 2 pass · 3 pass (D-9, D-10) · 4 pass · 5 pass · 6 pass · 7 pass · 8 pass (D-10) · 9 pass · 10 pass · 11 pass · **12 fail (D-2)** · 13 pass in Chrome and Edge, **Firefox and Safari not run** · 14 pass · 15 pass · 16 pass.

## 6. Still to do for a clean sign-off
- Stage 9 (the four Head of Family emails, M1-17 to M1-19) after D-11 is understood.
- M1-11 (needs 11 mailboxes, or a test run by the manager against the staging back end with scripted requests), M2-03 and M2-04 (need an IDCW or Bonus plan, and a Sectoral/Thematic and a Liquid fund held), Corporate Bond rank (needs one held), M4-13 on Firefox and Safari.
