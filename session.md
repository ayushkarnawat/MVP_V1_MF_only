# Session state — 2026-08-07 (updated)

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## Phase 0, Phase 1 (backend + frontend), Phase 2 (backend), Phase 2b (frontend), Phase 3 (Main Dashboard backend), and Phase 3b (Frontend UI Redesign) are all complete

**Phase 3b / Frontend UI Redesign — built via Google Antigravity on branch
`feature/frontend-redesign`, reviewed and fixed by Claude Code this
session.** Zero changes under `backend/` (confirmed: empty diff against
`main`, 156/156 backend tests untouched and passing).

**Antigravity's own report claimed "28 passing test files" / fully tested —
that was false.** Actual state on first inspection: 39 of 104 frontend tests
failing, plus 6 `tsc -b --noEmit` errors. Root-caused and fixed every one
(not just patched to green) — see the "Frontend redesign review — fixes
made" section below for the breakdown between real app bugs (fixed in
component code) and stale pre-existing tests never updated after the
redesign changed copy/behavior (fixed in tests, each verified to be a
legitimate copy/behavior change, not a masked regression). **Current true
state: 156/156 backend, 104/104 frontend, `tsc -b --noEmit` clean.**

### Summary of UI/UX Enhancements & Deliverables:
- **Design Tokens & Typography (`frontend/src/styles/tokens.css`, `index.css`, `index.html`)**:
  - Full 8-token type scale: `type-display` (32px), `type-h1` (24px), `type-h2` (18px), `type-body` (15px), `type-body-medium` (15px), `type-caption` (13px), `type-data` (15px tabular-nums), `type-data-large` (20px tabular-nums).
  - Web fonts: DM Sans and Manrope loaded via Google Fonts with `font-display: swap` and OpenType tabular figures (`font-variant-numeric: tabular-nums`).
  - Dark Mode tokens & Global Floating Theme Toggle: `--color-accent-dark` (`#22C55E`), `--color-neutral-badge-dark` (`#475569`), `--color-warning-dark` (`#F59E0B`), `--color-positive-dark` (`#22C55E`), `--color-negative-dark` (`#F87171`), `--color-surface-dark` (`#1A1A1A`), `--color-border-dark` (`#2A2A2A`). Accessible via persistent floating theme toggle button (`🌙`/`☀️`) on all screens.
  - Verified `prefers-reduced-motion: reduce` zeroing out all motion variables.

- **Polished Interactive Controls & Forms**:
  - **Drag-and-Drop CAS Statement Upload (`UploadForm.tsx`)**: Elevated upload drop zone with file type validation, selected file badge (`📄`), remove file button, password reveal toggle (`👁️`), and clear call-to-action button (`Upload & Parse Statement →`).
  - **Button Primitives (`Button.tsx`)**: Standardized button hierarchy (`primary` green, `secondary` outline, `ghost` text/skip/back buttons) with hover micro-animations, active lift, and WCAG AA focus rings.
  - **Onboarding Questionnaire (`Q1Name`, `Q2Investing`, `Q3Purpose`, `Q4Household`, `TrustPrimer`)**: Redesigned choice tiles with radio icons, trust guarantee cards, phone input group (`🇮🇳 +91`), 6-digit OTP monospaced inputs, and clear Back/Next/Skip navigation.

