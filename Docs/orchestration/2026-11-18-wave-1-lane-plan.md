# Wave 1 lane plan (18 Nov 2026): who builds what, in which order

Owner decisions of 18 Nov applied here: Codex one task at a time (backend); **Antigravity (Gemini) up to four sessions at once**, and as much frontend as sensible goes to Gemini; Claude (manager's Claude) writes the frontend red tests, the packets, the integration and every review; adversarial reviews only where most necessary; Batch L's server work is run by Claude (read-only). Plans stay as written except where this file says "moved".

## 1. Codex queue (one at a time, backend only)
| # | Task | Why this order |
|---|---|---|
| 1 | **B-1 + B-3** structured 429 reply (handoff written: `2026-11-17-b1-structured-429-handoff.md`) | Unblocks the front end's countdown contract. |
| 2 | **B-2** per-address guard, table, migration 0054, cleanup job | Needs B-1. Evidence for the address rule: `2026-11-18-client-address-verification.md`. **Adversarial review: yes** (security). |
| 3 | **C-5** `folio_number` in three payloads (additive) | Gemini's folio screens read the new field. |
| 4 | **C-3** category donut merge (one call to `canonical_category`) | Small. |
| 5 | **B-9** four Head of Family emails (designs from Batch B workbook section 6; assets by Claude, B-11) | Large; own lane. **Adversarial review: yes** (hostile names, links, tokens). |
| 6 | A: XR-2 fixtures and independent XIRR; RK-3 recount script; CA-3 checks (all read-only, synthetic) | Ships nothing; can interleave when a backend slot is free. |
Moved off Codex to others: B-4 contract code (Claude, tiny, tied to the 429 correction); C-2, C-6, C-7, C-9, B-6, B-8, B-10, B-12 (Gemini, with Claude's red tests).

## 2. Gemini lanes (disjoint files; up to four at once; each in its own clone and branch)
| Lane | Tasks in order | Files (owner) | Waits for (red tests by Claude) |
|---|---|---|---|
| **G-a** | B-6 wrong-person warning, then C-9 import member refresh and landing | `features/import/prompts/MemberNotInFileDialog.tsx`; then `shell/wrappers/ImportWrapper.tsx`, `features/import/useImportOrchestration.tsx`, maybe `PromptHost.tsx` | B-5 tests (ready now); C-9 tests (next) |
| **G-b** | B-8 countdown, then B-10 tick, then B-12 onboarding and the green switch | `features/auth/AuthEntryFlow.tsx`, `features/auth/redesign/*`, `styles/auth-tokens.css` (one owner at a time) | B-4 tests (now), B-7 tests (next) |
| **G-c** | C-6 folio store, then C-7 `FolioNumber` and the screens | `lib/folioVisibility.ts`, `components/mf/FolioNumber.tsx`, holdings table, fund page folio rows, ledger, `OpeningBalanceModal.tsx`, the two `types.ts` | C-6 tests (next); the eye-icon packet |
| **G-d** | C-2 remove the "assumed main manager" line; then the next free frontend task | `features/mutual-funds/allocation/FundManagerCard.tsx` | C-2 test (ready now) |
G-a and G-d may run in parallel with G-b and G-c: no shared file. If a task needs a file outside its list, the worker stops and reports it.

## 3. Claude's queue (alongside)
1. Red tests, in this order (each one unblocks a lane): B-5 (done first), C-2, B-4 (+ contract code), C-6, C-9, B-7.
2. Packets for each Gemini task: written from the batch workbook's drawings (strings and measurements quoted), the palette reference, and the live code; a screenshot of each result next to the workbook drawing; exact differences sent back.
3. B-11 email assets from workbook section 6; C-4 recompute note; C-1 handoffs; A-0 handoffs and RK-2 protocol.
4. Batch L: L-1 queries and tests, L-2 guide, then L-3 run on the VM (read-only, by Claude as the manager's Claude) after day 20 for the final pass; first pass as soon as the guide is tested.
5. Reviews: I review every diff myself. **Adversarial review** (Sonnet subagent, or a pasted prompt to Codex) only for B-2, B-9, C-9, A's number fixes, and the whole-batch review of B and C before merging. Opus only on your word.

## 4. How a Gemini task runs (mechanics)
- One clone per lane under `C:\Users\Ayush\ag-<lane>` made with `git clone --local "D:\Unifolio code"`, on a lane branch cut from the batch branch (for example `ag/b6-warning` from `batch/b-journey`). Gemini never touches `D:\Unifolio code` or the batch worktrees.
- Clones are made with `git clone --no-hardlinks "D:\Unifolio code" C:\Users\Ayush\ag-<name>` (hardlinks cannot cross drives), then a lane branch cut from the batch branch. Packets are copied into the clone as untracked files.
- Checks run in WSL on the lane's own mirror through one script that gives every lane its own copy, so four lanes never collide: `wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-<name> test <paths>` (also `types`, `lint <paths>`, `build`). Lane `b`, `c`, `a`, `l` check the orchestrator's batch worktrees. The node_modules of each mirror is hard-linked once from `~/cr6-fe` (no extra disk).
- Started 18 Nov: G-a `ag-b6` (B-6), G-b `ag-b8` (B-8), G-d `ag-c2` (C-2). G-c waits for the C-6 red tests.
- Result comes back as a diff: I apply it to the batch worktree as a patch, rerun the named tests, screenshot against the workbook drawing, and commit on your word. Workers never commit.

## 5. Commit and merge strategy (decided by the orchestrator, 18 Nov)
- Docs (handoffs, packets, evidence, session) are committed on `leapswitch-redesign` and fast-forwarded into the four batch branches so every lane sees them.
- Code and red tests are committed on the batch branches only (`batch/b-journey`, `batch/c-hygiene`), never on `leapswitch-redesign` until the batch gate passes. Red tests go in their own commit with the count of failing tests in the message.
- Nothing is pushed to origin until you say so.
