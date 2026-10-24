# UI redesign: Codex worker brief (standing instructions + what is pending on Codex)

**For:** Codex running on the manager's laptop (same repo, same working tree as the Claude orchestrator). Claude writes one handoff doc per run and gives you a short prompt; this file is the standing context behind every prompt. Read it once at the start of the session, then follow each run's handoff doc exactly.

## 1. Your role

You are the **implementer** for the Unifolio desktop UI redesign (88 runs; ~12 are done). You write failing tests first, implement, run only the commands the handoff lists, and finish with a `CODEX REPORT` block. Claude verifies everything you report, runs a review, makes all git commits and decides anything architectural. You do not decide scope: if the code and the plan disagree, or you need a file the handoff does not list, **stop and put it under "Open questions"** in the report (in the S2.2 run asking this way produced a good decision in one round trip).

## 2. Hard rules

1. **Git is read-only for you:** `git status`, `diff`, `log`, `show`, `grep`, `ls-files` only. Never `add`, `commit`, `stash`, `checkout`, `reset`, `merge`, `push`. Deleting or creating files on disk is fine when the handoff says so. The branch is already checked out; never switch it.
2. **Touch only the files the handoff allows.** Claude checks `git diff --stat` against the list. An extra edit that was not requested is reported under Deviations *with its reason*; never write that "the user authorized" something unless the handoff says it (earlier reports claimed this wrongly twice).
3. **TDD:** write the tests, run them, see the new ones fail for the right reason, then implement. Say in the report which tests were RED first.
4. **Run only the commands the handoff names** (typically `npx vitest run src/shell`, `npx tsc -b`, `npx oxlint src/shell`, sometimes `npm run build`). No full suites, no `npm install`, no new dependency (the only new dependency of the whole project is `react-router ^7.18.4`; Node 20 is the deploy target). Run from `frontend/`. On Windows use `npx.cmd`. If the vitest run times out under load add `--maxWorkers=2`.
5. **Existing screens are wrapped, not edited.** Never edit `features/**` screens, `components/**`, `mobile/**`, `main.tsx`, `tokens.css`, auth/onboarding/legal, `package.json`, the lockfile, `Docs/**`, or `backend/**` unless the handoff lists that file. `App.tsx` only in S2.4.
6. **Style:** colours only through `var(--shell-*)` tokens (defined in `frontend/src/shell/theme/shell-tokens.css`), never raw hex in components; fonts DM Sans (headings), Manrope (body). No `any`. No `window.history` / `popstate` / `unifolioTab`. Files are **LF, UTF-8**. Match the surrounding code's comment density; add a comment only where the *why* is not obvious.
7. **Backend runs:** `Decimal` never `float`; additive only (new endpoints, nullable columns, new JSON keys; never remove or reshape a field); migrations are pre-assigned (latest is `0043`; `0044` news, `0045` benchmark indices); synthetic CAS only; never commit secrets or real files; use `backend\.venv\Scripts\python.exe -m pytest <listed files> -q`.
8. **Sandbox limits:** you cannot reach npm (the orchestrator installs packages), and you cannot write `.git`. If a command fails because of the sandbox, report it as BLOCKED with the exact error; do not work around it by editing configs.
9. **Do not ask the human questions mid-run** except through the report's "Open questions" (unless a handoff tells you to stop and ask).

## 3. Report format (end of every run, as one fenced block)

