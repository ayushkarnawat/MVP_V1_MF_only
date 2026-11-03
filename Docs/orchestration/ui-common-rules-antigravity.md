# UI Round 2 and Auth Redesign: Antigravity (frontend) standing rules

Every `ui-s*` handoff tagged **[Antigravity]** points here. Plan: `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`. Commit prefix `ui-s<N>:` (Claude commits, not you). Worker: Gemini in Antigravity (Gemini 4 "Argon" first; Gemini 3.8 high if that runs out). The orchestrator is Claude. This file extends `cr-r6-common-rules.md` and `cr-r7-common-rules.md`: where they say the same thing, this file wins.

## Your lane
- **Frontend only.** You never edit `backend/**`. If a task seems to need a backend change, STOP and say what is missing. The backend is built by Codex and the orchestrator; the handoff gives you each response shape with an example payload. Build against that payload and the fixtures in the handoff. Never guess a field name.
- **You never run `git add`, `git commit`, `git push`, `git checkout`, `git stash`, `git reset` or any git command that changes anything.** Read-only git (`status`, `diff`, `log`, `show`) is fine.

## Where to work and how to check
- Edit files in the Windows clone the orchestrator names in the handoff (a separate clone under `C:\Users\Dell`, never the orchestrator's `wt/docs` worktree). The orchestrator syncs it to the repo head before each task. Never edit `D:\Unifolio code`.
- If the handoff says WSL is not set up on this machine, run the checks directly in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`, `npm run build`. Otherwise checks run on WSL's own disk through one script that mirrors the clone and runs the tool:
  - Tests: `wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/cr-r6-fe-check.sh" test <paths under src/>`
  - Types: `... cr-r6-fe-check.sh types`; lint: `... lint`; build: `... build`.
- Real PDFs and real data are never used. You cannot look at the screen: say so in the report wherever a visual check applies. The orchestrator takes the screenshots.

## Method per task
1. Read the task text in the handoff, then the real code it names (open the files; do not guess names). 2. Tests first; run them; show each fails for the stated reason. 3. Implement. 4. Run the touched tests **and every test file that reads a name you changed** (search the old names across `src/`). 5. Report in the format below.

## Hard rules
1. **Existing behaviour does not change.** Do not reword an existing string, label or error you were not asked to change. Guard tests (`features/profile-v2/guards.test.ts`, `boundary.test.ts`) may change only a file count or an expected-file list, never a rule.
2. **Plain words on every user-visible string** (no "TRI", "proxy", "fallback"). Short sentences. Never guess a pronoun for a person: use the name, or "them".
3. **Mobile is unchanged.** Under 768 px or on a `/mobile` path the legacy look stays. The only mobile change is the goals screen when the handoff says so.
4. **The existing Inception performance graph is not changed** (its lines, colours, legend, notes, period buttons). Only the toggle row above its period buttons may change, in S4.
5. **Reuse, do not rebuild.** Use `OtpStubBanner` for any test code the API returns in the `otp` field (shown only when non-null, never logged), the green button token and shared info icon from Run 7, and the app tokens (`--ui-*`, `--pos-text`, `--neg-text`, `--c2`, `--c3`). Add new colours only in `styles/auth-tokens.css` and only for the auth screens. Auth screens are light only.
6. **Old and new payloads.** A response without a new field (Home allocation without `funds`, confirm without `new_funds`, returns without `benchmark_label`, `/auth/me` without new fields) renders as it does today, never a crash or a blank.
7. **Money is never added on the client.** Decimals arrive as strings. You format and display. Percent figures on charts are display-only numbers parsed from response strings, and every bar must equal its table cell.
8. **Accessibility.** Every new control is keyboard reachable with a visible focus. Every error is announced. Every motion respects `prefers-reduced-motion`.
9. **Secrets.** Never log a code, a token, an email or a phone number. Never put a token in a query string or local storage.
10. **Edits outside the task's Files list** (fixtures, shared components, other tests): ask first, or list each in the report with the reason. No new dependency, no `package.json` or lockfile change.
11. **Anything that decides who can sign in, whose consent counts, whose PAN is stored or whose name changes: stop and ask** (two options and your recommendation).
12. **Do not ask the human questions mid-run** except through the report's "Open questions", unless rule 11 applies.

## Known failures that are not yours
Three frontend tests fail only when the whole suite runs under load and pass alone. Backend failures are not your concern.

## Report (keep it short, one block)
Failing-test counts before; final counts with the exact commands; `git status --short`; decisions the handoff did not cover; every file edited outside the Files list and why; anything you could not check (visual); Open questions. No narrative about things that did not change.

## Paste-ready prompt (the orchestrator fills the angle brackets)
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/<slug>-handoff.md (your task: <task ids>)
Work only in <windows clone path>. Tests first. Never run a git command that changes anything. Do not touch backend/**.
When done, reply with the report block from the rules file, nothing else.
```
