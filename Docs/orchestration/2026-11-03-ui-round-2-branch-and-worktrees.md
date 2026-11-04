# UI round 2: branch and worktree model (from 3 Nov 2026, evening)

Supersedes every earlier line that says "commit and push on `leapswitch-redesign`" in the UI round 2 plan, the orchestrator handoffs and the rules files. Nothing else in them changes.

## The model
- **One shared integration branch: `ui-round-2`** (remote `origin/ui-round-2`), cut from `leapswitch-redesign` at `8dc7d9ba` on 3 Nov 2026. Everything built for this plan from now on goes there. The work already pushed to `leapswitch-redesign` before that point (S0, S1, S2, the first backend tasks, the packets) stays where it is and is already in `ui-round-2`.
- **`leapswitch-redesign` is the manager's branch again.** The manager keeps pushing Run 7 and anything else there. We do not push to it until the final merge.
- **Two worktrees, one per session**, because two worktrees cannot hold the same branch:

| Session | Worktree | Local branch | Publishes with |
|---|---|---|---|
| Frontend (Antigravity lane, stage gates, tags) | `C:\Users\Dell\Desktop\MVP v1\wt\ui-fe` | `ui-fe-lane` | `git push origin ui-fe-lane:ui-round-2` |
| Backend (Codex lane) | `C:\Users\Dell\Desktop\MVP v1\wt\docs-be` | `ui-be-lane` | `git push origin ui-be-lane:ui-round-2` |

  The old worktree `wt/docs` (local branch `leapswitch-redesign`) is no longer used for this plan. Do not commit there.
- **Backend and frontend share one integration branch, not one worktree.** One branch means every stage gate tests the real combination. Two worktrees mean the two sessions never share a working folder or an index. They do share the remote branch, so the routine below is mandatory.

## Publish routine (both sessions, every time)
```
git fetch origin
git rebase origin/ui-round-2          # your commits go on top of the other session's
git push origin <local-branch>:ui-round-2
```
Never force-push. Never push to `leapswitch-redesign`, `main` or `feat/leapswitch-staging` for this plan. If the rebase conflicts in a file the other session owns, stop and tell the owner.

## Taking in the manager's work (frontend session, whenever Run 7 or other manager commits matter, and always before S4 task 4.2 and before S6)
```
git fetch origin
git merge origin/leapswitch-redesign   # a merge, not a rebase: ui-round-2 is shared
# resolve, run the touched tests, then publish with the routine above
```
Tell the backend session when you did, so it rebases.

## The final merge (end of the plan, the owner's go only)
After S6, D.1 and the S7 staging QA pass, and the owner says go: merge `ui-round-2` into `leapswitch-redesign` (a merge commit, reviewed by the owner), then the S7 rollout follows the staging deploy guide. Never before.

## Clones for the workers
- **Antigravity** works in a Windows clone that tracks `ui-round-2` (`git clone --branch ui-round-2 ...`, or `git fetch` and `git checkout ui-round-2` in an existing clone). The orchestrator copies verified files into its own worktree and commits. A packet's Step 0 names `ui-round-2` from now on.
- **Codex** works in a fresh WSL clone per stage: `git clone --branch ui-round-2 file:///mnt/c/Users/Dell/Desktop/MVP\ v1/MVP_V1_MF_only ~/ui-s<N>` then `git checkout -b codex/ui-s<N>`.

## Unchanged
Commit prefixes (`ui-s<N>:`, `docs:`), the co-author line, test-first, the review gates, local tags `ui-s<N>-done` (the frontend session tags in its worktree), no deploy and no product push to `main` or `feat/leapswitch-staging` before the owner's go at S7.
