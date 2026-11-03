# UI round 2 run log

One line per stage. Plan: `2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`. Branch `leapswitch-redesign`, worktree `wt/docs`.

## S0 (3 Nov 2026)

**Task 0.1.** Start commit `0b73a390` (head of `leapswitch-redesign`, in sync with origin). Alembic head by file chain: `0052` (`0050`, `0051`, `0052` each chain to the one before; one head). The goals migration is `0053`. Open question: only Q71 (needed at S6 task 6.11). Tags present: `cr-run-1-done`, `cr-run-2-done` only (tags 3 to 6 are on another clone). Run 7 is not tagged and not on the branch.

**Task 0.2 re-read at `0b73a390`.**

| Area | Result |
|---|---|
| Head of Family | **Behaviour changed, no break.** `household_members.is_head` now exists (one head per user, `models/user.py:126`). The "self" member is still found by `Relationship.SELF` in `service.py:_self_member` (`:435`); `has_permanent_pan` and `resolve_self` are in `people_resolution.py`. `users.head_*` columns: none (head state is `head_change_requests`). S3 and S6 keep using the self member. Head change swaps `is_head` and relabels the old head, so S3 must not assume "self == head". Check at S3 handoff. |
| Home | `_display_name` (`api/home.py:62`) and `_summary` (`api/home.py:125`) unchanged. `ScopeContext` is in `services/home/context.py:29` (`scope`, `member_id`, `member_ids`, `member_name`) and a second one in `services/fund_page/scope.py:14`. `load_allocation` is `services/home/allocation.py:228`, `ClassRow` `:35`, `ClassRowOut` is `services/home/schemas.py:96`. Unchanged. |
| Auth | `OtpVerify.tsx`, `ReconsentGate.tsx`, `onboardingSteps.ts` unchanged. `OtpStubBanner.tsx` moved to **`components/OtpStubBanner.tsx`**. `requestContactChange` / `verifyContactChange` in `features/auth/api.ts:235,248`, used by `AuthContext`. Green token `bg-[var(--pos)]` already exists (used twice); Run 7 may standardise it. |
| Import | `_self_member`, `_self_match`, `_me_key`, `next_prompt`, `resolve_name`, `resolve_self`, `_finish` unchanged in `service.py`. `confirm_people_import` / `confirm_single_member_import` in `confirm_people.py:141,159`. `_UPLOAD_SURFACES` and `x-upload-surface` in `api/imports.py:248,312`. `PersonConfirmResult` / `ImportConfirmResponse` in `schemas.py:180,189`. `resolve_name_route`/`resolve_self_route` at `api/imports.py:410,420`. Unchanged. |
| Fund page | `ReturnsTable.tsx`, `Segmented.tsx`, `PerformanceChart.tsx` are under `features/individual-fund/overview/` and `.../components/` (`MODE_OPTIONS` `:26`, `wantCurrent` `:34`); `useFundSection` is `features/individual-fund/useFundSection`. Two `OverviewPage.tsx` exist (`individual-fund/` and `mutual-funds/overview/`). Backend: `inception_returns` `returns.py:86`, `current_returns` `:277`, `ReturnsResponse` `schemas.py:141`, `BENCHMARK_LABELS` `benchmark_select.py:9`, `benchmark_for_scheme` `:57`. Unchanged. |
| Charts | `grouped-bar-chart.tsx` has `buckets`, `seriesColors`, `ariaLabel`, `onBucketClick`; `formatValue`, `height`, `width` still to confirm at S4 handoff. |
| Shell | `ImportProvider.tsx`, `paths.ts`, `registry.test.ts` exist; `useScope().memberId` in use. |
| Goals | `PrimaryGoal` `models/enums.py:13`; `_dedupe_goals` `services/auth/schemas.py:184`; `update_me` `api/auth.py:1086`; CHECK `ck_users_primary_goals_allowed` created in `0019_user_primary_goals.py`. Unchanged. |