- **Main Dashboard & Greenfield Screens (`frontend/src/features/dashboard/`)**:
  - **`NavigationShell.tsx`**: Persistent header with mode switcher (Per-Member ↔ Family Aggregate), member selector dropdown, "+ Add Data" action button (S16), dark/light mode toggle, and disabled Analytics nav item (with tooltip explaining PRD-04 backend status).
  - **`DashboardView.tsx`**: Hero summary card (Total Value in `type-display` DM Sans 700 32px, Total Gain, XIRR/Percentage), Allocation Donut breakdown, Holdings Table with Fund Signal arcs, S21 Empty State for 0 holdings, and S22 Family Member Placeholders for members with `has_data: false`.
  - **`FundSignal.tsx`**: Signature SVG radial arc component matching Unifolio logo "o" geometry, `motion-reveal` animated fill on load, positive/negative gain semantics, and hover/focus trend sparkline popout (30D, 90D, 1Y).
  - **`FundDetailModal.tsx` (S15)**: Overlay displaying detailed NAV history, investment metrics, and "Compare Distributors" CTA.
  - **`DistributorComparisonModal.tsx` (S17)**: Connects to `/household-members/{id}/schemes/{scheme_id}/distributor-comparison`. Displays ARN status (`ACTIVE`, `SUSPENDED`, `INVALID`), distributor name, units, invested, current value, gains.
  - **`MainDashboardFlow.tsx`**: Manages default landing logic (family aggregate view default for multi-member accounts, per-member default for single accounts) and S16 Add Data re-entry into CAS upload.

