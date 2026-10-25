# Account switch 25 Oct 2026: state, policy change and return handoff

**Purpose.** The first orchestrator account hit its 5-hour limit (resets 08:20 UTC, about 13:50 IST). A second account (this file's author, Claude Sonnet 5.5, desktop app, Windows) took over to keep the UI redesign moving. This is **temporary**: when the first account's limit resets, the owner goes back to it. This file is the state to resume from, in either direction. Mechanism, git model, rules and gotchas are unchanged: `2026-10-24-ui-redesign-account-transfer-handoff.md` is still the primary instruction file; this file only adds what changed.

**Keep this file current.** Whoever holds the baton updates section 2 and section 3 before their limit runs out, commits on `leapswitch-redesign`, and gives the owner the prompt in section 6.

## 1. Hazards specific to switching (read first)

1. **One checkout, two sessions.** Both sessions work in the same folder (`D:\Unifolio code`, seen from WSL as `/mnt/d/Unifolio code`). Only one session may be active at a time. A second one doing `git checkout` or `git stash` changes the branch under the first. First command in every session: `git branch --show-current; git status --short`.
2. **Where checks run.** `frontend/node_modules` holds only Linux native bindings (`@rolldown/binding-linux-x64-*`, `@oxlint/binding-linux-x64-*`), so `vitest`, `tsc -b`, `oxlint` and `npm run build` must execute in **WSL Ubuntu** (node 20), not natively on Windows. A Windows desktop session **can** run them: it calls WSL from PowerShell. Verified 25 Oct from the desktop app: `tsc -b` exit 0 in 16 s, one vitest file in about 35 s. Recipe (paths with spaces break inline quoting, so use a script file; call it from PowerShell, not Git Bash, which rewrites `/mnt/...` paths):
   ```bash
   # wsl-fe.sh (keep it outside the repo, e.g. the session scratchpad)
   cd "/mnt/d/Unifolio code/frontend" || exit 1
   cmd="$1"; shift
   case "$cmd" in
     tsc) npx tsc -b ;; oxlint) npx oxlint src/shell ;; build) npm run build ;;
     test) npx vitest run "$@" --maxWorkers=2 ;;
   esac
   echo "EXIT=$?"
   ```
   ```powershell
   wsl.exe -d Ubuntu -- bash /mnt/c/<path-to>/wsl-fe.sh test src/shell/portedFlow.test.tsx
   ```
   **Fast path (measured 25 Oct, use this by default):** the same checks run about 6 to 13 times faster on a copy of `frontend/` on WSL's own disk (`~/fe-speed`) than on the `D:` path: three test files 31 s vs 5 s; the full affected set 977 s vs 73 s (94 files, 928/928 green, and the cold-import flake did not occur there, so that flake is a slow-drive effect, not a logic bug). One-time setup: copy `frontend/` including `node_modules` to `~/fe-speed` (about 160 s, 251 MB). Then every run starts by syncing source (everything except `node_modules`, `dist`, `.vite`) from `D:`, so it always tests the working tree. Script (`fast-fe.sh`, keep it outside the repo; `nproc` is 16, RAM 7.7 GB, so keep `--maxWorkers=2` or raise it only cautiously):
   ```bash
   #!/usr/bin/env bash
   # Usage: fast-fe.sh <sync|tsc|oxlint|build|test> [vitest args...]
   SRC="/mnt/d/Unifolio code/frontend"; DST="$HOME/fe-speed"
   mkdir -p "$DST"
   if command -v rsync >/dev/null 2>&1; then
     rsync -a --delete --exclude node_modules --exclude dist --exclude .vite "$SRC/" "$DST/"
   else
     (cd "$DST" && find . -mindepth 1 -maxdepth 1 ! -name node_modules ! -name dist -exec rm -rf {} +)
     (cd "$SRC" && tar --exclude=./node_modules --exclude=./dist --exclude=./.vite -cf - .) | (cd "$DST" && tar -xf -)
   fi
   cmd="$1"; shift; cd "$DST" || exit 1
   case "$cmd" in
     sync) ;; tsc) npx tsc -b ;; oxlint) npx oxlint src/shell ;; build) npm run build ;;
     test) npx vitest run "$@" --maxWorkers=2 ;;
   esac
   echo "EXIT=$?"
   ```
   If `~/fe-speed/node_modules` is missing or `package.json` dependencies changed, redo the one-time copy or run `npm ci` inside `~/fe-speed` (from WSL). The `D:` path stays the source of truth; never edit files in `~/fe-speed`. The slow `wsl-fe.sh` recipe above still works as a fallback.

   Do not run `npm install` from Windows (it would replace the Linux bindings); if dependencies are missing run it from WSL. The first test in `portedFlow.test.tsx` fails on a cold import under the hardcoded 5000 ms limit (deferred fix); rerun with a longer `--testTimeout` only for scratch work, never edit the committed limit before the owner's go.
3. **Stale `.git/index.lock`.** Seen repeatedly. Check no git process runs, then delete it.
4. **Memory is per account.** Each account's auto-memory is separate. Everything that must survive lives in these docs, committed on `leapswitch-redesign`.
5. **Codex relay lives in the owner's chat.** Codex reports exist only where the owner pasted them. Record every verdict in the S2.4 handoff doc and `delegation-log.md` the moment it arrives.

## 2. State at the switch (verified by git, 25 Oct)

- `leapswitch-redesign` head `02cb599` (docs; the Opus-review record `cb2024a` cherry-picked from the task branch; nothing else was missing). Untracked: `Web app UI mockups MFs.pdf` (owner's call, stays untracked).
- `feat/shell-nav-switch` head `cb2024a`, five commits ahead of its remote (`b7ac484`), **not pushed**. Contains S2.1 to S2.4 and three fixes: `a7ef402` (import notice cleared before pushing /import), `7440ed9` (shell token CSS reachable from `App.tsx`, Import Health Back lands on Profile).
- `feat/shell-nav` `15ac628` (shell PR1, PR #9), `feat/home-snapshot` `511f1ef` (HB1, PR #10). Both PRs open, unreviewed, CI red for the same pre-existing `xlwt` reason.
- Test evidence (from the previous session's reports, **read, not re-run by this account**): affected set 325/326 after `7440ed9`; the one failure is the deferred cold-import timeout in `portedFlow.test.tsx`. This account has run no tests yet.

**S2.4 review gate status**

| Step | Status |
|---|---|
| Independent verification and PORT MAP 30/30 | done |
| Codex adversarial review S2.3+S2.4 | FAIL (1 Medium), fixed `a7ef402`, Codex scoped re-review PASS |
| Opus review S2.3+S2.4 | FAIL (1 High, 2 Medium, 3 Low); High and one Medium fixed `7440ed9` |
| Codex scoped re-review of `7440ed9` | FAIL, 1 Medium (Import health Back pushed `/profile`, leaving a Back loop) + 1 Low (token reachability test matched commented imports). Both fixed test-first in `1c5a686` (RED confirmed for each; affected set 920/921, only the known cold-import flake; tsc, oxlint, build clean, run from the desktop session via WSL) |
| Codex scoped re-review of `1c5a686` | PASS on navigation; 1 Low (inline `//` comment case in the token reachability test), fixed test-first in `93f07ff` (RED confirmed). Owner chose to skip a further Codex round for it |
| Full affected set after `93f07ff` | 920/921 (run by the orchestrator via WSL); the one failure is the known cold-import flake |
| Open Opus Medium (import notice can resurface 2+ Back-hops away; closing it means changing locked decision 6) | **DECIDED 25 Oct: accepted as a documented limitation, revisit in I1** |
| S2.4 marked DONE | **DONE 25 Oct 2026** (the section 5b prompt is no longer needed) |

Then, in order: S2.5 (Claude: boundary/landing tests plus a manual browser check of the running shell on a synthetic household), S2.6 (Claude: docs/log, show a diff), S2.7 (final gate, Opus whole-branch review; push `feat/shell-nav-switch`, open its PR into `leapswitch-redesign`; ask the owner whether to base it on `feat/shell-nav` while PR #9 is unmerged). After shell PR2, ask which track next (Wave 2b backend from HB2, or Wave 1 manual work).

**Backlog explicitly not touched:** the deferred fixes in the session file (`xlwt` in `backend/requirements.txt`, the 5000 ms cold-import timeout), to be done after all waves, per the owner.

## 3. Review policy change (owner proposal 25 Oct, adopted; owner may veto)

Opus reviews were the largest token cost. New rule:

- **Opus only for a complete whole-branch review at the end of a PR or wave**: S2.7, MF15, PR10, M2 (and the I-wave final gate). Not for intermediate runs.
- The other "+O" runs (MB3, MF6, PR4, PR6, and any mid-PR one) get a **Sonnet review** instead: an `Agent` subagent with `model: "sonnet"`, read-only, same brief as the Opus one, plus the Codex relay review as before.
- Codex reviews are unchanged (they cost the owner's relay time, not Claude quota).
- Reason this is safe, and the one thing to keep: the S2.3+S2.4 Opus review caught a High that two Codex rounds missed (the shell token stylesheet was never imported, so every `--shell-*` variable was undefined in the built app). That was a whole-wiring defect, which is exactly what an end-of-PR whole-branch review is for. So every final Opus gate must include a **built-output check**: grep `dist/assets/*.css` for definitions of each `--shell-*` variable used, plus a manual run of the app, since jsdom ignores stylesheets.
- This replaces the 24 Oct blanket Opus approval list. Update the "Opus blanket approval" line in `ui-redesign-session.md` when the owner confirms.

## 3b. Efficiency changes (owner approved 25 Oct, apply from S2.5 onward)

1. **Speed the machine side first.** The repo sits on the Windows `D:` drive, which WSL reads slowly (last full run: tests 66 s, environment 900 s and import 739 s summed across workers). **Measured and adopted 25 Oct (section 1, "Fast path"):** a copy on WSL's own disk is 6x faster for a small run and 13x faster for the full affected set (977 s to 73 s), and the cold-import flake disappears. `vitest related <files>` for fix commits is still available on top.
2. **Fewer full runs.** A full affected-set run once per PR at the final gate (S2.7). Fix commits and test-only changes get targeted runs plus `tsc` and `oxlint`.
3. **No re-review of Lows or test-only fixes.** Per-run Codex review only for risky runs (changes what users see, touches shared code, or is a foundation later runs build on). Otherwise batch Codex per PR, and at the final gate run Codex and Opus on the same diff in parallel with one fix pass.
4. **Recurring review findings become automatic checks.** Guard tests under `frontend/src/shell`: every `--shell-*` variable used is defined in the token stylesheet; no raw hex in the shell; no `any`, `window.history` or `popstate`. Added in S2.5.
5. Keep the independent PORT MAP-style verification whenever a screen is replaced, and the built-output check at every final gate.

## 4. Import-notice item: DECIDED 25 Oct 2026, accepted as a documented limitation (revisit in I1; listed under unfixed Lows in the session file)

The text below is the background and the original recommendation, kept for the record.

**Import notice resurfacing (Opus Medium, not fixed).** The banner shown on the Dashboard after an import ("12 transactions added..." or "This statement was already imported") is stored inside the browser-history entry of the Dashboard page it appears on (`location.state.importNotice`, locked decision 6). Dismissing it, or starting another import, clears it only on the entry the user is standing on. `a7ef402` closes the adjacent case Codex found (dismiss a later notice, press Back, an older notice returns). What remains, reproduced 25 Oct with a throwaway test on `feat/shell-nav-switch` (deleted, not committed):

1. Import A finishes; the Dashboard shows notice A; the user does not dismiss it (history: Dashboard[A]).
2. The user opens Analytics, clicks Add data there, finishes import B, which lands back on Dashboard with notice B, and dismisses B (history: Dashboard[A], Analytics, Dashboard).
3. Browser Back twice reaches the first Dashboard entry, and **notice A shows again**, although B has since been imported and A is old news. The test confirmed it (`stale notice A visible after Back x2: true`).

Impact: an out-of-date, dismissible banner after several Back presses. No data is changed or lost. In the old pre-shell app the notice was component state and could not come back this way. Fully closing it needs the notice held outside history (provider-held state) or a one-shot consume, which changes a locked decision.
Recommendation: accept as a documented limitation (cosmetic stale banner, no data loss, bounded), list it under unfixed Lows, revisit in I1 when real pages replace the placeholders. This matches the stopping heuristic in the model-orchestration skill (lower severity than the prior round, correctness-safe, bigger primitive needed).

## 5. Prompt for Codex: scoped re-review of `7440ed9`

```
Scoped read-only re-review (no edits, no git writes). Repo: D:\Unifolio code (WSL: /mnt/d/Unifolio code), branch feat/shell-nav-switch (already checked out). Review commit 7440ed9 only (git show 7440ed9). It touches frontend/src/shell/ShellRoot.tsx, frontend/src/shell/wrappers/ImportHealthWrapper.tsx, frontend/src/shell/routes/wrappers.test.tsx and the new frontend/src/shell/shellTokensReachable.test.ts. It fixes two review findings: (1) App.tsx imports ShellRoot.tsx directly and never shell/index.ts, so shell-tokens.css was never in the production bundle and every --shell-* variable was undefined; (2) ImportHealthWrapper's onBack used navigate(-1), a no-op on a deep link or fresh history stack, and now navigates to paths.profile().

Check independently:
1. Token fix: after this commit, is shell-tokens.css reachable from frontend/src/App.tsx by static imports alone, and does the production build contain a definition for every --shell-* variable that the shell source uses? Is there any other component or CSS file that uses a --shell-* variable that is still not defined?
2. shellTokensReachable.test.ts: does it really fail without the ShellRoot.tsx import line? Could it pass vacuously (comment text matching, path aliases or index re-exports it does not follow, extensions it cannot resolve, zero files visited)? Does it cost anything meaningful at test time?
3. ImportHealthWrapper: paths.profile() is a push, not a pop. After Profile -> Import health -> Back, does browser Back now return to Import health (a Back loop)? Compare with how FocusLayout and modeMemory handle Back. Is replace or the Back-memory helper the right primitive here, and is there any other entry point to /profile/import-health in the registry besides Profile?
4. wrappers.test.tsx: does the new deep-link test assert real behavior (a rendered Profile screen via URL) and would it fail with the old navigate(-1)?
5. Any other Medium/Low in these four files, raw hex colours instead of var(--shell-*), any `any`, or files changed outside frontend/src/shell.

Report PASS or FAIL, then findings High/Medium/Low with file:line. Do not pad.
```

## 5b. Prompt for Codex: scoped re-review of `1c5a686` (USED 25 Oct, kept for the record; S2.4 is closed)

```
Scoped read-only re-review (no edits, no git writes). Repo: D:\Unifolio code (WSL: /mnt/d/Unifolio code), branch feat/shell-nav-switch (already checked out). You previously reviewed 7440ed9 and reported: Medium, ImportHealthWrapper's Back pushed /profile and left Import health one browser Back away (a Back loop); Low, shellTokensReachable.test.ts matched commented-out imports. Review commit 1c5a686 only (git show 1c5a686). It touches frontend/src/shell/wrappers/ImportHealthWrapper.tsx, frontend/src/shell/routes/wrappers.test.tsx and frontend/src/shell/shellTokensReachable.test.ts.

Check independently:
1. Does the new onBack (navigate(-1) when location.key is not "default", otherwise navigate to paths.profile() with replace) close the Back loop for Profile -> Import health -> Health back -> browser Back? Is there any in-app way to reach /profile/import-health where navigate(-1) would land somewhere other than Profile (check the registry and every caller of paths for it), or where the "default" key check misfires (refresh, StrictMode, MemoryRouter vs BrowserRouter)?
2. Does the new test "no Back loop" in wrappers.test.tsx really fail against the previous push-based onBack, and does it assert real history behavior rather than a mock call?
3. shellTokensReachable.test.ts: does the comment stripping (block comments and whole-line // comments) remove commented imports without hiding a real one (for example a "//" inside an import string, a trailing comment after a real import, a multi-line import)? Does the new commented-imports test fail without the stripping?
4. Any other Medium/Low in these three files, raw hex colours, any `any`, or files changed outside frontend/src/shell.

Report PASS or FAIL, then findings High/Medium/Low with file:line. Do not pad.
```

## 6. Prompts to paste into the other Claude Code session

**Return prompt (paste into the first account's session when its limit resets):**

```
You are the orchestrator of the Unifolio UI redesign, resuming after a temporary account switch (25 Oct 2026). Do not re-derive anything. Run `git branch --show-current; git status --short` first, then read in full: Docs/orchestration/2026-10-25-account-switch-return-handoff.md (this is newer than the transfer handoff on three points: the Opus policy in section 3, the Windows/WSL rule in section 1, and the S2.4 gate state in section 2), then Docs/orchestration/ui-redesign-session.md, then skim 2026-10-24-ui-redesign-account-transfer-handoff.md for the mechanism. Invoke task-observer and model-orchestration as CLAUDE.md requires. Run frontend checks from WSL only. Then ask me for the Codex verdict on the 7440ed9 scoped re-review if I have it (the import-notice Medium is already decided: accepted as a limitation, section 4). Close the S2.4 gate, then S2.5, S2.6, S2.7 per section 2. Opus only for the final whole-branch review at S2.7; Sonnet subagents for other reviews. Same standing rules as before: never push, merge or open a PR without my word; stage explicit paths; check the branch before every commit; keep this file and the session file current before your own limit runs out.
```

## 7. Hand-back log (append a line each time the baton moves)

- 2026-10-25, Windows desktop account (Sonnet 5.5): took over after the first account hit its limit mid-cherry-pick. Done: cherry-picked `cb2024a` to `leapswitch-redesign` (`02cb599`); verified branches and WSL/Windows toolchain split; wrote this file. Not done: Codex re-review of `7440ed9` (awaiting relay), the import-notice decision, S2.5 to S2.7.
