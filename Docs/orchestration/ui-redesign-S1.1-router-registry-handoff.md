# Handoff: ui-redesign S1.1 (shell PR 1: router dependency, registry, route files, contract test)
**Status:** REVIEW (committed `e825d10`; Codex review batched into S1.2)
**Parent plan:** `Docs/superpowers/plans/2026-10-23-shell-pr1-router-registry-sidebar.md` Tasks **T1** and **T2** (run R1 of that plan). Contract: `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` (v1.6, section 4 URL map and section 5 route module). Run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md` section 6, run **S1.1**.
**Branch:** `feat/shell-nav` (cut from `leapswitch-redesign`). **Orchestrator:** Claude Code · **Worker:** Codex (manual relay).

## Task
Implement plan **Task T1 (dependency, skeleton, lazy-route spike)** and **Task T2 (registry, route files, contract test)** exactly, in that order, each with its own red then green. Read the plan's "Global Constraints", "Locked decisions" and "Review Focus" first, then only T1 and T2. The plan's route list must match contract v1.6 section 4; if a row differs, trust the contract and report it under Findings.

Baseline before any change (report the results): `cd frontend && npx tsc -b 2>&1 | tail -8` and `npx vitest run src/features/dashboard/NavigationShell.test.tsx 2>&1 | tail -20`.

If `npm install react-router@^7.18.4` is blocked by the sandbox, stop at that step and report BLOCKED (the owner will allow it); never add any other dependency.

## Constraints
Test-first. Existing screens, `App.tsx`, `main.tsx`, `features/**`, `mobile/**`, `tokens.css` are untouched; the only existing files edited are `frontend/package.json` and its lockfile. No backend change. Route files import only from `../registry/types`, `lucide-react` and their own page. No raw hex. Do not touch `Docs/`, `infra/`, real CAS files. Git is read-only for you (`status`, `diff`, `log`, `show`, `grep`, `ls-files`): never `add`, `commit`, `stash`, `checkout`. LF endings, UTF-8. Run only: the new shell test files, `src/features/dashboard/NavigationShell.test.tsx`, `npx tsc -b`, and `npx oxlint src/shell`. No full suite.

## Review Focus (from the plan)
`import.meta.glob` must work under Vitest (T1 step 4 decides this; stop and report if it fails); the contract test must fail on a duplicate id or path, a missing parent, a placeholder without a title, and a URL-map path with no route file.

## Report
Fill in the CODEX REPORT block (template in `ui-redesign-HB1-compute-holdings-handoff.md`, change the run label to S1.1) at the end of your answer, as one fenced block.

## Orchestrator record
- Round 1: BLOCKED at `npm install` (sandbox could not reach npm). Orchestrator installed `react-router@^7.18.4` (one dependency line; lockfile adds `cookie` and `set-cookie-parser`). Codex asked which rule governs a group redirect to a placeholder: decided option 1 (target must exist, not a group, no loop; the stricter live-target rule is a skipped test naming S2.4 and I1).
- Round 2: DONE. 37 passed, 1 skipped (shell tests plus NavigationShell); `tsc -b` and `oxlint src/shell` clean; 41 route files; orchestrator re-ran the same commands and compared the file names with contract v1.6 section 4 (the 12 names my regex missed are the contract's shorthand rows and the fund trio). Codex self-review fixed two (missing title or label threw instead of returning errors; Profile marked live too early). Commit `e825d10` on `feat/shell-nav`.

