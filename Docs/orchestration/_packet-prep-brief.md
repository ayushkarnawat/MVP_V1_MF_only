# Packet-preparation brief (for Sonnet subagents; not committed)

You prepare ONE front-end work packet for the Unifolio UI redesign: tests-first, built later by Gemini (a weaker builder that follows the packet literally). Machine: Windows, use PowerShell (not WSL). Repo: `C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only` (do not touch its working tree). Docs worktree (read docs here and write your packet doc here; DO NOT commit there; DO NOT edit `ui-redesign-decisions-register.md`): `C:\Users\Dell\Desktop\MVP v1\wt\docs\Docs\orchestration`. Plans are in `..\superpowers\plans`.

## Precedence and rules
- Source precedence: mockups, then the register (C101-C135, Low items) and owner decisions, then design docs, then the plan. Read the register entries about your page.
- Backend contracts already exist (backend handoffs / functional specs). Do not invent endpoints; log missing data as a backend ask and default to hiding the element.
- Copy exactly the method and document shape of the sibling finished packet named in your task: Step 0 (with the exact red-test commit message the packet requires), file map, per-task checkpoints, rules, report template, spec fixtures produced with exact Decimal arithmetic where numbers appear, a defaults/conflicts section.
- Tests must be tight enough that hard-coding to pass is impossible, and red for the right reason (missing modules or behaviour). Keep the sibling's file-map discipline (new files + a few named edits; shell route edits limited to the `page` line; edit the live-routes list in `wrappers.test.tsx` as the sibling did).

## Steps
1. In the named packet worktree (node_modules is a junction: NEVER run npm install) write the red tests, fixtures and types the packet needs and commit them on the feature branch with a message starting with the text your task names. Do not push.
2. Build a private reference solution that makes every test green, in a separate worktree OUTSIDE the packet worktree: `git -C <packet worktree> worktree add --detach "<ref path>" HEAD`, then junction `<ref>\frontend\node_modules` to the packet worktree's `frontend\node_modules`. Implement there; never commit it.
3. In the reference (`$env:NO_COLOR='1'`; strip escapes before grepping; run each from `<ref>\frontend`): `npx tsc -b`, `npx oxlint <feature folders>`, `npx vitest run <feature folder> --maxWorkers=4`, `npx vitest run src/shell src/App.test.tsx --maxWorkers=4` (expect failures only if your packet legitimately edits shell tests; say so), `npx vitest run src/components/ui/charts src/lib src/styles` (16 files/188), `npm run build`. Put the exact green counts in the packet.
4. Write the packet doc to the file named in your task, and append a "Gemini prompt" section shaped like the prompts in `ui-redesign-gemini-prompts-2026-10-27.md` (use the Gemini folder named in your task).

## Final reply (max 150 words)
Red commit sha, reference path, green counts (feature files/tests, shell+App, kit), file-map size, defaults you chose (one line each, numbered, for later register entries), backend asks, anything unverified. No long outputs.
