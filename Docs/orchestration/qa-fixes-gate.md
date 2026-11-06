# QA fixes: gate evidence (6 Nov 2026)

Lane `qa-fixes-lane` (worktree `wt/qa-fixes`) on top of `origin/leapswitch-redesign` at `72badaef`. Worker branch `qa-fixes-src` carries the same commits. **Nothing is deployed.** The owner signs the last column of the screen table.

## Suites at the lane head
| Check | Result |
|---|---|
| Front end, whole `src` | 481 files, 5974 passed, 2 skipped, 1 failed: `PerformancePage.test.tsx` "filters the month's funds by member chip", a known test that fails only when the whole suite runs under load; it passes alone (3 files, 100 tests) |
| Front end types (`tsc -b`) | 0 errors |
| Front end lint | 0 errors, 30 warnings (28 before this release; the two extra were not traced to a file) |
| Front end build | built; no errors |
| Back end, core, auth, api, import suites (after Task 2) | 1520 passed, 5 skipped |
| Back end, full suite without the Postgres-only tests | **running when this record was written** (about 40 minutes in); result to be added here before the push |
| Back end, Postgres functional tests | not run for this release (no schema change and no query changed; the only back end code touched is two route bodies, one helper, one email module). Run them on the CI before the deploy |

## What the release touches
`git diff --name-only origin/leapswitch-redesign...qa-fixes-lane`: no migration, no `package.json` or lockfile, no file under `frontend/src/mobile/` except one **test** (the exact-object expectation of the mobile import notice now includes the structured `warnings` field; the mobile screen itself is unchanged). The back end changes are `app/core/time_format.py` (new), `services/auth/head_change.py`, `services/auth/email_templates.py`, `services/import_/deletion.py`, `api/dashboard.py`, `api/auth.py`.

## Screens (1440x810, local stack, real data from the synthetic statements)
| Screen | State | Matches the mockup | Differences a person can still see | Owner |
|---|---|---|---|---|
| Import notice (A1) | 21 new funds, two people, many warnings | Tick and cross header, summary with bold count, one row per person with a green chip, "New funds" label with 3 chips and "+18 more", separate green outline "View new funds". Screenshot taken before the two-warning cap; the cap is covered by tests | The mockup is drawn in dark and without warnings; the app's light theme is shown | [ ] |
| Home donut (A2) | Hover over the slices (mocked 3-class allocation, because the local database has no scheme master) | Hover grows the active slice and dims the others; the highlight holds while moving between slices (still highlighted 40 ms after crossing); clears about 90 ms after leaving | Checked in headless Chrome, not by feel at 60 fps: the owner should move the pointer over it | [ ] |
| Sign-up 4 errors (B1) | Both errors, light and dark OS scheme | Both messages are pink boxes with an icon in deep red, every answer of the empty group has the red outline; identical in dark mode | None seen | [ ] |
| All set with Import details (B3) | Dialog open over All set | Read-only list with period, "651 transactions · Imported", people named, "← Back"; the page behind is dimmed | The dialog uses the app's dialog shell (themed), like the other sign-up pop-ups | [ ] |
| Choose head list (C1) | A member with only fixable reasons | Row with a green "Add details" chip and "Needs an email address, a phone number and their relationship to you." | Mockup shows two reasons; the real member also lacked a relationship | [ ] |
| Review step (C2) | Real request through four codes | Headline with time chip, "Signs in from now with", "What changes" rows with arrows, a calm "You will be signed out." notice naming the old head, the reassurance line | The notice is neutral grey (the app has no blue info colour), the mockup is blue | [ ] |
| Sign-in notice (C3) | After confirming the change | Card "Head of Family changed" with the new head's email and phone masked and the old head named | Card is the existing green-tinted info tone; the masked phone wraps after "+91 •••••" on one line break | [ ] |
| Member refusal (C4) | Removing the old head right after the change | Title "{name} can't be removed yet", the server's sentence with "13 Nov 2026" (India time), one OK | Neutral notice, date not bold, sentence is the server's neutral wording | [ ] |
| Account refusal (C4) | Delete Account inside 24 hours | "You can't delete this account yet", "...closes on 7 Nov 2026, 5:35 PM IST.", one OK | Same as above | [ ] |

## Behaviour checked in a browser (headless Chrome against the local stack)
- Sign-up to All set: View details opens the dialog and does not save onboarding as complete; the Back button, the browser's Back and Escape each close it onto All set; "Go to my dashboard" saves completion once and opens Home.
- Log out from Profile, Family: the address becomes `/`; logging in again opens `/home`. A page pasted while signed out (`/portfolio/mutual-funds/holdings`) is opened after login.
- Head change: the member with missing details is clickable, the existing profile dialog opens, Done returns to the list with the member selected, four codes, review step, confirm, sign-in card, new head signs in, both refusals.

## What this gate did not check
- The three head change emails in a real inbox (they are covered by template tests and the delivery order tests; the owner's QA rows D5.x).
- The mobile apps beyond the test suite (nothing under `mobile/` changed).
- The neighbouring unchanged screens by pixel comparison: the baseline database was replaced by fresh seeds for the later checks, so a fair pixel comparison is not possible. The allowed-files diffs, the full suites and the QA checklist section R stand in for it.
- The Postgres functional tests (see above).
- Different browsers, reduced motion on the donut (the class is tested, not watched).

## Orchestrator fixes on top of the worker's output
A warning shown twice in a single-person notice; the warnings capped at two with a count (owner's decision); the Choose head list read again when the edited member is merged away; `onViewDetails` required and the import details dialog kept a true modal; expectations in `ImportFlow.test.tsx`, `MobileImportView.test.tsx`, `routes.test.tsx`; three of my own tests (history length, CSS read, modal-hidden heading).
