# Palette reference for every worker (taken from `Docs/Unifolio Colour Palette.pdf`)

The PDF is the colour source for this program. Read 18 Nov 2026 by the orchestrator (text plus the rendered swatches). Where a packet gives a token, use the token; where a token's value differs from this table, the **table wins** and the orchestrator is told (report it under Open questions, do not change the token yourself unless the packet says so).

## Light mode
| Role | Hex | Palette page |
|---|---|---|
| Primary text, wordmark, high-emphasis UI | `#111111` | 3 |
| Base app background | `#FCFCFC` | 3 |
| **Brand green: primary button (default), primary CTA, active states, logo accent, focus ring (2 px outline on every interactive element)** | `#22C55E` | 3, 4, 5 |
| Primary button hover | `#16A34A` | 5 |
| Primary button pressed | `#15803D` | 5 |
| Primary button disabled | `#DFDFDF` | 5 |
| Secondary button | `#FCFCFC` (with border) | 5 |
| Secondary button, selected state | `#E9F9EF` | 5 |
| Card background (default) | `#F5F5F5` | 3 |
| Dividers, subtle borders | `#ECECEC` | 3 |
| Input borders, disabled borders | `#DFDFDF` | 3 |
| Disabled text, placeholder text | `#C4C4C4` | 3 |
| Secondary icons, muted metadata | `#9B9B9B` | 4 |
| Secondary text | `#717171` | 4 |
| Body text (non-primary) | `#4B4B4B` | 4 |
| Elevated surface (dark accents), strong secondary text | `#2A2A2A` | 4 |
| Elevated surface (modals, popovers) | `#FFFFFF` | 4 |
| Active nav item | `#111111` icon and label, 2 px brand-green underline | 5 |

## Semantic colours (never fill a whole card, row or large surface: tint background, full colour only on the icon, the number and a thin border)
| Meaning | Primary (icons, large numerals, borders) | Text (small numerals, AA-safe on white) | Background tint | Border |
|---|---|---|---|---|
| Positive | `#22C55E` | `#15803D` | `#EAFBF0` | `#BAEFCC` (see note) |
| Negative | `#E5484D` | `#C1272D` | `#FDECEC` | `#F6C6C7` |
| Warning | `#D97706` | `#92400E` | `#FEF3E2` | `#FCE0B0` |
| Neutral (stable) | `#6B7280` | `#4B4B4B` | `#F5F5F5` | `#E0E0E0` |
| Informational | `#4F46E5` | `#3730A3` | `#EEEDFC` | `#D2CFF6` |

**Note (one PDF slip):** page 7 prints `#EAFBF0` as the label for both the Positive tint and the Positive border, but the border swatch is visibly darker (sampled from the render: about `#BAEFCC`). Use `#BAEFCC` for the Positive border and say so in the report if a packet needs it.

Supporting colours (tier 2, "everyday UI variety"): teal `#0D9488`, indigo `#4F46E5`, amber `#D97706`. Brand green is tier 1 and stays rare: roughly one or two green elements per screen (palette page 6).

Score colours (page 10): Excellent `#15803D`, Strong `#22C55E`, Good `#65A30D`, Average `#CA8A04`, Weak `#EA580C`, Poor `#C1272D`.

Chart colours 01 to 12 (page 11): `#22C55E`, `#0D9488`, `#2563EB`, `#6366F1`, `#A855F7`, `#8B5CF6`, `#EC4899`, `#F43F5E`, `#D97706`, `#CA8A04`, `#C1272D`, `#65A30D` (assignment by rank; chart 12 is the "Others" slice; check the page for the exact order before using one in a packet).

## Dark mode (pages 12 and 13)
Background `#111111`; surface (card) `#1A1A1A`; elevated surface `#212121`; border `#2E2E2E`; primary text `#FCFCFC`; secondary text `#A3A3A3`; brand green unchanged `#22C55E`. Semantic text on dark: positive `#34D399`, negative `#F87171`, warning `#FBBF24`, informational `#818CF8`.

## Fonts (pages 15 and 16)
Headings and sub-headings: DM Sans. Body, accents, taglines, sub-text: Manrope. Weights: Regular for body copy; Medium for sub-labels, H4, captions; Semi-bold for H2/H3, buttons, overlines, tags; Bold for display numerals and H1.

## What this settles for Batch B (green switch, B-12)
The plan's `#22C55E` for actions and `#15803D` for the deeper green are **both in the palette** (button default, and button pressed / positive text). So the Q25 check is closed: no change to those two values. Mapping for `auth-tokens.css` on all ten auth screens:
- `--auth-green` (today `#09B158`) becomes `#22C55E`; hover `#16A34A`; pressed `#15803D`; disabled `#DFDFDF`; focus ring `#22C55E` 2 px; selected-row fill `#E9F9EF`.
- `--auth-green-ink` (today `#067A3D`, the green second half of a headline and small green text) becomes `#15803D` (palette: AA-safe text on white).
- Text on a green button is dark: `#111111` (palette: primary text). The packet states each state; any value not in this file is a defect.
