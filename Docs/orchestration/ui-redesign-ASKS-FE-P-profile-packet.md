# Packet ASKS-FE-P for Gemini (Antigravity): Profile consent version label, front end (one component edit)
**Status:** READY FOR GEMINI (written 27 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/profile`, in the git worktree `/home/ayush/wt/profile-fe` on WSL (open it as `W:\home\ayush\wt\profile-fe`). Stacked on the green PR-C commit `475eccd3`. The red-test commit is `45944be9` (made on the manager machine; the owner pushes it and syncs the Gemini worktree before the prompt is pasted). Never touch another worktree.
**Parent:** register C139 (backend ask: consents call returns document title and readable version) and C158 (built and merged, PR #20: `GET /legal/consents/me` rows now carry optional `document_title` and `version_label`; the label is the date at the end of the version id, e.g. `tos-placeholder-2026-10-01` becomes `1 Oct 2026`, the raw id when it has no date); C157 (owner accepted defaults). Profile plan `Docs/superpowers/plans/2026-10-23-profile-plan.md` task T7 (Data & Privacy). Method as PR-C. **This packet is the whole truth for this run.**

## What this run is, in one paragraph
**The whole job is one component edit: `frontend/src/features/profile-v2/components/ConsentList.tsx`.** The tests, the optional fields on `MyConsent` (`frontend/src/features/legal/api.ts`) and the extended spec fixture are already committed red. Show the server's `version_label` in each consent row, in its own element, and hide it when it is absent. Four new tests are red; everything else is green.

## Rules (read twice)
1. **Scope.** Edit **only** `frontend/src/features/profile-v2/components/ConsentList.tsx`. No new file. Tests, fixtures, `types.ts`, `legal/api.ts`, route files and every other file are out of bounds.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and say so in the report.
3. **Keep the page's own wording.** The row name stays "Terms of Service" (from `consentName`). **Never show `document_title`** (the registry says "Terms & Conditions"; the owner decision is to keep "Terms of Service"). Do not read `document_title` at all.
4. **Never invent.** If `version_label` is missing, `null` or an empty string, render **nothing** for it (no fallback text, no placeholder, no computed date). Show the value exactly as received (it may be a raw id such as `tos-v2`; do not reformat it, do not parse the version id yourself).
5. **Keep everything that exists**: the `consent-name`, the existing `consent-version` element ("Version <raw id>") and the `consent-date` element stay exactly as they are.
6. No `parseFloat`, `toFixed`, `toLocaleString`, `Intl.NumberFormat`; never write `pan` directly followed by a colon; no hard-coded colours (CSS variables only); no `any`, no `console.`, no `!`; no new import; 2-space indentation, double quotes, semicolons. Guard tests grep whole files, comments included.
7. No `npm install`; run every command inside WSL; run folder tests with `--maxWorkers=4`. Do not commit, do not push.
8. If anything differs from this packet, stop and report it.

## Step 0: environment check (do this first, and report the output)
Run each (git from `/home/ayush/wt/profile-fe`, npm/npx from `.../frontend`; `wsl.exe -d Ubuntu --cd <dir> -- <command>`; a command with `|` goes through `bash -c "..."`):
```
git branch --show-current          # expect: feat/profile
git log --oneline -2               # expect the top line to start with: test(profile): failing tests for the consent version label (ASKS-FE-P)  and the next: feat(profile): Family Members and Data & Privacy, PR-C (green)
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect: no output
npx vitest run src/features/profile-v2 --maxWorkers=4   # expect: Test Files 2 failed | 38 passed (40); Tests 4 failed | 579 passed (583)
```
If any expectation fails, **stop and report**.

## File map (one file)
| File | Action |
|---|---|
| `frontend/src/features/profile-v2/components/ConsentList.tsx` | edit |

## Specification
Inside each row's inner `<span className="min-w-0 flex-1">`, **after** the `consent-version` span and **before** the closing of that inner span, add (only when `consent.version_label` is a non-empty string) a space and then:
```tsx
<span data-testid="consent-version-label" className="text-xs text-[var(--ui-text-muted)]">
  {consent.version_label}
</span>
```
Its text must be exactly the label (for the fixture: `14 Oct 2025`, `14 Oct 2025`, `21 Oct 2025`), nothing added around it. Render it only when the value is truthy (`consent.version_label ? (...) : null`), so `undefined`, `null` and `""` all show nothing. The label comes after the name in document order, in the same row. A one-line comment saying why `document_title` is ignored (the owner keeps "Terms of Service") is welcome; keep it free of the forbidden words in rule 6.

Checkpoint: `npx vitest run src/features/profile-v2/components/ConsentList.test.tsx src/features/profile-v2/pages/DataPrivacyPage.test.tsx` all green.

## Final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/profile-v2                  # expect: no output, exit code 0
npx vitest run src/features/profile-v2 --maxWorkers=4   # expect: Test Files 40 passed, Tests 583 passed
npx vitest run src/shell src/App.test.tsx --maxWorkers=4   # expect: Test Files 27 passed (27); Tests 350 passed (350)
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed (16); Tests 188 passed (188)
npm run build                                       # expect: "built in" with no error
cd .. && git status --short                         # expect exactly: " M frontend/src/features/profile-v2/components/ConsentList.tsx"
```
**Do not commit and do not push.**

## Report (one fenced block, real outputs)
```
GEMINI REPORT — ui-redesign — ASKS-FE-P (Profile consent version label)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL prefix? Could you edit files? Step 0 outputs:
1. FILE EDITED (exact path):
2. CHECKPOINT output (last lines):
3. FINAL CHECKS, full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET:
5. TESTS THAT SEEMED WRONG (exact failing assertion):
6. CONFIRMATIONS: only ConsentList.tsx changed: yes/no; document_title never read or shown: yes/no; tests, fixtures, types untouched: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## Defaults and conflicts (orchestrator notes, not for Gemini)
1. **Label shown in its own element, not replacing the raw id.** The existing "Version <raw id>" text stays (existing tests and the spec say so); the label is added after it. If the owner prefers the label to replace the raw id, that is a one-line change plus test edits in a later run.
2. **Bare label text, no prefix** ("14 Oct 2025"), exactly as the server sends it, so a raw-id fallback ("tos-v2") also reads sensibly.
3. **Wording kept**: "Terms of Service" stays; `document_title` is typed but never read.
4. **Hidden when `undefined`, `null` or `""`**; an older server (fields absent) renders as before.
5. **Fixture extended** (`fixtures/consents.ts`, still a spec fixture): titles "Terms & Conditions", "Privacy Policy", "PAN disclaimer", labels "14 Oct 2025", "14 Oct 2025", "21 Oct 2025" (the dates at the end of the fixture version ids, formatted the way the backend `version_label` does; the backend test pins `tos-placeholder-2026-10-01` to `1 Oct 2026`). The fixture guard test now requires the two new keys.
6. Of the six new test cases, hide-cases (missing, null, empty) and the wording case pass already on the unchanged component by design (they guard against over-building); the four red tests are the shown label (component and page), the raw-id label, and the document order.
7. No backend ask, no shell or route edit, no `wrappers.test.tsx` change.

## Gemini prompt (paste into the Gemini window; the folder is `W:\home\ayush\wt\profile-fe`)
Before pasting: the owner pushes the ASKS-FE-P red commit from the manager machine and syncs the Gemini worktree as in "SYNC FIRST" of `ui-redesign-gemini-prompts-2026-10-27.md` (worktree `/home/ayush/wt/profile-fe`, branch `feat/profile`; expected top commit: `test(profile): failing tests for the consent version label (ASKS-FE-P)`, below it PR-C green `475eccd3`). Gemini must not run the sync.
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\profile-fe (WSL path /home/ayush/wt/profile-fe, branch feat/profile). Before anything else run `git status --short` and `git log --oneline -3`; the first must print nothing and the top commit must be the red-test commit the packet names (test(profile): failing tests for the consent version label (ASKS-FE-P)). If not, STOP and report; do not fix it yourself. Then read, completely and in order, Docs/orchestration/ui-redesign-ASKS-FE-P-profile-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-ASKS-FE-P-profile-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every rule and checkpoint exactly. The tests are already written and red; you edit only one file, frontend/src/features/profile-v2/components/ConsentList.tsx. Never edit a test, fixture or types.ts, never run npm install, never commit. Never show or read document_title; keep the wording "Terms of Service". Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/profile-fe ...) and use --maxWorkers=4 for folder runs. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```
