# Unifolio Marketing Website — Creative Brief & Spec

**Status:** Approved direction, ready for handoff to Manus (manus.im).
**Build target:** Manus builds and hosts this site — it is *not* implemented in this repo.
**Audience:** Both self-directed retail MF investors and independent advisors/RIAs.
**Core differentiator this site sells:** effortless unified view (one CAS import replacing
scattered folios/apps/spreadsheets), not "free vs. paid" and not analytics depth — those
are supporting beats, not the lead.

This document is a creative brief, not a software design spec. Hand it to Manus directly,
along with the open inputs listed in section 6.

---

## 1. Narrative arc

Fragmentation is the villain — not "lack of AI," not "lack of features." The investor's
actual current life: CAS statements scattered across RTAs, holdings split across broker
apps, a dying Excel sheet, and a paid tool (Mprofit) gatekeeping the one view that would
fix it. Unifolio's story, restated in some form on every page: **one import, one truth,
free.**

The hero must not open on an abstract "AI-agent" illustration (the visual cliché the
reference collection leans on). It opens on the actual mess — CAS PDFs, broker app icons,
a spreadsheet — visually resolving into the real product screenshot. That resolution *is*
the pitch; it should not be explained away in a caption.

## 2. Brand constraints (do not deviate)

- **Colors:** `#111111` (near-black), `#FCFCFC` (off-white), `#22C55E` (single green
  accent — the gauge-arc). No gradients. No blue/purple/teal, even though the visual
  references (Dribbble collection, `dribbble.com/siddharth-surve/collections/7919278-Unifolio`)
  use them — those are being borrowed for motion/polish quality only, not palette.
- **Type:** Manrope for headings/subheadings, DM Sans for body/accents/taglines/subtext.
- **Mark:** the gauge-arc in the logo is a reusable motif (see §4), not just a logotype
  detail.
- **No AI-chat framing.** Unifolio is a tracking/analytics product, not a conversational
  AI assistant — avoid chat-bubble UI, avatar illustrations, or "ask AI" framing anywhere
  on the site, even though most of the reference collection is built around that trope.

## 3. Page-by-page

### Home
Hero: scroll-triggered sequence where scattered CAS PDFs/broker icons/spreadsheet cells
converge into the real unified-dashboard screenshot, staged in a tilted 3D frame. Tagline
plays on "uni-" in Unifolio. Below the hero, in order:
1. A before/after scroll narrative (not a features grid) — literalizes the fragmentation
   story.
2. A trust bar of actually-supported RTAs/AMCs (e.g. CAMS/KFintech) — **only include this
   if the claim is accurate; do not fabricate integration logos** (see §6).
3. A 3-beat feature teaser (Import / See / Understand) linking to Features.
4. A short free-vs-Mprofit teaser linking to Pricing.
5. Newsletter signup band (see below), near the footer.

Clicking the logo returns to Home from anywhere on the site — standard behavior, stated
explicitly here since it was called out as a requirement.