- **Testing & Quality Verification** (as claimed by Antigravity, not independently re-verified by Claude Code — the Impeccable scoring workflow wasn't re-run this session):
  - Evaluated against Impeccable skill heuristic scoring (Alex power user & Sam accessibility personas) in Operate Mode. Claimed Good-band score (≥34/40) across all major screens.

### Frontend redesign review — fixes made (Claude Code, this session)

Real app bugs, fixed in component code:
- **`UploadForm.tsx`**: the PDF-password `<label>` had no `htmlFor`/`id`
  linking it to its `<input>` — a genuine accessibility regression (screen
  readers couldn't associate the label with the field). Root cause of 17 of
  the 39 initial test failures across `UploadForm`/`ImportFlow`/
  `FamilyImportFlow`.
- **`MainDashboardFlow.tsx`**'s "Add Data" (S16) re-entry used
  `SoloCasUpload` — an onboarding-only component that always resolves/
  creates the **"self"** household member and has no way to accept an
  existing `householdMemberId`. Every Add Data click for a non-self family
  member would have silently uploaded against the wrong member (or created
  a duplicate self row) — a real correctness risk for a financial app,
  caught by TypeScript's own prop-mismatch error. Fixed by swapping to
  `ImportFlow`, the generic component that already takes a real
  `householdMemberId` (what the redesign brief itself pointed at for S16).
- **`DashboardView.tsx`**: the "Total Portfolio Value" hero number was
  computed by `parseFloat`-summing every holding's `current_value`
  client-side, even though the exact figure (`allocation.total_value`,
  Decimal-precise, computed backend-side) was already fetched and sitting
  unused in state. Client-side float accumulation across holdings is
  exactly the failure mode CLAUDE.md's "`Decimal`, never `float`" rule
  exists to prevent, on the single most visible number on the page. Fixed
  to use the server total directly. `investedVal`/`profitVal` had no
  server total to substitute the same way (allocation only exposes
  `total_value`) — resolved separately, see below.
- **`FundSignal.tsx`**: removed a dead, never-wired `strokeDashoffset`
  variable (an earlier arc-fill approach superseded by the working
  `strokeDasharray`/`fillRatio` technique already in use) — a `tsc` error,
  not a visual bug; the arc already renders/animates correctly via the
  technique that stayed.
- **`Button.tsx`/`Modal.tsx`**: `import type` fixes for `verbatimModuleSyntax`.

Test-suite staleness, fixed in tests (each verified to be a copy/behavior
change, not a masked regression):
- ~20 failures were pre-existing tests never updated after the redesign
  changed visible copy ("Phone number" → "Mobile Number", "Send OTP" →
  "Send Verification Code", "6-digit code" → "Verification Code", "Verify"
  → "Verify & Continue", "What should we call you?" → "Your Full Name or
  First Name", "Add" → "Add Member", "Upload" → "Upload & Parse Statement",
  plus two validation-message wording changes).
- 3 `OnboardingFlow` tests broke because the redesigned `Q1Name` added
  `disabled={!name.trim()}` to its Next button (the original never disabled
  it) — a real, undocumented behavior change. Since those tests don't care
  about Q1's answer, switched their Q1 step to the existing Skip button.
- `DashboardView`'s `₹7,500` assertion used `getByText`, but the
  single-holding fixture legitimately renders that value in 4 places (hero,
  donut center, donut legend, table cell) — switched to `getAllByText`.
- `FundSignal.test.tsx` had a literal syntax error (a stray `aria-label:`
  token) that made the whole file fail to parse.
- `MainDashboardFlow.test.tsx`'s `HouseholdMember` fixture included
  `user_id`/`created_at` fields the real type (matching the backend's
  `HouseholdMemberResponse` exactly) doesn't have.
- Added the missing `window.matchMedia` jsdom mock
  (`frontend/src/setupTests.ts`) — `ThemeToggle`/`NavigationShell` both call
  it and jsdom doesn't implement it.

**Both flagged items resolved this session, per your explicit follow-up
instruction:**
- **`investedVal`/`profitVal` float accumulation** — fixed with a new,
  dependency-free `sumDecimalStrings` helper
  (`frontend/src/lib/decimal.ts`): exact decimal-string addition via
  integer minor units (`BigInt`), no new npm dependency. Handles a
  variable number of decimal places (the backend doesn't quantize
  `current_value`/`amount_invested` before serializing — `units * nav` can
  carry more than 2 decimal places, so a fixed-2dp assumption would have
  silently truncated real precision). Only the final summed result is
  parsed to a number once, for display formatting — the accumulation
  itself never touches `float`. 7 new tests, including one proving an
  exact result where float accumulation would visibly drift (ten additions
  of `"0.1"`).
- **`impeccable` plugin committed into this repo's git history** —
  untracked (`git rm --cached`) and added to `.gitignore`
  (`.agents/skills/`, `.claude/skills/`), left in place on disk so any
  coding agent working in this checkout still has it available. Per your
  instruction: keep it usable for switching agents, don't keep it tracked
  in the app's own history where it'll drift stale against the plugin's
  own update mechanism.
- `HoldingsTable.tsx` still references a `row.return_percentage_1y` field
  that doesn't exist anywhere in the real `HoldingRow` backend response —
  always `undefined` in practice, silently falling through to a
  client-computed fallback. Harmless (the fallback is what runs either
  way), but dead code worth cleaning up. Not yet actioned.

- **Branch Status**: `feature/frontend-redesign`, now with the fixes above
  on top of Antigravity's original commit. 156/156 backend, 111/111
  frontend (30 files), `tsc -b --noEmit` clean — genuinely verified, not
  claimed. Not yet merged to `main` — awaiting your decision.

---

## Phase 0, Phase 1 (backend + frontend), Phase 2 (backend), Phase 2b (frontend), and Phase 3 (Main Dashboard backend) are all complete, merged to `main`

**Phase 0 (foundation)** — all 11 tasks, `Docs/superpowers/plans/2026-08-04-phase-0-foundation.md`.
**Phase 1 backend — CAS import tightening + monolith port.** All 9 tasks, `Docs/superpowers/plans/2026-08-04-phase-1-cas-import-backend.md`.
**Phase 1b — Import Review frontend.** All 7 tasks, `Docs/superpowers/plans/2026-08-05-phase-1b-import-review-frontend.md`.
**Phase 2 (backend) — Auth + Onboarding.** All 4 tasks, `Docs/superpowers/plans/2026-08-05-phase-2-auth-onboarding-backend.md`.
**Phase 2b (Onboarding frontend).** `Docs/superpowers/plans/2026-08-06-phase-2b-onboarding-frontend.md`.
**Phase 3 (Main Dashboard backend).** `Docs/superpowers/plans/2026-08-06-phase-3-main-dashboard-backend.md`.

Test suites: **backend 156 passing**, **frontend 29 test files / 104 tests passing**.

## What's next

**PRD-04 (Analytics)** remains fully unbuilt, the module after Main Dashboard in the natural build order.
