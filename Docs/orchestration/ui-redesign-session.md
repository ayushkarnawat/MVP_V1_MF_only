# UI redesign: orchestrator session file (overwritten each session)

**Updated:** 2026-10-24, Wave 2b started. **Orchestrator:** Claude Code (this account). **Worker:** Codex. **Plan of record:** `2026-10-24-ui-redesign-execution-strategy.md`; instructions and run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md`.

## PR merge queue (the owner's clicks; the orchestrator never merges)

Owner's branch model (25 Oct 2026): one PR per page or flow; **every PR ends on `leapswitch-redesign`**; that branch is deployed to its own new link (`ls-redesign.unifolio.in` in the strategy doc) only when the whole redesign is on it; `ls-staging` is untouched until Wave 7. Order that must be followed:

1. **PR #9** `feat/shell-nav` -> `leapswitch-redesign` (shell PR 1). Merge first.
2. **PR #11** `feat/shell-nav-switch` (shell PR 2). Its base is **`feat/shell-nav`** today because it contains #9's commits, so it shows only its own 66 files. **After #9 is merged, change #11's base to `leapswitch-redesign`** (PR page, Edit, base branch; GitHub also retargets it itself if `feat/shell-nav` is deleted after #9 merges), then merge it. Do **not** merge #11 into `leapswitch-redesign` before #9: it would carry PR 1's code in without #9's review. (Equivalent alternative: merge #11 into `feat/shell-nav` first, then #9 brings both; do not do both orders.)
3. **PR #10** `feat/home-snapshot` (HB1 backend), independent: any time.
4. Later page PRs are cut from, or stacked on, whatever branch holds the shell, then retargeted the same way. **Wave 4 (page PRs) must not start until #9 and #11 are merged** (pages use the shell's scope and layout code); backend runs (Wave 2b) do not depend on them.
5. Wave 7: the owner opens `leapswitch-redesign` -> `feat/leapswitch-staging`.

Deviation from `2026-10-24-ui-redesign-account-transfer-handoff.md` section 5.8 (which says open every PR with `--base leapswitch-redesign`): #11 was opened stacked on `feat/shell-nav` on 25 Oct, a decision the owner delegated to the orchestrator, for the reason above. The same section says the remote `leapswitch-redesign` should be pushed first so PR diffs are not noisy; the local docs branch is 10 commits ahead of GitHub (5 docs files); it is pushed only on the owner's word.

## State

- **Wave:** 2 and 2b. Done: HB1 (`511f1ef`, `feat/home-snapshot`), S1.1 (`e825d10`, `feat/shell-nav`). S1.2 (9de1e5b + fix e186296, `feat/shell-nav`; Codex review FAIL then fixed, Opus PASS then fixed). S1.3 done (af4d2f7; redirectTo carry-over handled via finalRoute). S1.4 done (028342a + fix 0a7db46; Codex review of S1.3+S1.4 FAIL then fixed). S2.1 done (2f430e4, `feat/shell-nav-switch`; Codex review batched with S2.2). S2.2 done (63394ae + fix 0c57ab9; Codex review S2.1+S2.2 FAIL then fixed). S2.3 done (8b62d4b). **S2.4 (+O) committed `8aea4c2` on `feat/shell-nav-switch`** (Codex report DONE; orchestrator re-ran the affected set: 92 files, 916 tests, tsc, oxlint, build all green; PORT MAP 30/30 by name). PORT MAP row-by-row re-verified independently 25 Oct (account transfer — Codex's original table only existed in the prior laptop's chat transcript, never saved to a file; rebuilt from git history and saved into the S2.4 handoff doc's Orchestrator record): 30/30 old tests accounted for, 29 with a confirmed new home, 1 correctly retired (the old Family/Per Member toggle, replaced by `FamilySelector`) per the handoff's own pre-authorized retirement case. **Codex adversarial review (S2.3+S2.4) relayed 25 Oct: FAIL, one real Medium** (`openImport` could let a dismissed-then-superseded import notice resurface via Browser back; see the S2.4 handoff doc's Orchestrator record). Fixed directly by the orchestrator (`a7ef402`, test-first: regression test confirmed RED then GREEN; full affected set re-run 916/917 green, only failure being the already-deferred cold-import flake). Scoped re-review dispatched and returned **PASS, clean**. **Opus review (S2.3+S2.4) relayed 25 Oct: FAIL, 1 High + 2 Medium + 3 Low.** High (shell-tokens.css never reached the production bundle — `App.tsx` bypasses `shell/index.ts`, the only file that imported it) and one Medium (`ImportHealthWrapper`'s Back a no-op when deep-linked) fixed directly by the orchestrator, test-first, commit `7440ed9`; affected set 325/326 green (1 known deferred flake), `tsc`/build clean, rebuilt `dist/` confirms the token fix lands. **One Medium left open, needs the owner's call, not silently resolved:** the import-notice Back fix (`a7ef402`) only clears the *current* history entry — a notice 2+ hops back can still resurface; fully closing it means changing locked decision 6 (notice lives in history state) to provider-held state or a `location.key`-keyed one-shot consume, not a same-decision patch. 3 Lows accepted as documented limitations (weak-but-real un-skipped registry test; banners-over-placeholders is spec-conformant per contract v1.6 line 158, plus one dead clause in the same file; a harmless same-file test URL-state leak). Scoped re-review of `7440ed9` dispatched next; S2.4 cannot move to DONE until the owner decides the open Medium (fix now vs. defer) and that re-review returns clean. **TRANSFER 2026-10-24: orchestration moves to the manager's laptop/accounts; read `2026-10-24-ui-redesign-account-transfer-handoff.md` first.** PRs open: #9 (shell PR1), #10 (HB1) as aditi-unifolio. **Shell PR1 complete on `feat/shell-nav` (b80b55c): S1.1 to S1.6 done, Opus final review PASS then fixed. Branch not pushed, no PR opened.** Next: Wave 2 shell PR2 (S2.1 onward), or the 2b backend runs (HB2 onward), Codex review of S1.3+S1.4 batched there. Method: orchestration docs are committed on `leapswitch-redesign`; before each run I merge `leapswitch-redesign` into the task branch so Codex sees the handoff; code commits go on the task branch. The Codex review of S1.1 is batched into S1.2's review (covers T1 to T3), then the Opus review of S1.2.
- **Branches:** `leapswitch-redesign` (integration, docs), `feat/home-snapshot` (HB1 code), `feat/shell-nav` (next). Nothing pushed by this account. Untracked: `Docs/Web app UI mockups MFs.pdf` (owner's call).
- **Latest migration:** `0043`; `0044` (news) and `0045` (benchmark indices) are free.
- **Codex mode:** manual relay (owner decision 24 Oct, reconfirmed 25 Oct on account transfer). `codex:codex-rescue` is not available as an agent on this account either; I write the handoff doc and a short prompt, the owner pastes it into Codex and pastes the report back, as in Sub-projects 1 and 2 and the UX fixes. Each review gate is also a relay (a review prompt for Codex, then its findings back).
- **Opus blanket approval:** given 24 Oct for the +O runs only (HB1, S1.2, S1.6, S2.4, S2.7, MB3, MF6, MF15, PR4, PR6, PR10, M2); reconfirmed directly by the owner 25 Oct on account transfer — no need to re-ask per run on this account.
- **Owner "go":** given 24 Oct for Waves 1, 2 and 2b.
- **GH/git identity (this account, confirmed 25 Oct):** `gh auth status` and `git config user.name/user.email` are already `ayushkarnawat` / the owner's own identity in this environment (not `aditi-unifolio`, which opened PRs #9/#10 on the previous laptop). Task branches pushed and PRs opened from here will be under `ayushkarnawat`; this is expected and approved, not a mismatch to fix.

## Decisions taken (do not re-ask)

Everything in handoff section 9, plus the owner's second-pass decisions of 24 Oct (strategy doc, "Owner decisions, second pass"): individual fund page has three tabs; a fund name opens the individual fund page wherever funds are listed; each page keeps its own mockup's surface style; shell active row is a 2 px underline; Mutual Funds Overview table has a Today's change column and sortable headers (Home "View all by day's change" opens it sorted); a visual-parity step ends every page (handoff step 5b); reference of the finished app is `2026-10-24-desktop-preview-all-pages.html`.

## Open owner items

- Whether to commit the mockup PDF.
- Existing docs that still say "green bar" for the active row and were not edited: the shell contract (v1.6, line 187) and the shell PRD (S15). Ask at the end of the shell wave with a diff.
- `PR9` (retiring the old Profile) before or after the merge rehearsal.

## Deferred fixes (owner: fix once all waves are done, not now — confirmed 25 Oct)

- **CI gap, both open PRs:** `backend-fast` job fails identically on PR #9 and PR #10 (`ModuleNotFoundError: No module named 'xlwt'` aborts pytest collection in `tests/services/analytics/test_portfolio_disclosure_parsing.py`). Confirmed pre-existing and unrelated to either PR's diff (PR #9 is frontend-only, PR #10 is backend-only; `backend-postgres` and `frontend` both pass on each). Fix: add `xlwt` to `backend/requirements.txt`.
- **Test timing flake, `frontend/src/shell/portedFlow.test.tsx`:** the first test's first `dashboard()` call hits a cold `React.lazy()` import (cached module-level in `PageBoundary.tsx` for every later call) and times out at ~5080ms against a hardcoded 5000ms limit on this checkout — reproducible on this machine/filesystem, not seen as a logic bug. Fix: raise that one `findByText` call's timeout (e.g. to the global 15000ms in `vitest.config.ts`) or otherwise give the cold import more headroom. **Update 25 Oct: root-caused. The test passes (928/928, no flake) when run on WSL's own disk, so the cause is the slow `/mnt/d` filesystem, not the code. The deferred fix may be unnecessary; recheck on CI before touching the test.**

## Run catalogue (check off after the review gate and the commit; "+O" = Opus review)

### Wave 1: second link
- [ ] L1 (with the owner)

### Wave 2: shell (stacked branches `feat/shell-nav`, `feat/shell-nav-switch`)
- [x] S1.1 (e825d10) · [x] S1.2 +O (9de1e5b, e186296) · [x] S1.3 (af4d2f7) · [x] S1.4 (028342a, 0a7db46) · [x] S1.5 (Claude) · [x] S1.6 +O (b80b55c)
- [x] S2.1 (2f430e4) · [x] S2.2 (63394ae, 0c57ab9) · [x] S2.3 (8b62d4b) · [x] S2.4 +O (8aea4c2 + fixes a7ef402, 7440ed9, 1c5a686, 93f07ff; Codex, Opus and two scoped re-reviews done 25 Oct; gate closed, full affected set 920/921 with only the known cold-import flake) · [x] S2.5 (Claude; guard tests 2d8adc4, boundary tests already existed from S2.4, manual browser check PASSED 25 Oct with no code defects, recorded in the return handoff section 2c; recipe in `2026-10-25-local-qa-environment.md`) · [x] S2.6 (Claude; contract change log, repo-root session.md and log.md updated, commits 52563f7 and 60e762d on `feat/shell-nav-switch`; `decisions.md` untouched as the plan requires) · [x] S2.7 +O (both whole-branch reviews done and fixed 25 Oct: Opus FAIL 2M+4L fixed in 9eead9d, Codex FAIL 1M+1L fixed in f18d215, owner decisions applied; full gate green 159 files / 1,435 tests; return handoff 2d and 2e. **Branch pushed and PR #11 opened 25 Oct** (`feat/shell-nav-switch`, base `feat/shell-nav`, stacked on #9; merge #9 first, then retarget #11 to `leapswitch-redesign`). **Shell PR 2 complete; awaiting the owner's review and merge.**)

### Wave 2b: backend (parallel to the shell)
- [x] HB1 +O (commit 511f1ef on feat/home-snapshot; Opus PASS; Codex review PASS; branch not yet pushed or PR'd) · [ ] HB2 · [ ] HB3 · [ ] HB4 · [ ] HB5
- [ ] MB1 · [ ] MB2 · [ ] MB3 +O · [ ] MB4
- [ ] IB1 · [ ] IB2 · [ ] IB3 · [ ] IB4 · [ ] IB5
- [ ] PB1 · [ ] PB2
- [ ] NB1 · [ ] NB2 · [ ] NB3

### Wave 3: shared UI kit
- [ ] K1 · [ ] K2

### Wave 4: pages (frontend), order Portfolio, Home, Mutual Funds, Individual Fund, Planning, Profile
- [ ] PF1 · [ ] PF2 · [ ] PF3 · [ ] PF4
- [ ] HF1 · [ ] HF2 · [ ] HF3 · [ ] HF4 · [ ] HF5
- [ ] MF1 · [ ] MF2 · [ ] MF3 · [ ] MF4 · [ ] MF5 · [ ] MF6 +O · [ ] MF7 · [ ] MF8 · [ ] MF9 · [ ] MF10 · [ ] MF11 · [ ] MF12 · [ ] MF13 · [ ] MF14 · [ ] MF15 +O
- [ ] IF1 · [ ] IF2 · [ ] IF3 · [ ] IF4 · [ ] IF5
- [ ] PL1 · [ ] PL2 · [ ] PL3 · [ ] PL4
- [ ] PR1 · [ ] PR2 · [ ] PR3 · [ ] PR4 +O · [ ] PR5 · [ ] PR6 +O · [ ] PR7 (Claude) · [ ] PR8 (Claude) · [ ] PR9 (Claude, owner's explicit go) · [ ] PR10 +O

### Wave 5: integration
- [ ] I1 (revisit the accepted import-notice Back limitation) · [ ] I2 · [ ] I3 (Claude) · [ ] I4

### Wave 6: QA fixes
- [ ] Q1 · [ ] Q2 · [ ] Q3 · [ ] Q4

### Wave 7: merge
- [ ] M1 · [ ] M2 +O

Total 88 runs: 1 + 13 + 19 + 2 + 43 + 4 + 4 + 2.

## Next exact step

**TEMPORARY ACCOUNT SWITCH 2026-10-25 (read `2026-10-25-account-switch-return-handoff.md` first, it is newer than everything below):** the Windows desktop account holds the baton until the first account's limit resets (08:20 UTC). S2.4 is DONE (gate closed 25 Oct; the last Codex re-review of `1c5a686` found only a Low, fixed in `93f07ff`, and the owner skipped a further round; the import-notice Medium is an accepted limitation). S2.5 is DONE (manual check passed; see the return handoff section 2c for the two owner questions it raised: Profile "(Me)" name fallback, Equity collapse on a child page). S2.6 is DONE (docs and log). S2.7 is DONE and PR #11 is open (return handoff 2f). Immediate: ask the owner which track next (Wave 2b backend runs HB2 onward, or the Wave 1 manual work), and wait for the owner's review and merge of #9, then #11 (the PR description states that the branch must not go to ls-staging alone: M1, no enabled path to Mutual Funds until Home and Portfolio are live; no Lows remain open from the S2.7 reviews: L2 and L3 were fixed in the second pass). Run S2.7 with the efficiency changes the owner approved 25 Oct (return handoff section 3b): targeted tests per fix, one full run per PR, Codex and Opus whole-branch reviews in parallel at S2.7, recurring review checks turned into automatic guard tests, and a measured WSL-native-disk speed test. Review policy proposed 25 Oct: Opus only for the final whole-branch review (S2.7, MF15, PR10, M2), Sonnet subagents for other "+O" runs (section 3; the Opus blanket-approval line above stays until the owner confirms). Frontend checks run in WSL only (node_modules is Linux-only).

New orchestrator: follow Prompt 1 in `2026-10-24-ui-redesign-new-account-prompt.md`. Immediate: finish S2.4 (verify the PORT MAP rows, Codex review prompt for S2.3+S2.4, Opus review, fix test-first, record), then S2.5 to S2.7. Not fixed from the Opus final review (Low): **import notice can resurface 2+ Back-hops away (owner accepted as a documented limitation 25 Oct 2026; revisit in I1, when real pages replace the placeholders; reproduced, see the return handoff section 4; closing it would change locked decision 6)**, Equity button double-handled Enter/Space, FocusLayout origin guard, paths dot-segments, Sidebar non-null assertion, useRegistry rebuild, placeholder span role and double tooltip title, contract title line still says v1.6. Carry into S1.3/S2: scope reset may fire through the Equity redirect (check in useScope, T5); the T3 plan text still lists overlapCompare and /planning/scenarios, which contract v1.6 removed (plan text to update). S2.4 and I1 must make group-redirect targets live; HB3 stale today_gain note.
