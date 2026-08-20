---
artifact: mobile-auth-onboarding-review-plan
version: "1.0"
created: 2026-08-19
status: for-review
product: Unifolio
audience: A coding agent (e.g. Google Antigravity) executing the plan
---

# Unifolio — Mobile Auth, OTP, Onboarding, CAS Import & Review

**Planning only. No code was written or modified to produce this document.**
Scoped narrowly to five areas by explicit request: auth screen, OTP screens,
onboarding, CAS import, and CAS review. This supersedes those five areas'
treatment in the broader `Docs/superpowers/specs/2026-08-19-mobile-uiux-system-plan.md`
(which still stands for Dashboard/Holdings/Fund Detail/Import History/Navigation).

## 0. Honest scope — most of these five need no new work

Recon (direct file reads, this session) found real work needed in only two
places. Say so plainly rather than padding out the other three with
unnecessary changes:

| Area | Current state | Work needed |
|---|---|---|
| **Auth screen** | Mobile hides the entire visual panel (`hidden lg:flex` in `AuthShell.tsx`) — nothing replaces it. Bare form, no brand storytelling. | **Yes — §1.** |
| **OTP screens** | Already correct: segmented cells at 44×48px (48×56px above `sm`), `inputMode="numeric"` already set. Renders inside the same `AuthShell`, so it inherits whatever the shell does. | No new work — inherits §1's background automatically. |
| **Onboarding** | `OnboardingCardStack`'s two peeking placeholder cards use fixed rotation/offset/scale values (`rotate: -3/2`, `y: -10/-5`, `scale: 0.94/0.97`) with no responsive override — a real clipping risk at 320–375px, not a design gap. Keep every illustration, animation, and transition exactly as they are today, per explicit instruction. | **Yes, but only the fix in §2 — nothing else changes.** |
| **CAS import** | Fully redesigned this session (v2), full mobile parity already shipped. | None. |
| **CAS review** | `MobileReviewView.tsx` is already mature — card-per-scheme, 44px+ touch targets throughout, sticky confirm bar with backdrop blur. | None. |

## 1. Auth screen (and everything that renders inside `AuthShell` — OTP included)

**Validated through visual mockups**: instead of hiding the visual panel on
mobile, use the real, already-shipped `left-panel-visual.svg` asset (the
same "Wealth Architecture" illustration `AuthShowcasePanel.tsx` already
renders on desktop) as a heavily blurred, full-bleed background behind the
mobile auth card — the same composition as the reference image you
provided (blurred wallpaper backdrop, dark scrim, card floating on top),
built from Unifolio's own existing asset rather than a new illustration.

- **Where**: `AuthShell.tsx`, below the `lg` breakpoint only. Desktop's
  split-screen layout (`visualSlot` in its own grid column) is completely
  unaffected — this only fills the space currently left empty by
  `hidden lg:flex`.
- **Composition**: the SVG, scaled up (~110–120%) and centered, `blur(~28px)`
  applied, sitting behind everything; a dark radial scrim on top of the
  blurred image for legibility (lighter near center, darker toward the
  edges); the existing light/white auth card floats above the scrim, using
  its current styling unchanged — this treatment changes what's *behind*
  the card, not the card itself.
- **Applies uniformly to every step rendered inside `AuthShell`** — landing,
  email/phone entry, OTP verification, link-account — since the shell
  itself, not each step, owns this background. This is what makes OTP need
  zero separate work: it inherits the same backdrop automatically.
- **Light vs. dark app theme**: use the same blurred-SVG-plus-scrim approach
  in both; only the scrim's exact tint may need a small adjustment between
  themes for contrast (e.g. a warmer/lighter scrim in light mode vs. the
  darker one validated in mockup for dark mode) — confirm the exact scrim
  values visually in both themes before finalizing, since only the dark
  version was mocked.
- **Performance flag**: `left-panel-visual.svg` is 543KB with complex vector
  paths. Runtime `filter: blur()` on an asset this size may be costly on
  lower-end mobile devices. Before shipping, measure actual performance; if
  it underperforms, pre-render a blurred, rasterized (WebP/PNG) version at
  build time and use that as the mobile background instead of blurring the
  live SVG — don't guess, measure and decide.

## 2. Onboarding — one bug fix, nothing else

`OnboardingCardStack.tsx`'s placeholder-card offsets are fixed regardless of
viewport width. Add a narrow-viewport adjustment (e.g. a `sm:` breakpoint
reducing the rotation/`y`-offset magnitude below ~640px, or increasing the
outer container's horizontal padding at those widths) so the peeking card
corners don't clip against the container edge at 320–375px. This is the
**only** change to onboarding — every illustration, every animation, every
transition stays exactly as built today, per explicit instruction. Verify
visually at 320px specifically, since that's where the risk is concrete.

## 3. CAS import & CAS review

No changes. Both are already complete and mature (§0's table). Reference
only — Antigravity should not touch these two areas under this plan.

## 4. Implementation steps

1. Add the blurred-background treatment to `AuthShell.tsx` for the below-
   `lg` case, per §1. Use the existing `left-panel-visual.svg` import
   already available in `AuthShowcasePanel.tsx` — don't duplicate the asset.
2. Verify OTP, landing, email/phone entry, and link-account screens all
   inherit the new background correctly with no per-screen changes needed.
3. Measure blur performance on the real asset; decide live-blur vs.
   pre-rendered raster per §1's performance flag.
4. Confirm the scrim reads correctly in both light and dark app themes;
   adjust scrim tint only if needed — don't touch the card or SVG itself.
5. Fix `OnboardingCardStack.tsx`'s placeholder-card clipping at narrow
   widths per §2. Do not change anything else in this component.
6. Verify at 320px, 375px, and 430px (the widths already validated
   elsewhere in this codebase) for both changes.
7. Confirm `prefers-reduced-motion` behavior is unaffected by either change
   (the blurred background is static, not animated; the card-stack fix only
   changes resting values, not motion).
8. Do not modify CAS import or CAS review under this plan (§3).
9. Work on a new git branch, never on `main` directly. Update `session.md`
   and `CLAUDE.md`'s Session State when done.

---

## Ready-to-paste prompt

> Read `Docs/superpowers/specs/2026-08-19-mobile-auth-onboarding-review-plan.md`
> in full before writing any code. It's narrowly scoped — §0 is explicit
> that only two things actually need work: (1) the mobile auth background
> in §1 (reuse the existing `left-panel-visual.svg` asset, blurred, with a
> dark scrim, behind the existing auth card — validated through mockups,
> applies uniformly across every step rendered inside `AuthShell`,
> including OTP, so don't build anything OTP-specific separately), and
> (2) the one-line-item bug fix to `OnboardingCardStack.tsx`'s placeholder-
> card clipping at narrow widths in §2 — do not touch anything else in that
> component; every illustration, animation, and transition it already has
> must stay exactly as built. Do not touch CAS import or CAS review — both
> are already complete (§3). Measure blur performance on the real 543KB SVG
> before deciding whether to blur it live or pre-render a rasterized
> version. Verify at 320/375/430px. Work on a new git branch, never on
> `main` directly. When finished, update `session.md` and `CLAUDE.md`'s
> Session State section.