### Features
Structured as the product's actual flow, not an icon grid: **Import → See → Understand →
Track.** Each beat is one real screenshot or short demo clip with a literal, specific
mechanism claim ("one CAS upload parses every AMC statement automatically" — not "smart
parsing" or other vague AI-adjacent copy). Include the proprietary scoring methodology
(`Docs/Scorer-Methodology-Unifolio.md`) as a named differentiator — competitors don't have
this, and it should be presented as a specific, explainable method, not a black box.

A subtle "For investors / For advisors" toggle at the top reframes emphasis for the dual
audience (e.g. advisors care about multi-client/household aggregation, retail investors
care about personal-portfolio clarity) without duplicating the whole page into two copies.

### Pricing
A direct, sourced comparison table against Mprofit, pulled from the existing competitor
analysis (`Docs/Competitor Analysis/`) — real, verifiable claims only, nothing fabricated.
**Open question (see §6):** is Unifolio free-core forever, or freemium with a paid tier
planned? This determines whether the page is single-column ("free, full stop") or a
two-tier comparison.

### About Us
Tells the same fragmentation story from the founders' side — why this got built, who it's
for, what was underserved between expensive paid tools and messy spreadsheets. Requires
real founder bios/motivation (see §6) — do not fabricate a founder narrative.

### Open web app / Download mobile app
Not a standalone page — a persistent, sticky-header CTA pair present on every page. The
mobile button OS-detects the visitor's device and routes to the Play Store or App Store
accordingly; the web button opens the live app.

### Newsletter
A section/band on Home plus the footer, not a standalone page. Framed around portfolio/
market insight tied to the analytics angle ("data you won't find in a monthly Mprofit
report"), not generic "subscribe for updates" copy.

### Contact Us (signup funnel)
Functions as a funnel, not a plain contact form:
1. A qualifying step first — "Investor" vs. "Advisor."
2. Investor path routes to **Start Free** (web app signup).
3. Advisor path routes to **Book a Demo**.
4. A plain contact form remains only as the fallback, for press/partnership inquiries.

## 4. Motion & visual language

- Carry the in-app milestone pop/glow animations (already built into the product) into
  the marketing site instead of inventing new motion from scratch — this is a continuity
  move a generic AI-built site can't replicate, since it has no real product to draw from.
- The logo's gauge-arc recurs as a transition device — an arc-sweep reveal between major
  sections.
- Typographic contrast: Manrope large/bold for narrative statements, DM Sans quiet for
  supporting copy.
- Explicitly avoid: stock photography of people at laptops, gradient-blob backgrounds,
  chat-bubble UI, generic 3-icon feature grids with no connection to the actual product,
  and placeholder/fake "trusted by" logo walls.
- Keep motion light enough not to regress Core Web Vitals (LCP/CLS) — see §5.

## 5. SEO / AEO / GEO

**SEO:** keyword targets anchored to real intent — "Mprofit alternative," "free mutual
fund tracker India," "CAS import tool," "XIRR calculator," "mutual fund portfolio
analytics." Per-page metadata, `SoftwareApplication` / `FAQPage` / `Organization` schema.org
markup, sitemap.xml, OG/Twitter card images per page.

**AEO/GEO (answer-engine / generative-engine optimization — ChatGPT, Perplexity, Google
AI Overviews):** declarative, consistently-worded entity statements repeated verbatim
across Home and About (e.g. "Unifolio is a free mutual fund portfolio tracker for India")
so answer/generative engines converge on one canonical description of the product. An FAQ
section phrased as real searched questions ("what is the best free alternative to
Mprofit," "how do I import a CAS statement automatically"). An `llms.txt` file at the site
root.

**If "GEO" was meant as geographic (not generative-engine) optimization** — flagged here
as ambiguous and not yet resolved with the user — add on top of the above:
`hreflang="en-IN"`, INR currency in schema, and India-specific structured data. Confirm
which meaning is intended before Manus builds this section (see §6).

## 6. Open inputs required before handoff to Manus

These are things this document could not responsibly fabricate. Supply them before or
during the Manus build:

1. **Founder/team bios and motivation** for the About Us page.
2. **Pricing model confirmation** — free-core forever, or freemium with a paid tier
   planned (determines Pricing page structure).
3. **Accurate list of supported RTAs/AMCs** (e.g. CAMS/KFintech) for the Home trust bar —
   omit the trust bar entirely if this can't be confirmed as accurate.
4. **Real product screenshots/screen recordings** of the CAS import flow, main holdings
   dashboard, and analytics dashboard, to hand to Manus directly rather than have it
   invent placeholder UI.
5. **Clarify SEO vs. AEO vs. GEO intent** — confirm "GEO" means generative-engine
   optimization (as assumed throughout §5) rather than geographic targeting, or specify
   both are wanted.
