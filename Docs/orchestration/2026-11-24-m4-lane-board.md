# M4 lane board (written 2026-11-24; the single page to follow)
**Same workflow as M3: two Codex lanes and four Antigravity lanes, each lane is one project that does one task after another. The orchestrator (Claude) writes every handoff and packet, runs every check, and commits. The owner relays a prompt, pastes the report back, and gets the next prompt.**
Milestone M4 = **Batch I (PDF export)** + **Batch H part 2 (the floating checklist)**, then the owner's one QA round, then the M4 staging deploy by the manager. Decisions are in `decisions.md` (24 Nov) and `2026-11-24-print-audit.md`.

## Codex lanes (two projects)
| Lane | Project folder (open as a Codex project once) | Branch | Queue (one at a time, in this order) |
|---|---|---|---|
| **Codex A, back end** | `C:\Users\Dell\lanes\unifolio-i-be` | `batch/i-be` | **I-4 export pass** (running now) -> **I-5 render service and export routes** (I write it when I-4 lands) -> **I-12b back-end wiring and I-13 measurement script** (later) |
| **Codex B, front end** | `C:\Users\Dell\lanes\unifolio-i-fe` | `batch/i-fe` | the six **print group** tasks, in this order: **1 Other Analytics, 2 Holdings and Transactions (ledger and holdings first, the cash-flow chart last), 3 Allocation, 4 Overlap (heatmap last), 5 Performance (history last), 6 Overview (chart and SIPs last)**; then the **template integration** (the PDF's cover, contents, header and footer wired into the print route) and the **export button wiring** (`useExportJob`) |
The order of Codex B follows what the Antigravity components need: the groups that wait for a component do that one item last, and I tell Codex when the component is in its branch. **Never two print groups at once** (same branch).
Where the work lives: Codex A only touches `backend/**`; Codex B only touches `frontend/**`. They never collide.

## Antigravity lanes (four clones, started now, all independent)
| Lane | Clone folder (open as an Antigravity project) | Branch | Packet | Builds |
|---|---|---|---|---|
| **AG-1** | `C:\Users\Dell\ag-p1` | `ag/p1-history` | `2026-11-24-i7ag-p1-history-packet.md` | the history chart and the year-by-year table (Performance, and the Overview chart) |
| **AG-2** | `C:\Users\Dell\ag-p2` | `ag/p2-sips-cashflow` | `2026-11-24-i7ag-p2-sips-cashflow-packet.md` | the SIP table and the yearly cash flow chart with its table |
| **AG-3** | `C:\Users\Dell\ag-p3` | `ag/p3-heatmap` | `2026-11-24-i7ag-p3-heatmap-packet.md` | the overlap heatmap with its name key and the strongest pair |
| **AG-4** | `C:\Users\Dell\ag-p4` | `ag/p4-donut` | `2026-11-24-i7ag-p4-donut-packet.md` | the donut with a printed legend (used by four sections) |
Common rules for all four: `2026-11-24-i7ag-common.md`. When an Antigravity lane reports, I run its checks, compare it with the sample page in Chrome, fix small things, commit it, and merge it into `batch/i-fe` so Codex B can use it.
**Already built and held (Antigravity, done):** the PDF template pieces (cover, contents, header, footer, headings, notes) on `ag/i89-print-template`, and the Export PDF button and dialog on `ag/i1011-export-dialog`; they join `batch/i-fe` when the pipeline is wired. **The checklist look** is merged in `batch/h-checklist`.

## Where things stand today
- Done and committed: print foundation (`batch/i-fe`); I-3 browser pool (`batch/i-be`); Batch H part 2 (`batch/h-checklist`); the two Antigravity PDF lanes (held).
- Running: **Codex A: I-4** (amended handoff relayed).
- Next prompts to give: **Codex B: print group 1 (Other Analytics)** and **AG-1 to AG-4**. Prompts are at the bottom of each handoff or packet and in the orchestrator's message.
- Waiting on the manager: the measurement's real export calls (does not block anything).

## After the build (not lanes: the orchestrator)
Integration branch `m4-candidate` (Batch I back end + front end + both Antigravity lanes + Batch H), full test runs, the independent review of the export pass, browser checks of the dialog, the PDF (rendered by the real pipeline on invented households) and the checklist in Chrome and Edge, the M4 deploy guide for the manager, tag `m4-rc`.
