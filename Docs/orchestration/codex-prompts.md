# Reusable Codex prompts (verify, adversarial review, fix-from-findings)
Paste one into Codex, filling the `<...>` fields. Codex writes its result to `Docs/orchestration/reviews/<name>.md` and the orchestrator reads only its verdict and findings. Codex never pushes or merges.

## 1. Verify a worker's report
```
You are an independent verifier for the Unifolio redesign backend (FastAPI, SQLAlchemy, Decimal money). Do not write feature code.
Worker report and handoff: <path of the handoff> and the report pasted below. Branch/worktree: <branch> in <worktree path> (read-only for you). Base commit: <SHA>.
1. Scope: `git diff --stat <base>..<branch>`; every file must be inside the handoff's file map; list any that is not. One commit per task with the handoff's message format.
2. Tests: run the handoff's test commands with your OWN --basetemp (shared basetemp collides): `/mnt/d/Unifolio code/backend/.venv/bin/python -m pytest <paths> -q --basetemp=<your dir>`; report counts and compare with the worker's CHECKPOINT lines. Known unrelated failures: 5 AMFI-cache `test_portfolio_disclosure_client/manual` tests, the `xlwt` collection error, and under `-p tests.offline_http` the two named baseline tests.
3. Independent check: write your own calculator from raw SQL rows (transactions, nav_history) for one multi-fund synthetic household (copy of /home/ayush/s25/s25.db; never write the original) and compare 3 scopes x 3 clocks (Friday, Saturday, Monday) with the new routes to the paisa.
4. Injected bugs: apply 5 mutations to the key logic in a scratch copy (sign, rounding, window bound, scope, units) and report which survive the new tests.
5. Fixtures and gates: golden fixtures stable (regenerate in a scratch copy and diff); the task's gate script passes on a private DB copy.
Write `Docs/orchestration/reviews/<name>-verify.md`: verdict (OK / not OK), findings by severity with file:line and a reproduction, what you could not check. No finding without a reproduction.
```

## 2. Adversarial PR review
```
You are an adversarial reviewer for pull request <#> (<branch> into <base>) of the Unifolio redesign backend. Try to break it; do not write feature code and do not modify the repo (extract a copy with `git archive`, work in /home/ayush/<scratch>).
Spec: <handoff/spec paths> and the register `Docs/orchestration/ui-redesign-decisions-register.md` (decisions already taken are not findings).
Hunt for: wrong numbers (rounding, sign, units, dates, as-of day, partial/stale flags, sold funds, opening balances, statement-priced funds, members vs aggregate), crashes on odd data (empty, one fund, NaN/malformed stored sections, huge ranges), any GET that writes or downloads, cache or performance regressions for the Dashboard (statement counts before and after), response models vs behaviour, tautological or loose tests (inject 8 mutations and list survivors), Postgres portability, timezone (IST vs UTC) and leap-day edges. Build an independent calculator from raw rows and compare to the paisa. Run the PR's tests and gates on private copies.
Write `Docs/orchestration/reviews/pr<#>-adversarial.md`: verdict (safe to merge or not), findings (Critical/High/Medium/Low) with file:line, reproduction (inputs, wrong vs right) and suggested fix; what you could not check.
```

## 3. Fix from findings
```
You are fixing every finding (Lows included) in `Docs/orchestration/reviews/<name>.md` for <branch> in worktree <path>. Stay inside that worktree; no push, no merge, no branch switch. A finding stays unfixed only if it is a design decision recorded in the register (name it with the reason) or needs the owner (say so).
Tests first: add a test that fails on the current code for each finding, see it fail, fix, see it pass. Additive changes only; Dashboard behaviour and cache-key shapes unchanged; Decimal, never float; run pytest with your OWN --basetemp. Do not edit an existing test unless the finding says it is wrong (then explain).
Report in `Docs/orchestration/reviews/<name>-fixes.md`: per finding the files, the test names, before/after output; the full run (`pytest tests/api tests/services/home tests/services/dashboard -q`) and any gate script; `git status --short`; anything not fixed and why. Commit nothing: the orchestrator verifies and commits.
```
