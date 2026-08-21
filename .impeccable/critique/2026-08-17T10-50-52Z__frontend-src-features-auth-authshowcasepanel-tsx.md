---
target: frontend/src/features/auth/AuthShowcasePanel.tsx
total_score: 26
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
timestamp: 2026-08-17T10-50-52Z
slug: frontend-src-features-auth-authshowcasepanel-tsx
---
Method: dual-agent (A: general-purpose design-review sub-agent · B: general-purpose detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Ring fill-reveal is a real, well-executed status moment; the only one in the panel |
| 2 | Match System / Real World | 3/4 | XIRR/Direct Alpha/PAN terminology correct for market but unexplained on-screen |
| 3 | User Control and Freedom | 3/4 | Non-interactive; `select-none` blankets prose headline unnecessarily |
| 4 | Consistency and Standards | 2/4 | Third stat pillar (Household/Combined/PAN) breaks the number+unit pattern the other two establish; `rounded-3xl` sits outside the locked radius scale |
| 5 | Error Prevention | 4/4 | No user input exists to error on |
| 6 | Recognition Rather Than Recall | 4/4 | Every value labeled; icons paired with text |
| 7 | Flexibility and Efficiency | n/a | Static panel, not a tool |
| 8 | Aesthetic and Minimalist Design | 3/4 | Clean/restrained; "Wealth Intelligence Standard" eyebrow is generic marketing puffery |
| 9 | Error Recovery | 4/4 | No error states possible in a static display |
| 10 | Help and Documentation | n/a | Static panel, not a tool |
| **Total** | | **26/32** | **Good (81%)** |

## Design Specificity Verdict

**LLM assessment:** Passes the specificity bar on the strength of the Fund Signal ring (genuine logomark-arc reuse + reveal animation) and the copy (CAS/CAMS/KFintech, Direct Alpha, household PAN — all real product differentiators), not on the composition template itself (ring-in-center → big number → 3-stat strip → trust footer is a familiar, swappable fintech-signup skeleton).

**Deterministic scan:** `detect.mjs --json` exit 0, findings `[]`. Zero hardcoded-color or inline-style violations — consistent with the component using CSS custom properties throughout.

**Visual overlays:** Unavailable this run — browser tooling in this sandbox has no reachable Chrome/Chromium binary (Playwright MCP is pinned to `/opt/google/chrome/chrome`, which doesn't exist here, and installing it requires root the session doesn't have). Environment limitation, not a component defect; no visual claims are made as a result.

## Overall Impression

A real, substantive fix of the "AI-generated dark-glow" anti-pattern the Design Brief calls out — token-disciplined, restrained, and it actually implements the Brief's mandated Fund Signal signature element rather than a generic chart. The one thing holding it out of "Excellent" is a small numeric-storytelling gap: the ring's fill and the percentage inside it don't agree with each other, which is the kind of thing a numerate user notices on a financial product's first screen.

## What's Working

1. Disciplined token usage — no stray hex values anywhere; `--color-positive` correctly reserved for the real performance stat while `--color-accent` is reserved for the brand-mark ring, matching Color Discipline's separation rule exactly.
2. The Fund Signal ring is a faithful, working implementation of the Brief's signature-element mandate: logomark-derived arc, `stroke-dashoffset` reveal, `--motion-reveal` correctly wired to inherit the global reduced-motion override rather than reimplementing it.
3. Copy is genuinely product-specific rather than generic fintech marketing language, with one exception (P2 below).

## Priority Issues

- **[P1] Third stat pillar has no number.** "Household / Combined / PAN" breaks the number+unit pattern its siblings establish ("+1.42% /yr", "100% Ingested"). *Why it matters:* violates Consistency and Standards inside the panel's own three-item set. *Fix:* give it an actual quantity, or restructure all three cells to scan identically. *Suggested command:* `/impeccable polish`

- **[P1] Ring-fill fraction (hardcoded 0.8) has no stated relationship to the +16.4% XIRR text centered inside it.** *Why it matters:* a circular-progress ring next to a percentage is a well-established convention meaning "the ring shows this number" — here it doesn't, which a numerate user will notice and may generalize into distrust of the product's numeric rigor. *Fix:* either give the fill a statable meaning or visually decouple the ring from the percentage. *Suggested command:* `/impeccable polish`

- **[P2] `rounded-3xl` used instead of the Design Schema's own largest radius token (`--radius-lg`/`rounded-lg`, 20px).** *Why it matters:* silent drift from the locked shape scale. *Fix:* switch to `rounded-lg`, or formally add a larger tier to the schema if 24px is intended. *Suggested command:* `/impeccable polish`

- **[P2] "Wealth Intelligence Standard" eyebrow is generic aspirational copy** in an otherwise concretely-specific panel. *Why it matters:* it's the one line that fails the panel's own specificity bar. *Fix:* replace with a concrete, verifiable claim or drop it. *Suggested command:* `/impeccable clarify`

- **[P3] Static figures never signal "illustrative," which reads fine once but grows stale on a repeatedly-seen login screen.** *Fix:* a subtle "Illustrative portfolio" caption, or differentiate signup vs. login content. *Suggested command:* `/impeccable polish`

## Persona Red Flags

**Alex (Power User):** Most likely to notice the ring-fill/XIRR mismatch (P1) and read it as a data-rigor red flag — exactly the audience segment for whom "our numbers are precise" is the core value proposition.

**Jordan (First-Timer):** XIRR, Direct Alpha, and PAN all appear with zero inline definition on the very first screen a brand-new investor sees.

**Sam (Accessibility-Dependent):** Panel is `hidden lg:flex` (viewport-width gated, not just a visual reflow) — a low-vision user relying on OS-level zoom rather than a narrower window can cross the `lg` breakpoint via zoom and lose the entire panel, including its value-proposition copy, with nothing surfacing that content elsewhere.

## Minor Observations

- `select-none` applied to the whole panel including prose headline text, not just the decorative graphic — harmless (all figures are illustrative) but broader than necessary.
- Three different alignment schemes stack top-to-bottom (headline `text-left`, ring/stats `items-center text-center`, footer `justify-between`) — each defensible alone, worth a second look as a set.
- Detector found zero issues and zero false positives (nothing to weigh against).

## Design-Schema / Token Conflicts

- No hardcoded hex colors anywhere — compliant.
- Typography correctly uses `font-display`/`font-body` utilities mapping to DM Sans/Manrope — compliant.
- Radius: `rounded-3xl` instead of the schema's `--radius-lg` token — real, minor drift (P2 above).
- Motion: `var(--motion-reveal)` correctly used, inheriting the global `prefers-reduced-motion` override defined once in `tokens.css` — compliant.
- Arc color using `--color-accent` rather than `--color-positive`/`--color-negative`: explicit, pre-approved product decision for this task (brand-mark usage, not literal per-holding performance) — not a violation, noted for completeness only.

## Questions to Consider

- If the ring is explicitly a brand-mark usage rather than a literal performance signal, should a real-looking percentage live inside it at all — or would moving the number off the ring resolve the P1 ambiguity outright?
- Should the signup view and the login view of this same panel show different content — an aspirational demo the first time, something less "invented-number" on repeat visits?
- This marketing-panel arc is a second, independent implementation of the Fund Signal motif, built before the Design Schema's *primary* use case (the holdings-table row) has been prototyped/validated. Risk the two implementations diverge once that one is built?
