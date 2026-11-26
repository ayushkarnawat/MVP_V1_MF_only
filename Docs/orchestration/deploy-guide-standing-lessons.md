# Deploy guide: standing lessons (read before writing ANY new staging deploy guide)

Added 26 Nov 2026 after the QA-round deploy. Whoever writes the next deploy guide (any account) copies these into it. Append new lessons at the bottom; never delete old ones. Source of the first block: the manager's deploy reports for `qa-rc` (`2026-11-26-staging-deploy-guide-qa-round.md`).

## 1. Baseline and disk (from the XIRR and QA-round deploys)
- The baseline in the guide is the tag the VM actually runs (read the last deploy record), not the last tag you remember.
- Expect under 12 GB free; include a disk step with owner-approved removals only. The deploy script refuses under 10 GB; never `--force`.
- Confirm the backup by listing the bucket's `postgres/` prefix, not by the backup log.
- Run the deploy detached (log, start and exit files) so a dropped connection cannot kill it.

## 2. Front-end text checks: search every built file
Checking strings only in the script files the index page lists **misses lazily loaded files** ("A statement is being saved" counted 0 although it was deployed). In the guide: search **all** `dist/assets/*.js` (for example `grep -l` across the folder inside the front-end container or build output), never only the index's list.

## 3. Look gate: say which pages MAY differ, from the release's own change list
- "A plain PASS, no page may differ" is only true for a release that changes no printed number. If a release changes any figure that is printed in the PDF (category averages, ranks, returns, XIRR), the guide must name the expected differing section **before** the deploy and the compare must use `--allow-pages` for it (find the page range from the baseline manifest by section, not by guessing).
- The cover page always differs a little (date and time); allow it.
- Take the baseline and the "after" exports close in time, and take the "after" export **after** the stored-results rebuild (step 8), so live data does not move between them. A page that differs in one export and not in the other is first checked by comparing the **same page of the two baseline exports** (offline, no new export); a time-varying page is not a regression.
- Real-data PDFs stay on the VM only until the gate is settled, then are deleted (never committed, printed or copied).

## 4. Any read-only script that needs reference data: load it first
The deploy recreates the containers and **wipes `/app/.cache`**. A script that needs the AMFI NAV list (`/app/.cache/amfi_navall/nav_all.txt`, under 24 hours old) fails with "fresh local reference data is required" and hides the real cause. The guide must add a step **before** such a script: load the cache once with the app's own universe loader (one public download, needs the owner's yes), then run the script.

## 5. Scripts that guard their own SQL: test them on PostgreSQL before freezing
`backend/scripts/category_pool_before_after.py` refused to run on PostgreSQL because its forbidden-word list contains `END` (line 83), so an ordinary `SELECT ... CASE ... END` counted as a write. The manager ran its logic with only that guard off, after asserting the session was read-only in PostgreSQL. **Open fix for the next release:** make the guard ignore `END` inside `CASE` (or drop `END` from the list: `COMMIT`, `ROLLBACK` and the read-only session already cover it), with a test containing a `CASE ... END` query. Rule for the future: every read-only script a guide asks the manager to run gets one dry run against PostgreSQL (or a unit test using a real `CASE ... END` query) before the tag is frozen.

## 6. Expected counts in a guide must be defined, not guessed
The guide expected "five funds" to change their 1-year pool; 43 of 45 changed. D-12 builds each period's pool from all funds with that period's history, so most categories move. When a guide states an expected count, state **how it is computed** and check it against the code or a staging dry run; if it cannot be derived, write "report the number, the owner judges the size of the shifts (list the largest)" instead of a number that can fail the gate.

## 7. Race tests are not in the image
`backend/tests` is not in the backend image. A guide step that runs tests on the VM must say: create a throw-away empty database (never staging), copy `backend/tests` from the tag into the container's `/tmp`, run with `TEST_DATABASE_URL` (never printed), drop the database after. Write the exact commands in the guide so the manager does not have to plan them.

## 8. The one-off clean-up script
Dry run first, then `--apply` only after the owner has seen the counts and said yes. Run the dry run again after the apply and expect `would_close=0`. Take a backup first (step 4).

## 9. Browser-only behaviour is proven in a real browser BEFORE it is built, not by tests
The CAMS tab did not open after Request on staging although every test passed (26 Nov 2026, found in the owner's screen recording). The tests run in a simulated browser (jsdom) that cannot open a real tab or a floating window, and the earlier "spike" was only partly run. A seven-case test page in the owner's real Chrome then showed the rule: **one click grants one permission, shared by "open a new tab" and "open a floating (Document Picture-in-Picture) window"**, so both cannot happen in one click. Rules for guides and plans: (a) anything that depends on real browser behaviour (new tabs, popups, floating windows, clipboard, permissions, focus) gets a small real-browser test page run by the owner **before** the build, with every case the design needs; (b) the deploy guide's QA rows name the **visible proof** (for example "a new CAMS tab is in the tab strip"), not only the screen the app ends on; (c) when the owner reports a problem with a screen recording, check the **first** thing in their words (here, "CAMS should open"), not only what is easiest to see; (d) Edge is not proof for Chrome or the other way round: test both.
