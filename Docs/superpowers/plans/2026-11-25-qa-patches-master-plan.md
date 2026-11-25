# QA-round fixes: master plan (three patches, seven plans)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans, plan by plan. Steps use checkbox (`- [ ]`) syntax. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs. This project runs on the **orchestrator and workers** strategy of M1 to M4 and the XIRR batch: **Claude orchestrates; Codex builds the back end and the front-end foundation; Antigravity builds the front-end UI.** This master plan decides order, ownership of shared files, branches, gates and the three deploys. Each product plan below carries its own tasks.

**Goal:** Ship every item decided on the owner's plan page (Head of Family, the 12 QA findings, the summary bar, the PDF export speed) in three tagged patches, each deployed by the owner's manager's Claude from a guide this project writes.

**Architecture:** Seven independent plans, each producing working, tested software on its own, merged into three patch integration branches in a fixed order. Shared front-end files are owned by exactly one plan at a time (map below); a plan that needs a file another plan changed waits for that plan to merge.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, Pydantic, pytest, Playwright (print), pypdf, pypdfium2 (back end). React, TypeScript, Vitest, Tailwind tokens, lucide-react (front end).

**Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16; `https://claude.ai/artifact/62WKfZZgwLfjpMDdVV1sFH`; all 30 questions answered; the page is the design and wins over every plan's prose). Related records: `decisions.md` (25 Nov entries), `Docs/orchestration/2026-11-25-export-timing-result.md` and `...-round2.md`, `2026-11-24-qa-round-report.md`.

## The seven plans and the three patches

| # | Plan file (all in `Docs/superpowers/plans/`) | Page items | Patch |
|---|---|---|---|
| 1 | `2026-11-25-hof-part-a-plan.md` | Head of Family Part A (D-11, D1, D2) | **1** |
| 2 | `2026-11-25-d12-category-average-plan.md` | D-12 (QA-12 A) | **1** |
| 3 | `2026-11-25-visual-pass-plan.md` | D-1, D-3, D-4, D-5, D-6, D-7, D-8, D-9 | **1** |
| 4 | `2026-11-25-summary-bar-plan.md` | Item 12 (QA-13 to QA-16) | **1** |
| 5 | `2026-11-25-export-speed-plan.md` Task ES-1 only (timing log) | D-10 timing log | **1** |
| 6 | `2026-11-25-hof-bcd-adddata-plan.md` | Head of Family Parts B, C, D; D-2 (test, then build); Q2 row | **2** |
| 7 | `2026-11-25-export-speed-plan.md` Tasks ES-2 onward | D-10 speed work, QA-19, QA-20, QA-21 | **3** |
Patch 1 unblocks stage 9 (the four Head of Family emails) and carries the one number change (D-12). Patch 2 changes the import and checklist flow and gets its own QA round. Patch 3 is the PDF speed work under the look gate. *(The patch split is a proposal on the page; the owner can ask for one deploy instead, in which case the order below still holds and only Tasks M4 to M6 merge.)*

## Who builds what

| Role | Does | Does not |
|---|---|---|
| **Claude (orchestrator)** | Lane setup, every contract (interfaces, shapes, test names and ids), every handoff and packet, merges, commits, **runs every API, async and Postgres test itself**, real-browser screenshots, reviews, docs, deploy guides, the number and look gates | Write product code (a worker does), delegate design or the interfaces, deploy (the manager's Claude does, at the owner's go) |
| **Codex (backend worker)** | Back-end rules, plumbing and tests; front-end foundation (types, small shared helpers with unit tests, red tests); scripts | Run FastAPI `TestClient` or async tests in its sandbox (it writes them, tries once, reports BLOCKED, Claude runs them), run WSL, commit |
| **Antigravity (frontend worker)** | UI components and CSS from a very detailed packet; red tests first (shows them fail), then builds; checks through `wave-fe-check.sh` | Touch `backend/**`, edit a red test, commit, change any copy |
Fallback if a worker runs out: Antigravity with Claude Sonnet 5.5 high, then Gemini, then inline in Claude (memory: worker fallback order). Capacity (owner): up to two Codex tasks and four Antigravity lanes at once, on disjoint files.

## Global Constraints (every plan inherits these)

