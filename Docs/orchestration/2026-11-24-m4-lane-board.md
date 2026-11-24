# M4 lane board (updated 2026-11-24; the single page to follow)
**Same workflow as M3: two Codex lanes and four Antigravity lanes, each lane is one project that does one task after another. The orchestrator (Claude) writes every handoff and packet, runs every check, and commits. The owner relays a prompt, pastes the report back, and gets the next prompt.**
Milestone M4 = **Batch I (PDF export)** + **Batch H part 2 (the floating checklist)**, then the owner's one QA round, then the M4 staging deploy by the manager. Decisions: `decisions.md` (24 Nov), `2026-11-24-print-audit.md`.

## Codex lanes (two projects)
| Lane | Project folder | Branch | Done | Next (one at a time) |
|---|---|---|---|---|
| **Codex A, back end** | `C:\Users\Dell\lanes\unifolio-i-be` | `batch/i-be` | I-3 browser pool, I-4 export pass, I-5 render service + routes + guards (all committed, tests pass in WSL) | **I-5c two-pass page numbers** (`2026-11-24-i5c-two-pass-pages-handoff.md`; **needs the owner's yes to the new dependency `pypdf`**), then the deploy-side items (settings, a measurement script if wanted) |
| **Codex B, front end** | `C:\Users\Dell\lanes\unifolio-i-fe` | `batch/i-fe` | foundation, I-6b, all six print groups, the two held Antigravity branches merged (594 test files / 7,022 tests pass, types and lint clean) | **1. I-9b template integration** (`2026-11-24-i9b-template-integration-handoff.md`), **2. I-12 export wiring** (`2026-11-24-i12-export-wiring-handoff.md`) |

## Antigravity lanes (four clones)
AG-1 to AG-4 (`ag-p1` to `ag-p4`) **are done and merged** into `batch/i-fe`: history chart and year table, SIP table and yearly cash flow, overlap heatmap, donut with legend. The PDF template (`ag/i89-print-template`) and the button and dialog (`ag/i1011-export-dialog`) are merged too. **The four lanes are free**; the next Antigravity work, when it exists, is a look packet from the checks of the first rendered PDF (I render real reports and compare them with the sample; anything that needs a design fix becomes a packet).

## Batch H part 2 (the floating checklist)
Built and committed on `batch/h-checklist` (logic, drawing steps, look; 288 import tests pass). Not merged yet; it joins `m4-candidate`. Needs the real-browser check in Chrome and Edge at M4 QA.

## After the build (the orchestrator, not lanes)
1. **Render real PDFs** (the real pipeline, invented households) and compare page by page with the sample: cover, contents with page numbers, every section, dates, folios, no PAN, fonts. Fix or write packets for what differs.
2. **Independent security review** of the export pass and the render service (a fresh reviewer attacking `2026-11-23-i4-export-pass-security-brief.md`'s list; I recommend the Opus gate).
3. **`m4-candidate`**: merge `batch/i-be`, `batch/i-fe`, `batch/h-checklist` into `leapswitch-redesign`'s candidate, full test runs (back end in WSL, front end), browser checks (dialog, PDF, checklist in Chrome and Edge), then the M4 deploy guide for the manager (new settings `EXPORT_PASS_SECRET`, `EXPORT_API_ORIGIN`, distinct front-end and API origins, `pypdf` in the image, the entrypoint fact, the temporary job files in `/tmp`), tag `m4-rc`.
4. Open items for the owner: the temporary PDF file rule (10 minutes, deleted at first download), the new words listed in each report, the real checklist video (Batch H part 1, H-5: recordings from the owner).
