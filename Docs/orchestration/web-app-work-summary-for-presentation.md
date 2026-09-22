# Unifolio Web App — Work Summary (for Presentation Prep)

**Purpose of this document:** This is a briefing document for another Claude session to
use as source material when building a slide deck. It describes the work Aditi Shanbhag
has done on the Unifolio **web app** codebase to date: product research, backend (auth +
file upload), and the entire frontend. A separate document (already created, in a
different codebase) covers the Unifolio **marketing website** — that one should be used
alongside this one when the deck needs to cover both pieces of work.

Write-up style: technical enough to be credible, but explained in plain language — assume
the audience is not reading raw code, so translate mechanisms into what they do and why
they matter, not how they're implemented line-by-line.

---

## 1. What Unifolio is (one paragraph, for slide framing)

Unifolio is a mutual fund portfolio-tracking and wealth-management platform for Indian
retail investors — positioned as a genuinely better, free-core alternative to the
incumbent tool in this space, Mprofit. A user uploads their Consolidated Account
Statement (CAS — the official record of all their mutual fund holdings across every fund
house, issued by CAMS/KFintech), and the app parses it, imports every transaction and
holding, and gives them a single dashboard to see their entire portfolio plus an
analytics view that scores and evaluates their funds. This first build ("MVP") is
scoped to mutual funds only — no stocks, no other asset classes yet.

The product is being built by a two-person team: Aditi (this document's subject —
product research, auth, file upload/storage backend, and the entire frontend) and Ayush
(dashboard/analytics backend, infrastructure, deployment).

---

## 2. Product research

Before writing code, the product direction was grounded in real competitive research,
not guesswork. This included:

- **Direct competitive analysis of Mprofit** (the dominant incumbent) — a case study
  documenting its feature set, UX patterns, and gaps, used as the functional baseline to
  beat (never copied visually — Unifolio has its own design language).
- **Analysis of three other wealth-management competitors** (Ionic Wealth, Novelty
  Wealth, Stack Wealth) plus a combined feature-parity matrix comparing all of them
  against what Unifolio was planning to build, to find real differentiation rather than
  feature-parity for its own sake.
- **A written product-context document** capturing the problem being solved, the target
  user, and how Unifolio's approach differs from the incumbents.
- This research fed directly into four formal Product Requirement Documents (PRDs) that
  scoped the actual build: CAS import/parsing, signup & onboarding, the main holdings
  dashboard, and the analytics dashboard — each one reviewed and locked before
  implementation started.

**Presentation angle:** this is the "why we built it this way" slide — it shows the
product decisions weren't arbitrary, they came from studying what existing tools get
wrong.

---

## 3. Backend contributions: authentication + file upload/storage

The backend is a single FastAPI application split into four logical services (Auth,
Import, Dashboard, Analytics — not four separate deployments). Aditi's backend scope
was the **Auth service** and the **file upload/storage half of the Import service**;
Dashboard and Analytics were built by the other team member.

### 3a. Authentication

The auth system supports three ways to sign in, all converging on one identity model:

- **Google Sign-In** — verifies Google's ID token directly (JWT signature check
  against Google's public keys) rather than the older, more complex OAuth
  code-exchange flow, since no server-side secret exchange is needed for this method.
- **Email OTP** — a one-time 6-digit code emailed to the user (no passwords anywhere
  in the system — passwords were deliberately removed as an auth method).
- **Phone OTP** — the same one-time-code mechanism, over SMS.

Design details worth surfacing in a deck:
- All OTPs share **one code path** (generation, hashing, expiry, throttling, attempt
  limits) regardless of whether the code went out over email or SMS — only the delivery
  channel differs. Codes expire in 5 minutes, cap at 5 attempts, and are throttled to one
  resend per 60 seconds — standard anti-abuse hygiene.
- A user can end up with **multiple linked identities** (e.g., they sign up with Google,
  later also verify a phone number) — the system has an explicit precedence order
  (Google > Email > Phone) for which identity "wins" when only one can be displayed or
  when identities collide (e.g., two Google accounts sharing the same email).
- Account deletion is a first-class flow, not an afterthought (pending-deletion state
  with its own screen), which reflects a genuine account lifecycle rather than a
  login-only auth system.

### 3b. File upload / CAS storage

CAS import starts with the user uploading a PDF (their Consolidated Account Statement).
Aditi's scope covered how that uploaded file is received, validated, and persisted:

- **Bounded retention, not permanent storage.** The original design discarded the PDF
  immediately after parsing it. That was later revisited: the raw PDF is now kept for a
  **30-day window** so that if a user disputes a parsed figure, or the parse needs to be
  re-run, the original source document is still available — after 30 days it's deleted
  automatically.
- **PAN (the government tax ID that appears on every CAS) is encrypted per household
  member**, not stored in plaintext, and is used to match/attribute holdings across
  family members who share an account — a real privacy-sensitive design decision, not a
  default.
