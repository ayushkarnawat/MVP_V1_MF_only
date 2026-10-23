# Draft: PRD-03 version note (not applied)

**Status:** proposed wording only, 2026-10-23. No PRD has been edited. Open question N6: which copy gets the note (`Docs/PRD-03-Main-Dashboard.md`, `Docs/PRDs/PRD-03-Main-Dashboard.md`, or both; the two copies currently differ).

**Correction:** the Dashboard-as-landing statement is in PRD-03 (FR-9 and its open question about the default landing view), not PRD-01 as an earlier document said. PRD-01 (CAS parser) needs no note.

## Proposed row for the version table

| Version | Date | Author | Change |
|---|---|---|---|
| 1.1 | 2026-10-23 | (owner to confirm) | The first screen after sign-in is now **Home** (see `Docs/orchestration/2026-10-23-home-prd.md`), opening in the family-combined view. This Dashboard moves unchanged to Portfolio > Equity > Mutual Fund (`/portfolio/mutual-funds`). FR-9's default state (family aggregate versus the primary user) is answered by Home's scope rule: Family Combined on every page change. The Dashboard's calculations, tabs and behaviour are not changed by this note. |

## Proposed line under the open question about the default landing view

> Resolved 2026-10-23: the landing screen is Home, in family-combined view. The Dashboard is a Portfolio page and keeps its own default state.