- **The old staging link shares the back end:** changes are additive (no field removed or renamed, no route removed). **No migration in any patch; Alembic stays 0054.** No new required setting.
- **Copy never changes in a design pass.** Only strings a plan names are new; everything already built stays word for word. Plain words, **no em dashes**, no advice wording, **no emojis anywhere**; icons are lucide line icons.
- Decimals never floats; the client never adds money. Colours only through app tokens (`--ui-*`, `--pos*`, `--neg*`, `--warn*`); hex only in token CSS files. Palette source: `Docs/orchestration/2026-11-18-palette-reference-for-workers.md` (D-1 changes its green-button rule; Plan 3 updates the file).
- Front-end guards (see each plan): every `<button` has `data-clickable` and a `data-effect`; no `parseFloat`, `toFixed`, `Intl.`, `console.`, `any`; features may not import other features; `components/` may not import `features/*`; `features/mutual-funds/guards.test.ts` asserts an exact file count (70 on 24 Nov; plans that add files there update it). Phone UI (`frontend/src/mobile/**`) is unchanged except where a plan says so.
- Tests first, always; run only the affected tests; red test files are fixed once written. Invented data only; no real folio, name or PAN in a test or a document. **The owner's sign-in email and any token never enter a repository file.**
- **The PDF must look exactly as it does today** (QA-19 A) and **the number gate** (D-12): see Plans 2 and 7.

## Review Focus (cross-plan)