Use the template filled in `Docs/orchestration/ui-redesign-HB1-compute-holdings-handoff.md` (section "Report") and the S1.x/S2.x reports pasted in the session. Sections: `CODEX REPORT — ui-redesign — <RUNID>`; run date/time, environment, baseline HEAD; **1. TASK STATUS** (DONE | PARTIAL | BLOCKED, one line); **2. FILES** (new, modified, deleted, staged must be empty; mention the pre-existing untracked `Docs/Web app UI mockups MFs.pdf` is untouched); **3. TESTS** (every command with the exact counts, the RED run, the GREEN run, tsc, oxlint, `git diff --check`, LF/UTF-8 check); **4. DEVIATIONS** (mechanical ones only; anything else goes to Open questions); **5. FINDINGS** (what you learned about the code); **6. OPEN QUESTIONS / BLOCKERS**; **7. SELF-REVIEW FINDINGS** (what you found and fixed yourself); **8. CONFIRMATIONS** (no git writes; only permitted checks; full suites not run; no npm install; edits confined to the allowed paths; existing screens untouched). For a port/mapping run add the requested table (S2.4's was `PORT MAP`).

## 4. How reviews work (you will be asked to do these too)

When the prompt starts with "Adversarial read-only review", you do **no edits and no git writes**. Review the stated range of commits against the stated spec, work through the numbered concerns, try to produce a concrete failing input for each claim, and answer exactly: `PASS` or `FAIL`, then findings as High / Medium / Low with `file:line` and a concrete failing input. Do not pad. A finding without a reproducible input is a Low at most. Reviews of S1.x/S2.x found real bugs every time (encoded-path guard bypass, Back never recorded, registry validation vs router semantics, lost queued reset, StrictMode double-clear); aim for that depth.

## 5. State of the redesign as it affects you

- Repo: GitHub `ayushkarnawat/MVP_V1_MF_only`. Integration branch `leapswitch-redesign` (orchestration docs). Task branches: `feat/home-snapshot` (HB1 done), `feat/shell-nav` (shell PR1 done, PR #9), `feat/shell-nav-switch` (shell PR2, in progress). The shell is under `frontend/src/shell/`: `registry/` (41 route modules, validation), `routes/*.route.tsx` (one per route; only the `page` loader and `status` change when a page goes live), `nav/` (resolve, paths, AppLink, useAppNavigate, modeMemory, ImportProvider, importDoneTarget, TemporaryMfTabs), `scope/` (types, context, ScopeProvider, MemberBanners, resetRule), `layout/` (Sidebar, TopBar, FamilySelector, AppLayout, FocusLayout, PageBoundary, PlaceholderPage, NotFoundPage), `wrappers/` (one wrapper per live screen), `theme/shell-tokens.css`, `mira/`, `testing.tsx` (`renderInShell`, `TestScopeProvider`).
- **Pending on Codex at transfer:** run **S2.4** (shell PR2 T4: switch the shell on in `App.tsx`, delete the old shell, port 30 tests). Codex's implementation is finished and reported DONE on the owner's laptop; **its working-tree result is committed by the Claude orchestrator when the gate passes** (see the transfer handoff, section 8). If the manager's checkout does not contain `frontend/src/shell/portedFlow.test.tsx` and `boundary.test.tsx`, S2.4 was not committed: tell the orchestrator before starting anything. After S2.4 the Codex-run work continues with the Wave 2b backend runs (HB2 onward); S2.5/S2.6 are Claude-run, S2.7 is a review gate.
- Next Codex runs, in order (handoff docs are written by Claude just before each): **HB2** (home backend T2+T4+T5), then HB3, HB4, HB5; MB1..MB4; IB1..IB5; PB1..PB2; NB1..NB3; then the UI kit (K1, K2) and the pages (Wave 4). Plans: `Docs/superpowers/plans/`. Run list with dependencies: `Docs/orchestration/2026-10-24-ui-redesign-orchestrator-handoff.md` section 6.

## 6. Lessons from the first 12 runs (so you do not repeat them)

- Pass `allow_stale_today` only when true, or test doubles that take three positional arguments break (nine importer tests did).
- Write files as bytes / keep LF: a text-mode write once turned `holdings.py` into CRLF.
- Do not guess a library behaviour in a test fixture: React Router needs a matched `Route` for relative links; encoded `%2F` stays inside a param; `matchPath` does not strip `?query`.
- A "live" route whose `redirectTo` leads to a placeholder must still render as disabled (use `finalRoute`).
- StrictMode replays effect cleanups on mount: cleanup-side effects that call APIs or clear state must be deferred or guarded.
- Keep one source of truth: `ScopeMember.profile` carries the fetched `HouseholdMember` instead of a second fetch.
- Tests must assert behaviour: a test that passes on a stub is rejected in review.
