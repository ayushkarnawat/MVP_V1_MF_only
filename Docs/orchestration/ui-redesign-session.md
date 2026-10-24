# UI redesign: orchestrator session file (overwritten each session)

**Updated:** 2026-10-24, Wave 2b started. **Orchestrator:** Claude Code (this account). **Worker:** Codex. **Plan of record:** `2026-10-24-ui-redesign-execution-strategy.md`; instructions and run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md`.

## State

- **Wave:** 2 and 2b. Done: HB1 (`511f1ef`, `feat/home-snapshot`), S1.1 (`e825d10`, `feat/shell-nav`). S1.2 (9de1e5b + fix e186296, `feat/shell-nav`; Codex review FAIL then fixed, Opus PASS then fixed). S1.3 done (af4d2f7; redirectTo carry-over handled via finalRoute). S1.4 done (028342a + fix 0a7db46; Codex review of S1.3+S1.4 FAIL then fixed). S2.1 done (2f430e4, `feat/shell-nav-switch`; Codex review batched with S2.2). S2.2 done (63394ae + fix 0c57ab9; Codex review S2.1+S2.2 FAIL then fixed). **S2.3 READY** (`ui-redesign-S2.3-wrappers-handoff.md`, not yet relayed). PRs open: #9 (shell PR1), #10 (HB1) as aditi-unifolio. **Shell PR1 complete on `feat/shell-nav` (b80b55c): S1.1 to S1.6 done, Opus final review PASS then fixed. Branch not pushed, no PR opened.** Next: Wave 2 shell PR2 (S2.1 onward), or the 2b backend runs (HB2 onward), Codex review of S1.3+S1.4 batched there. Method: orchestration docs are committed on `leapswitch-redesign`; before each run I merge `leapswitch-redesign` into the task branch so Codex sees the handoff; code commits go on the task branch. The Codex review of S1.1 is batched into S1.2's review (covers T1 to T3), then the Opus review of S1.2.
- **Branches:** `leapswitch-redesign` (integration, docs), `feat/home-snapshot` (HB1 code), `feat/shell-nav` (next). Nothing pushed by this account. Untracked: `Docs/Web app UI mockups MFs.pdf` (owner's call).
- **Latest migration:** `0043`; `0044` (news) and `0045` (benchmark indices) are free.
- **Codex mode:** manual relay (owner decision 24 Oct). `codex:codex-rescue` is not available as an agent here; I write the handoff doc and a short prompt, the owner pastes it into Codex and pastes the report back, as in Sub-projects 1 and 2 and the UX fixes. Each review gate is also a relay (a review prompt for Codex, then its findings back).
- **Opus blanket approval:** given 24 Oct for the +O runs only (HB1, S1.2, S1.6, S2.4, S2.7, MB3, MF6, MF15, PR4, PR6, PR10, M2).
- **Owner "go":** given 24 Oct for Waves 1, 2 and 2b.

## Decisions taken (do not re-ask)

Everything in handoff section 9, plus the owner's second-pass decisions of 24 Oct (strategy doc, "Owner decisions, second pass"): individual fund page has three tabs; a fund name opens the individual fund page wherever funds are listed; each page keeps its own mockup's surface style; shell active row is a 2 px underline; Mutual Funds Overview table has a Today's change column and sortable headers (Home "View all by day's change" opens it sorted); a visual-parity step ends every page (handoff step 5b); reference of the finished app is `2026-10-24-desktop-preview-all-pages.html`.

## Open owner items

- Whether to commit the mockup PDF.
- Existing docs that still say "green bar" for the active row and were not edited: the shell contract (v1.6, line 187) and the shell PRD (S15). Ask at the end of the shell wave with a diff.
- `PR9` (retiring the old Profile) before or after the merge rehearsal.

## Run catalogue (check off after the review gate and the commit; "+O" = Opus review)

### Wave 1: second link
- [ ] L1 (with the owner)

### Wave 2: shell (stacked branches `feat/shell-nav`, `feat/shell-nav-switch`)
- [x] S1.1 (e825d10) · [x] S1.2 +O (9de1e5b, e186296) · [x] S1.3 (af4d2f7) · [x] S1.4 (028342a, 0a7db46) · [x] S1.5 (Claude) · [x] S1.6 +O (b80b55c)
- [x] S2.1 (2f430e4) · [x] S2.2 (63394ae, 0c57ab9) · [ ] S2.3 · [ ] S2.4 +O · [ ] S2.5 (Claude) · [ ] S2.6 (Claude) · [ ] S2.7 +O

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
- [ ] I1 · [ ] I2 · [ ] I3 (Claude) · [ ] I4

### Wave 6: QA fixes
- [ ] Q1 · [ ] Q2 · [ ] Q3 · [ ] Q4

### Wave 7: merge
- [ ] M1 · [ ] M2 +O

Total 88 runs: 1 + 13 + 19 + 2 + 43 + 4 + 4 + 2.

## Next exact step

Owner pastes the S2.3 prompt into Codex; verify, commit; review batched into S2.4 (+O). Not fixed from the Opus final review (Low): Equity button double-handled Enter/Space, FocusLayout origin guard, paths dot-segments, Sidebar non-null assertion, useRegistry rebuild, placeholder span role and double tooltip title, contract title line still says v1.6. Carry into S1.3/S2: scope reset may fire through the Equity redirect (check in useScope, T5); the T3 plan text still lists overlapCompare and /planning/scenarios, which contract v1.6 removed (plan text to update). S2.4 and I1 must make group-redirect targets live; HB3 stale today_gain note.
