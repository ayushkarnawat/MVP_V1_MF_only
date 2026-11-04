# QA handoff for the intern: staging after the UI round 2 deploy (4 Nov 2026)

**Send this page together with the two sheets it points to.** Nothing here needs code knowledge, except the rows marked "Claude" (Claude does those on the VM).

## 1. What is live right now
| Item | Value |
|---|---|
| Site under test | `https://ls-redesign.unifolio.in` (same API, database, worker as `https://ls-staging.unifolio.in`) |
| Code on staging | branch `leapswitch-redesign`, commit **`89ecd3ae54b8975c92b07ce0e49b1ae94a2ea71c`** |
| What it contains | the change-requests release (13 change requests, already on staging before) **plus** UI round 2 (Home donut pop-up, new funds after an upload, add-as-family, Actual XIRR graph, the six life goals, redesigned sign-up and sign-in) |
| Database | Alembic **`0053 (head)`** (applied 4 Nov, 11:15 IST) |
| Deployed | 4 Nov 2026, API down 11:11:57 to 11:15:32 (about 3.5 minutes) |
| Backup taken before the deploy | `unifolio-20261104T054032Z.sql.gz` (174 MB, object storage, prefix `postgres/`) |
| **The database was then wiped of all user data** (4 Nov, 11:16 IST) | There are **no accounts**. Funds, NAV history, benchmarks, fees and fund scores are intact. Every tester starts from sign-up. |

## 2. What the tester must know first
1. **Hard refresh** (Ctrl+Shift+R) and use a **private window**. An old cached front end sends old goal codes and gets an error: that is expected, not a bug (row F9).
2. Phone codes are not sent by SMS in test mode: the code shows on screen under the box ("Test mode: no SMS is sent yet. Your phone code is ..."). Email codes go to a real inbox you can open.
3. Statements for testing are the synthetic PDFs in `Docs/CAS Files/synthetic/pdfs/realistic/`, password **`MF@123`**: `r1_first_jobber_riya_3yr.pdf`, `r2_couple_rohan_priya_10yr.pdf`, `r3_family_minor_suresh_13yr.pdf`. Never commit real statements.
4. Do not delete or edit anything outside the sheets. Write Pass, Fail or Skip with a note and a screenshot for every Fail. Do not fix anything yourself; send the sheets back.

## 3. Which sheets, in which order
Run **both** sheets. The first one has never been run on this release; the second is the new one.

| Order | Sheet | File (folder `Docs/orchestration/`) |
|---|---|---|
| 1 | **UI round 2 and the six life goals** (groups A to K) | `2026-11-04-staging-qa-checklist-ui-round-2.md` |
| 2 | **Change requests release** (13 change requests, sections 1 to 9) | `2026-11-03-manual-qa-checklist.md` |

## 4. Changes to sheet 1 because the database is now empty
**The QA stays fully manual, in the browser.** Only the starting point changes: there are no existing accounts, so build one first and reuse it. The only rows that are not browser work are the VM rows that were already in the sheet (A1 to A7, F7, F8); the owner's Claude does those, see section 5.

- **Do group G first** (sign-up, throwaway account 1, statement `r1`). That account becomes your "existing account" for every row that says "existing account" (B1 to B6, C3, C6, C8, E, F2 to F4, H, J).
- **Group D** needs fresh throwaway accounts as written (each row says how it is signed up). Use a new phone number for each.
- **F1** (existing accounts show "Not answered" after the migration): **Skip**. It was verified by Claude before the wipe: 6 of 6 users had no goals, see section 5.
- **B7** (account with older stored analytics): **Skip**, there is no such household any more.
- **C9 and the other "real" rows**: only with the owner's own statements; otherwise Skip.
- **J1** (the "changed" email notice after sign-up is complete): needs a finished account, so run it after G is complete.
- Row **A6** (rollback): see section 6; the rollback image is not the pre-release one.

## 5. Rows that need the VM, not the browser (done by Claude, not by the tester)
Claude ran A1 to A7 on 4 Nov after the deploy; the tester only reads the results. **F7** (API checks of the goals endpoint) and **F8** (the goals report script) need a signed-in account, so Claude does them after the tester has finished the sign-up walk (G) and says so; until then they stay open.

| Row | Result |
|---|---|
| A1 Migration | `alembic current` = `0053 (head)` |
| A2 Branch and commit | `leapswitch-redesign`, `89ecd3ae54b8975c92b07ce0e49b1ae94a2ea71c` |
| A3 Containers | postgres (healthy), backend, worker, caddy: all running |
| A4 Health URLs | `200` for the API `/health`, `ls-redesign` and `ls-staging` |
| A5 Goals schema | no `primary_goal` column on `users`; `primarygoal` type count 0; CHECK names the six codes and `1 AND 6`; 0 of 6 users had goals (before the wipe) |
| A6 Rollback | see section 6 |
| A7 Errors | the log grep (30 minutes after the deploy) found nothing |
| A8, A9 | the tester does these in the browser |

## 6. Known items the tester should not be surprised by
- **Rollback image:** the deploy script warned that `leapswitch-backend:previous` was **not** updated: the 3 Nov image that was running had already disappeared from the VM by the time the script tried to tag it (the same warning appeared twice on 3 Nov; the cause is not found). `:previous` is the 28 Oct image, two releases old, and must not be used. A rollback therefore means rebuilding from `0dfd1261` (the last deployed commit); it is the owner's decision and is not part of QA.
- **Leftover consent records:** 55 rows in `consent_records` (an append-only legal log) remain from the wiped users. The wipe script does not touch it by design; it does not affect new sign-ups.
- **Disk:** the VM has about 12 GB free after clearing the build cache. The disk resize in the CloudPe dashboard is still pending (the owner cannot do it right now).
- **Saved queries** (DBeaver, dashboards) that select `users.primary_goal` break: use `primary_goals` (a list of the six codes). The owner checks these (deploy guide step 19).

## 7. What to send back
The two filled sheets, screenshots for every Fail, and one line each: date, tester, browser, device. Failed rows go back to the owner by row number; the owner decides sign-off.