- **The storage layer is swappable by design.** Locally, files are saved to disk; the
  interface is written so that production can plug in AWS S3 (with an automatic
  lifecycle rule enforcing the 30-day deletion) without any calling code changing. This
  is the kind of decision worth mentioning as "built for where this is going," not just
  "built for right now."
- **Cross-account duplicate detection.** If someone tries to import a CAS whose PAN
  already belongs to a different Unifolio account, the app now surfaces this clearly as
  a pop-up explaining the conflict, instead of silently failing or freezing — a real bug
  fix that shipped recently (this was originally a confusing dead-end for users).

**Presentation angle:** this is a good "we thought about the boring-but-critical stuff"
slide — retention windows, encryption, and graceful failure handling are the kind of
details that separate a real product from a hackathon demo.

---

## 4. Frontend: the entire web app

Aditi built the complete frontend — every screen and flow in the product, for both
desktop/web and a dedicated mobile-optimized experience. It's a single React + Vite
single-page application. Breaking it down by user journey (this maps well to a
"here's the app, screen by screen" section of the deck):

### 4a. Landing → Sign-up → Onboarding
The first-run experience: a landing page, entry flow (choose Google / email / phone),
OTP verification, then a multi-step onboarding questionnaire (name, investing
experience, purpose, household composition) before the user ever sees their portfolio.
Includes a "trust primer" step explaining why the app needs CAS access, and a card-stack
onboarding UI with custom illustrations — this is deliberately paced to build user trust
before asking for financial data.

### 4b. CAS import flow
This is the core "get your data in" flow, and it's the most complex piece of frontend
in the app:
- **Two import paths**: upload the CAS PDF yourself, or request one to be emailed by
  CAMS (the official record-keeper) if the user doesn't have it handy — each path has
  its own guided screens.
- A **live parsing/progress indicator** while the backend extracts transactions.
- A **review table** where the user checks the parsed data before confirming it.
- Handling for real-world edge cases: coverage gaps (missing data periods), opening
  balances, cross-account conflicts (see §3b), and a persisted import history so users
  can see what they've imported before and re-check status.
- A parallel **family import flow** — adding household members and importing CAS
  documents for each of them, since Unifolio tracks a household's holdings, not just one
  individual's.

### 4c. Main holdings dashboard
The primary "here's your portfolio" screen: aggregated holdings, an allocation donut
chart, a sortable holdings table, fund detail drill-downs, and a distributor-comparison
view (showing whether the user is invested via a "regular" plan with a distributor
commission vs. a cheaper direct plan — a genuinely useful, non-obvious insight for
Indian MF investors).

### 4d. Analytics dashboard
A deeper, more analytical view built on top of the same data: fund scoring (with a
documented, formula-based scoring methodology — not a black box), category rankings,
benchmark comparisons, expense-ratio (TER) analysis, and allocation breakdowns — plus a
print/export view so a user can generate a shareable PDF of their analytics.

### 4e. Mobile
A parallel, purpose-built mobile experience (not just a responsive resize of the desktop
views) — its own navigation shell, bottom nav, holding cards, and mobile-specific
versions of the dashboard, holdings, import, and analytics screens. This reflects a
deliberate decision that mobile usage patterns for checking a portfolio are different
enough from desktop to warrant dedicated screens.

### 4f. Design system
A shared component library underpins all of the above — buttons, modals, tables, badges,
skeleton loaders, a custom chart library (pie/donut charts with center-typography
callouts, built in-house rather than pulled from a generic charting package), theming
(light/dark), and Unifolio's own logo/illustration set. This is what gives the app a
consistent, deliberate visual identity rather than a generic component-library look.

**Presentation angle:** this section is the natural "look at everything I built" visual
core of the deck — it's the part most amenable to actual screenshots. If the person
building the deck (via Claude) has access to run the app, screenshots of the onboarding
flow, the import flow, the main dashboard, and the analytics dashboard would make far
stronger slides than describing them in text.

---

## 5. Suggested structure for the deck (optional scaffolding, adjust freely)

1. **What Unifolio is** — the problem, the target user, the Mprofit-alternative framing.
2. **Research first** — competitive analysis, PRDs, why the product looks the way it does.
3. **My scope on this build** — one slide making clear: research + auth/file-upload
   backend + full frontend (so the audience isn't left guessing what part is whose).
4. **The user journey, screen by screen** — landing → onboarding → CAS import → dashboard
   → analytics → mobile. This is the bulk of the deck and should be screenshot-heavy.
5. **Under the hood, briefly** — 2-3 slides max on auth design and file-storage/retention
   decisions, pitched at "we thought about security and data lifecycle seriously," not a
   code walkthrough.
6. **What's next / in progress** — optional closing slide if relevant (e.g., analytics
   refinements, AWS deployment work currently underway) — check with Aditi before
   including, since this document intentionally does not cover infra/deployment status.

---

## 6. What this document deliberately leaves out

- Dashboard/analytics **backend** implementation (owned by the other team member).
- AWS infrastructure, deployment, and DevOps work — in progress, tracked separately, and
  not part of "work done" in the sense this deck is presenting.
- The marketing website — covered by the separate, already-existing document from the
  other codebase.