1. **Two plans touching one file:** merge order follows the ownership map; a worker's folder is cut from the branch that already contains the earlier plan. [Task M2]
2. **A deploy with stored results:** patch 1 changes the 1-year average, so the stored results are rebuilt after the back end deploys and before the front end ships (guide step, as in the XIRR guide's step 8). [Task M3]
3. **The old link during a mixed deploy:** the old link must keep working at every step (additive responses only). [Task M3]
4. **QA rows that go stale:** M1-12 and M2-10 (green button text), M2-04 (1-year averages), M4-12 (checklist click), M1-17 to M1-19 (the four emails) are rewritten or re-run last. [Task M5]
5. **Two worktrees on one machine:** another session has uncommitted work in the main docs checkout (a pending deletion of `Docs/orchestration/2026-11-21-gold-real-estate-plan.html` and an untracked `...-integration-plan.md`); never `git add -A`, always explicit paths. [Task M1]

## Ownership map for shared files (one owner at a time; the earlier plan merges first)

| File or area | Plans that change it, in merge order |
|---|---|
| `features/export/ExportDialog.tsx`, `export-tokens.css` | 3 (D-9 label, D-1 button text), then 7 (honest progress) |
| `features/import/checklist/checklist-tokens.css`, `CamsChecklist*.tsx`, `RequestCamsPath.tsx`, `TwoPathImportContainer.tsx` | 3 (D-1 only the two CSS text values), then 6 |
| `components/info/InfoPopover.tsx`, `features/mutual-funds/common/SectionCard.tsx` | 3 (D-7), then 4 reads it |
| Both `SummaryStrip.tsx`, `components/MeasureFlip.tsx`, `XirrCautionChip.tsx`, `features/mutual-funds/overview/HoldingsTable.tsx` | 4 only (after 3's `InfoMark` change) |
| `features/profile-v2/components/ChangeHeadDialog.tsx` | 1, then 6 (the quiet line) |
| `backend/app/services/analytics/category_ranking.py` | 2 only |
| `backend/app/services/export/*`, `frontend/src/print/**` | 5 (timing marks, no behaviour), then 7 |
| `styles/auth-tokens.css`, `components/ui/button.tsx`, `Button.module.css` | 3 only |

## Lanes, branches, folders and tags (this laptop; confirm each path when a packet is written)

Per plan an integration branch `batch/<id>` cut from the current patch branch; worker folders `C:\Users\Dell\lanes\unifolio-<id>-<lane>` (worktrees) and `C:\Users\Dell\ag-<id>` (Antigravity clones); never the main checkout. Patch integration branches `patch/qa1`, `patch/qa2`, `patch/qa3` (cut from `leapswitch-redesign` after the previous patch is merged); tags `qa1-rc`, `qa2-rc`, `qa3-rc` (annotated, pushed). Every worker prompt carries above its code block: **worker, project folder to open, branch, new or reuse** (owner rule, 23 Nov). Lanes in `wave-fe-check.sh`: a clone named `ag-<name>` needs no script change; integration worktrees are added as `case` lines (Task M1).

## Handoff and packet rules (how Claude writes them during execution)

Codex handoff `Docs/orchestration/2026-11-2x-<id>-<task>-handoff.md` from `.claude/skills/model-orchestration/references/handoff-doc-template.md`, one line in `Docs/orchestration/delegation-log.md`. Antigravity packet `...-<task>-packet.md`, **very detailed**: the owner's decisions and the page mockup it implements; every string; exact DOM, `data-testid`s and classes; a states table; tokens; accessibility; the red tests; commands; allowed and forbidden files; a report block; a paste-ready prompt. Claude then screenshots the result next to the page's mockup (1280x600, 1440x810, 1536x730, light and dark) and sends exact differences back.

## Task M1: Wave-start check and lane setup (Claude, before each patch)

- [ ] **Step 1:** `git fetch`; confirm the previous patch's tag is on `origin/leapswitch-redesign`; cut `patch/qaN`; create each plan's integration branch and folders from the plans' own Task 0 scripts.
- [ ] **Step 2:** add the `case` lines to `Docs/orchestration/wave-fe-check.sh` for the new integration worktrees (before the generic `ag-*)` line); run `wave-fe-check.sh <lane> types` on an untouched lane to prove it.
- [ ] **Step 3:** record the baseline (the affected test files per plan) and the Alembic head (0054) in the plan's Execution log; note any drift between this plan and the code.
- [ ] **Step 4:** never touch the other session's pending changes in the main docs checkout; commit only explicit paths.

## Task M2: Merge order and integration (Claude, per patch)

- [ ] **Step 1: Patch 1 order:** Plan 3 task V1 (greens, "i"), then Plans 1 and 2 (back end first, they are independent), then Plan 3 V2 to V5, then Plan 4, then Plan 5 ES-1. Each merge is `--no-ff` into `patch/qa1` after that plan's gates.
- [ ] **Step 2:** after every merge run the full affected back-end and front-end sets, `npx tsc -b`, `npx oxlint`, `npm run build`; the guards (`guards.test.ts` files) must be green.
- [ ] **Step 3: Patch 2** is Plan 6; **patch 3** is Plan 7 (look gate and number reference included).

## Task M3: Deploy guides and release records (Claude, per patch)

- [ ] **Step 1:** write `Docs/orchestration/2026-11-2x-staging-deploy-guide-qaN.md` in the style of the XIRR and M4 guides (pre-checks, tag hash, back end, **stored-results rebuild (patch 1)**, front end, health, step-by-step QA, rollback); the manager's Claude runs it; Claude writes the deploy record afterwards.
- [ ] **Step 2:** freeze: merge `patch/qaN` into `leapswitch-redesign`, tag `qaN-rc`, push; give the owner the prompt for the manager's Claude (project folder, branch, tag, guide path).

## Task M4: Gates (Claude, per plan and per patch)

- [ ] **G1 (back end, mandatory):** `codex:codex-rescue` runs `/codex:adversarial-review` against each back-end diff (read-only, background); the owner relays the report by hand; findings close only by a fix with a red test first or by the owner accepting them. **G2 (front end):** a fresh read-only **Sonnet** reviewer reads the diff against the plan's Review Focus and the no-copy-change rule. **G3 (whole branch before each deploy):** a different Sonnet reviewer; **Opus only if the owner approves it first** (memory: Opus only for named whole-batch gates).

## Task M5: QA rows and the owner's QA round (Claude)

- [ ] Add the rows named in each plan to `Docs/orchestration/2026-11-19-combined-qa-checklist.md`; rewrite M1-12 and M2-10 (white text on the green button), M2-04 (1-year averages recomputed after Plan 2), M4-12 (after Plan 6); the not-run rows (M1-11 by plus-addresses, M2-03 and M2-04 need an IDCW or Bonus plan and a Sectoral/Thematic and a Liquid fund held, Corporate Bond rank needs one held, M4-13 on Firefox and Safari needs a tester) are listed in each patch's QA round with what each needs.

## Task M6: Stakeholder note and docs (Claude)

- [ ] `decisions.md` as-built notes, `session.md` overwritten, `log.md` appended, one line in ADR-007; the stakeholder message (one per milestone, as before) only at the owner's word.

## Self-review against the page

Every page item has an owner plan: items 1 to 11 of Part 2 and item 12 (plans 2, 6, 3, 4, 5, 7), Head of Family A to D (plans 1, 6), the not-run rows (Task M5). The patch table matches the page's "Suggested order" and "patch deploys". Out of scope by decision: D4 (abandoned-review sweep), the designer's own icon set, parallel printing unless the plan 7 gate allows it.

## Execution log

*(Claude appends below: per-patch drift notes, gate results, deploy record links.)*

- **2026-11-25 (owner decision): ONE combined deploy.** Patches 1, 2 and 3 are built and gated separately (branches `patch/qa1` to `patch/qa3`, tags `qaN-rc`), but they are deployed to staging **together, once, after everything is done**, from **one** deploy guide written at the end. No per-patch deploy guide, no per-patch deploy. The combined guide carries: the stored-results rebuild (D-12), the Postgres lock-test run on staging (Head of Family), the export acceptance run, and the QA round after it.

- **2026-11-26 (owner decision, replaces the one-deploy rule for patch 3 only): OPTION B.** Patches 1 and 2 and the SAFE parts of patch 3 (ES-1 timing log, ES-2 look gate tool, ES-3 contents-only print, ES-4 lazy browser, ES-7 honest progress) deploy together NOW from one guide. The heavy-section speed work (ES-5) and the cold-data warming (ES-6), which need real-household profiling on staging, ship later as a second, smaller deploy (patch 3b). The look gate baseline PDFs are captured from the code deployed today (the M4 release) or, after this deploy, from this release (the contents page numbers are then an allowed difference).
