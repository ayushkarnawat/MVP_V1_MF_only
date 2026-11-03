# UI Round 2 and Auth Redesign: Codex (backend) standing rules

Every `ui-s*` handoff tagged **[Codex]** points here. Plan: `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`. Commit prefix `ui-s<N>:` (Claude commits, not you). The orchestrator is Claude. Read `Docs/orchestration/ui-redesign-codex-worker-brief.md` once; this file adds what is specific to this project and wins where they differ.

## Your lane
- **Backend only.** You never edit `frontend/**`. The frontend is built by Antigravity against the response shapes in your handoff, so **the field names, types and example payloads in the handoff are a contract: do not rename, reshape or drop a field.**
- **Git is read-only for you** (`status`, `diff`, `log`, `show`, `grep`). Never `add`, `commit`, `stash`, `checkout`, `reset`, `merge`, `push`. If the sandbox cannot write `.git`, that is expected: implement and self-check, and Claude stages and commits.
- Work in the Codex clone named in the handoff, on the throwaway branch `codex/ui-s<N>`. Never in the main working tree.

## Hard rules
1. **Touch only the files the handoff lists.** Any extra edit goes in the report under Deviations with its reason.
2. **TDD.** Write the failing test, run it, see it fail for the stated reason, then implement. The report says which tests were RED first.
3. **Backend changes are additive** except the S5 goals migration: new response fields have defaults so old clients keep working; new routes; no removed or reshaped field. **No migration unless the handoff gives you its number and text.** Never invent a migration number; the goals migration is `0053` if the head is still `0052`, and you stop if it is not.
4. **Money and units are `Decimal`**, never `float`, serialised as strings.
5. **Identity rules (S3).** A statement in a different name never renames the account holder, never changes their name source or PAN, and never writes a name-change row. PAN goes to the person it belongs to. If a case is not covered by the handoff, STOP and ask.
6. **No live network in tests.** Synthetic CAS files only (`Docs/CAS Files/synthetic/pdfs/`, password `MF@123`). Never commit or read a real statement, secret or `.env`.
7. **Run only the commands the handoff names** (usually `cd backend && pytest <files>`; Postgres-only behaviour: `pytest tests/functional_postgres/<file>` with `TEST_DATABASE_URL`). No full suite, no dependency changes.
8. **Files are LF, UTF-8.** Match the surrounding style. No `any`-style shortcuts: typed schemas.
9. **Sandbox limits.** If a command fails because of the sandbox, report BLOCKED with the exact error; do not edit configs to get round it.
10. **Do not ask the human questions mid-run** except through the report's Open questions.

## Known failures that are not yours
Backend failures in `tests/scripts/test_refresh_news.py`, one `test_fund_valuation_layouts` case, and 5 tests that need `backend/.cache/amfi_navall/nav_all.txt`.

## Report (one fenced block, `CODEX REPORT: ui-s<N> <slug>`)
Task status (DONE, PARTIAL or BLOCKED); baseline HEAD; the exact commands run with pass and fail counts; which tests were RED first; `git status --short`; the final response shape of every endpoint you changed (a real example payload); Deviations; Open questions.

## Reviews
When the prompt starts with "Adversarial read-only review", make no edits and no git writes. Review the stated commit range against the stated spec, work through the numbered concerns, try to produce a concrete failing input for each claim, and answer `PASS` or `FAIL` then findings with file and line.

## Paste-ready prompt (the orchestrator fills the angle brackets)
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/<slug>-handoff.md (your task: <task ids>)
Work only in <codex clone path> on branch codex/ui-s<N>. Tests first. Git is read-only. Do not touch frontend/**.
Reply with the CODEX REPORT block from the rules file, nothing else.
```
