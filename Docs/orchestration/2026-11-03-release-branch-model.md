# Two lines of work and how they meet (3 Nov 2026, evening)

Written by the change-requests orchestrator ("the manager's session"). The UI round 2 session has its own model in `2026-11-03-ui-round-2-branch-and-worktrees.md` (branch `ui-round-2`); this file only adds what the manager's side does so the two never trip over each other.

## What happened
Between 11:48 and 15:04 on 3 Nov both sessions committed to `leapswitch-redesign`. By 15:04 it held the manager's work (change requests: Runs 1 to 7 so far) AND the first UI round 2 work (S0 to S3, with deliberate red tests). UI round 2 then moved to `ui-round-2` (cut at `8dc7d9ba`), which is right. But `leapswitch-redesign` still contains the S0 to S3 work, and a deploy of it would ship half-built UI round 2 code and failing tests.

## The fix: a clean release branch (nothing rewritten, nothing force-pushed)
- **`release/change-requests`**: built from `7b773475` (the last commit before any UI round 2 code) plus the manager's later commits cherry-picked in order (`cr-r7` T7.2, T7.3, T7.4, and everything the manager adds from now on). It contains **only** the change-requests release: Runs 1 to 7, the backend items W1 to W8, T2.12 Step B (migration `0052`), the owner decisions A to D, the documentation. Alembic head: `0052`. **This is the only branch the staging deploy (S.1) is built from.**
- **`leapswitch-redesign`**: stays exactly as it is now, as the shared history up to `8dc7d9ba`. Nobody pushes to it any more except the final merge. (If something on it must change before then, ask the owner.)
- **`ui-round-2`**: UI round 2, unchanged. It already contains everything the manager pushed to `leapswitch-redesign` before `8dc7d9ba`.
- Manager work now lives only on `release/change-requests`, built in a separate Windows worktree (`D:\unifolio-release`), so a pull, push or checkout in the main folder cannot touch it.

## What the UI round 2 session does differently (one line changes)
Where its model says "take in the manager's work: `git merge origin/leapswitch-redesign`", use **`git merge origin/release/change-requests`** from now on (a merge, as before). The manager's cherry-picked commits carry the same changes as the ones already in `ui-round-2`, so git sees identical patches and merges them without conflicts except in files both sides append to (`Docs/orchestration/delegation-log.md`, `ui-run-log.md`, the run logs): keep both sides' lines there.

## Rules that keep the two lines apart
1. **No new migration number clash.** The release adds no migration after `0052`. UI round 2's goals migration stays `0053` and its `down_revision` must be `"0052"`. If the manager ever needs another migration it asks the owner first and takes `0054` or later after the UI round 2 session confirms its numbers.
2. **Different files by design.** The manager's remaining work (T7.5, gates, documentation update, staging) touches change-requests files and the shared docs listed above. If UI round 2 needs to change a file the release changed (for example `button.tsx`, `benchmarkDisplay.ts`, `ChangeHeadDialog`, the valuation and benchmark screens), say so in the shared docs so the other side can merge deliberately.
3. **Order of events.** (a) The manager deploys `release/change-requests` to staging at S.1 (owner's go and push word) and QA runs; (b) UI round 2 merges `origin/release/change-requests` into `ui-round-2` and its stage gates then test the real combination; (c) the final merge of `ui-round-2` into `leapswitch-redesign` and its own rollout (S7) follow the owner's go as in its plan. The release is deployed on its own; UI round 2 is deployed later on top of it.
4. **Tests.** The release branch has no deliberately red test. Red tests of UI round 2 live on `ui-round-2` only. Gates on the release branch are run on the release worktree.
5. **Pushing.** The release branch is pushed (as a NEW branch, no force) only at the owner's push word, together with the S.1 deploy. Until then it exists only on the manager's machine.
