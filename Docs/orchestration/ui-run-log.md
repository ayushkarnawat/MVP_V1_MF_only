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
