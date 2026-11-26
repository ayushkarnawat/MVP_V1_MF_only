# QA-round report, 26 Nov 2026 (staging `ls-redesign.unifolio.in`, tag `qa-rc` = `ba55826098b9f2841476c4bd230ce42aa4e415df`)

Tested by the owner on 26 Nov 2026 (Chrome, real inboxes for the Head of Family emails). Rows are from `2026-11-19-combined-qa-checklist.md`, section "QA-round patches". Screenshots stay with the owner (they show real inboxes); nothing from them is copied here.

## Summary
| Group | Result |
|---|---|
| Visual pass VP-01 to VP-08 | **Pass** (all) |
| D-12 category average D12-01 to D12-04 | **Pass** (all). D12-03 still needs the owner's recorded approval of the 9c before-and-after table (see "Open" below). |
| Head of Family part A HA-01 to HA-07 | **Pass**, with one **new defect** (D-1): the notification emails have no sketches. |
| Waiting CAMS request, checklist, D-2 HB-01 to HB-11 | **Fail** (defect D-2): the owner wanted the waiting page removed altogether; it is still there. Per-row results not given: all HB rows are treated as failed until the flow is redesigned. |
| PDF export ES-01 to ES-05 | **Pass** (all). ES-03 is recorded as "only the D-12 category pages differ" (see 9d below), not a plain pass. |

## Defects

### D-1: the Head of Family emails show empty shapes where the sketches belong (found in HA, applies to every email template)
- **Seen:** the three emails (account updated, undo link, now the Head of Family): the illustration at the top right is a plain pale green ellipse and the small icon tiles beside each line are empty circles. The logo loads; only the sketches are missing.
- **Cause (checked):** the email images are fetched from `{frontend_base_url}/email/<name>-light|dark.png` (`backend/app/services/auth/email_templates.py`, `_image_pair`). The files exist and deploy, but **the PNGs themselves are blank**: `frontend/public/email/ill-forward-light.png` is an empty ellipse with no drawing (same for the other `ill-*` and `ic-*` files, to be confirmed file by file). So this is an asset problem, not a code or deploy problem.
- **Fix:** replace the `ill-forward`, `ill-back` and the `ic-*` PNGs (light and dark) with the real sketches from the owner's images in the artifact. Front-end public assets only; no back-end code, no migration. Needs: the source images or the artifact link (not in this session), the sizes the template expects (illustration 150x118, icons 44x44, at 2x for sharpness), and a Gmail check in light and dark after the deploy (cached images: the file names carry no version, so use new names or a version suffix if Gmail keeps showing the old ones).

### D-2: after Request from CAMS the owner still lands on the "CAMS request waiting" page
- **Seen:** `/import?member=...` shows the "CAMS request waiting" card (Expires in 49 h, Show checklist, Upload the file, Cancel request), the "Waiting for CAMS email" block, "Already got the email? Upload it now", and the floating checklist at 0 of 5 with "I have submitted the form" disabled.
- **Owner's expected flow:** (1) press Request Statement on CAMS; (2) the browser goes to the CAMS site and the floating checklist opens **there**, in that tab; (3) back in the Unifolio tab, the **upload page ("step 2") opens as it did before**, with the floating checklist still there. **No waiting page, no waiting card.** "This isn't fixed at all."
- **What this changes:** the built patch 2 design keeps a server-driven waiting screen and card (HB-01 to HB-05, HB-09). The owner now wants that screen removed as a whole. That reverses part of the 25 and 26 Nov decisions, so it needs a new, short design note before building: what the Unifolio tab shows while the request is open (the pre-patch upload page), what happens to a request left open for 48 hours (the clean-up script and the `waiting_cams_request` flag stay), and whether the Head of Family dialog's quiet line (HB-09) stays.
- **To confirm with the owner before building:** "the upload page as it did before" means the same upload screen the Add data flow showed before this release, with the checklist panel floating over it; and a returning user with an open request (new window or later day) also sees that upload screen, with no card.

## Notes from the deploy (steps 6 to 9; manager's reports)
- Deploy exit 0, backend and worker recreated, Alembic stays 0054; stored results rebuilt (step 8, clean log). New routes return 401 as expected.
- **9a (race tests on a throw-away database): not run yet.** HA-06 stays open.
- **9b:** dry run showed would_close=1; applied (closed 1); a second dry run shows 0. HB-10 pass.
- **9c (D-12 table):** 3Y and 5Y changed for 0 of 45 held funds. The 1Y pool changed for 43 of 45 (the guide expected five; that number was wrong, see `deploy-guide-standing-lessons.md` lesson 6). Averages move 0.00 to 0.74 points; largest: Sectoral/Thematic 3.70 to 4.43 (pool 145 to 231), Index 1.77 to 2.04. **Owner approval of this table is not yet recorded.**
- **9d look gate:** FAIL against the guide's "plain pass": 17 consecutive category-section pages differ (expected D-12 effect, probes agree); page 1 differs 0.1% (the date); **page 26 (12%, full report only) is unexplained**. Next check: compare page 26 of the two baseline exports with each other (offline).
- Guide faults found (recorded for the next guide in `deploy-guide-standing-lessons.md`): the text check missed a lazily loaded file; the look gate should have named the category pages as allowed; the AMFI cache must be reloaded before 9c; `category_pool_before_after.py` treats `END` as a write (fix in the next release).

## Open and next
1. Owner: approve (or reject) the 9c table; then D12-03 is closed.
2. Manager: page 26 baseline comparison; 9a race tests; delete the real-data PDFs on the VM when settled; write the step 11 record.
3. Build D-1 (email sketches): needs the source images from the owner. Small, front-end assets only.
4. Build D-2 (remove the waiting page): design note first, then a patch; both D-1 and D-2 deploy together as a front-end-led patch (D-2 touches the front end and possibly the `waiting_cams_request` flag; no migration expected).
5. Re-run HB rows and the email check after that patch.
