# M2 stakeholder message (draft, saved 20 Nov 2026): send ONE combined message when the whole of M2 is done

**Owner's instruction (20 Nov):** do not send a message for part 1 and another for part 2. Send one complete M2 message after M2 is fully on staging. **When M2 is complete, Claude updates this draft:** move "What is not live yet" into the live list (the benchmark checklist with up to three lines and legend, the "View all by day's change" pop-up, the graph on the Mutual Funds overview), keep the part-1 items, **regenerate the two Excel workbooks again on the final deployed code** (the as-of date in the message and the files must match; see below), re-read the numbers, and hand the owner the final text and files.

**How the files were made (so they can be remade):** `backend/scripts/export_rank_reference_workbook.py` and `backend/scripts/export_category_average_excel.py`, run read-only on the staging VM (one outer transaction, rolled back; public fund data only), the formulas recalculated in LibreOffice so values show on a phone, the two introduction cells filled. Part 1's copies (as of 20 Nov, tag `m2-rc`) are in `D:\Unifolio code\shareables\final\` (untracked, git-ignored): `unifolio-rank-reference-2026-11-20.xlsx` (394 of 402 checks pass), `unifolio-category-average-2026-11-20.xlsx` (138 of 138 pass), `unifolio-how-to-request-from-cams-53s.mp4`. The earlier copies from 20 Nov 01:30 were working files from verification runs (before the deploy, with the introduction placeholders, formulas not recalculated); they are not for sharing.

---

*Unifolio – update: what is now live (20 Nov 2026)*

Hi all, the next set of improvements is now live on our test link: https://ls-redesign.unifolio.in

*1. Fairer, more accurate rankings and category averages*
• A fund is now compared only with true like-for-like funds: the same plan (Direct or Regular) and the Growth option only. Dividend (IDCW) and Bonus options no longer sit in the comparison.
• A few real funds that were missing from their category's ranking are now included, so "rank X out of N" is more accurate. For example, Large & Mid Cap (Direct) goes from 32 to 33 funds.
• The category average now uses exactly the same funds as the ranking, so the two always agree.
• Some category averages will look a little different, mostly by under half a point. The biggest move is Sectoral/Thematic 1-year, from 1.48% to 0.27%, because index and ETF funds are no longer counted.

*2. Return (XIRR) figures that are consistent and easier to read*
• Every return figure is now calculated to the date of the latest price, so the same portfolio no longer shows slightly different returns on different screens.
• Holdings of less than a year show the return since purchase, labelled "not annualised", instead of a very large, misleading percentage.
• Where money in and out cancels out on one day, we show a dash instead of 0%.
• Returns show an "as on" date.

*3. Fresher fund prices*
We found that the nightly price refresh for comparison funds was being refused by a data provider, so some prices were up to 18 days old. Every comparison fund now gets the latest official price each night, and we get an email alert if the refresh runs into trouble.

*4. "Watch how it works" on the import screens*
The two import screens now have a short 53-second video (four steps) showing how to request your statement from CAMS. You can pause, jump between the four steps and read the same steps as text. It works on phone and laptop, in light and dark mode.

*5. Behind the scenes*
The Home graph was rebuilt as a shared component with no change to how it looks. Each benchmark line now has its own colour, so the line and its label are visible.

*What is not live yet (to be moved into the list above when M2 is complete)*
Choosing up to three benchmarks at once, the "View all by day's change" pop-up, and the graph on the Mutual Funds overview.

*What we would like from you*
This is an early look; the full review round happens once after the final release. If you have time now:
• Open Analytics and check a category average and a rank, and tell us if anything looks wrong.
• Use the attached Excel files to re-calculate a rank or a category average yourself. They are as of 20 Nov, so compare them the same day; prices move daily. In the rank file, open "Checks"; in the average file, open "Summary" and "Checks".
• Watch the attached video (or open the pop-up on the import screen) and tell us whether the wording matches what you see on the CAMS website.
Please send any issue with the screen, the fund or category, and what you expected.

Thanks, Aditi

---
**Cautions to carry into the final version:** the owner has not yet looked at a rank or XIRR figure on screen after the deploy (add "numbers checked against Excel; on-screen checks in progress" if still true); the video shows the CAMS name and page and a promotional banner photo (manager's sign-off open, QA row M2-12); the as-of date and the Excel files must be from the same price date as the final deploy.