Items to repeat when Run 7 lands: `SchemeLogo.tsx` (exists now), card headings, green token, benchmark info icon.

## S0 baselines, backend lane (3 Nov 2026, recorded by the backend orchestrator)

- **Full backend suite**, `pytest` from `backend/` on a fresh WSL clone at `4ee95496` with a throwaway Postgres (`TEST_DATABASE_URL` set, so `functional_postgres` runs): **5737 passed, 6 failed, 6 skipped** (11 min 49 s). Five failures are environmental: `test_portfolio_disclosure_client.py` (4) and `test_portfolio_disclosure_manual.py` (1) read the untracked cache file `backend/.cache/amfi_navall/nav_all.txt`, which a clone does not have (same cause as the S0 note for `test_run4b_real_fixtures_match_cached_master`). The sixth, `test_benchmark_selection.py::test_backend_labels_match_the_frontend_words`, was a real test defect caused by Run 7.4 (`benchmarkDisplay.ts` gained `BENCHMARK_SOURCE_EXPLANATIONS` with the same keys; the test's whole-file regex let those sentences overwrite the labels). Fixed by reading only the `BENCHMARK_SOURCE_LABELS` block; the labels themselves were never different (76 passed in that file).
- **Synthetic CAS gate** (`harness/tools/run_gate.sh`, 44 scenarios x normal and `MFAPI_BLOCKED=1`): **85 of 88 pass at `4ee95496`**. The 3 failures (`p20_3yr` both modes, `p20_7yr` blocked) fail identically at the start commit `0b73a390`, so they are not from this round. Cause and options: `Docs/investigations/2026-11-03-p20-opening-cost-convention-gate-failure.md`.
- **Home timing** (S1 and S2 must stay within 10%): see the next entry once measured.
- **Home timing** (3 Nov 2026), measured in-process on the synthetic harness, not on staging (`measure_home_staging.py` needs a real database and user, so it was not used; no such local database exists). Method: upload a statement into a fresh in-memory database (`MFAPI_BLOCKED=1`), then call the six Home routes (`summary`, `wealth-series`, `allocation`, `movers`, `worth-a-look`, `benchmarks`) for the aggregate scope and for the member scope: first call counted as cold, median of five repeats as warm; three runs per commit, start commit `0b73a390` and head `4ee95496` alternating in the same WSL session; all 200. The throwaway test (`test_hometime.py`) is not committed. Sum over the 12 requests, mean of three runs (ms, cold / warm):

  | Statement | Start `0b73a390` | Head `4ee95496` | Change |
  |---|---|---|---|
  | `fam_10yr` | 169 / 137 | 149 / 111 | cold -12%, warm -18% |
  | `p20_20yr` | 163 / 137 | 179 / 139 | cold +10%, warm +1% |

  Run-to-run spread on the same commit is about +/-20%, larger than the differences, so there is **no measurable regression**; both commits are two orders of magnitude under the 1.5 s first-load budget (about 15 ms per route). The sample is small (one household, two scopes), so repeat on staging (`measure_home_staging.py --user-id ...`) at S7 for the real figure. Use these numbers as the local reference for S2 follow-ups.

## Backend check of the release merge (3 Nov 2026)

`ui-round-2` at the merge commit `1aad77c2` (release/change-requests merged in by the frontend session; backend conflicts resolved as agreed). Fresh WSL clone, throwaway Postgres: `alembic heads` shows exactly one head, **0053**. Full backend suite including `functional_postgres`: **5755 passed, 5 failed, 6 skipped** (12 min 23 s). The 5 failures are the known environmental ones (`test_portfolio_disclosure_client.py` x4 and `test_portfolio_disclosure_manual.py` x1 read the untracked `backend/.cache/amfi_navall/nav_all.txt`, absent in a clone); the benchmark label test that failed in the baseline passes. No backend regression from the merge.
