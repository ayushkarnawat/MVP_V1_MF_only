# Navigation shell: design system and utilities (draft v1)

**Status:** draft, 2026-10-23. Doc 3. Source: **`Docs/Unifolio Colour Palette.pdf`** (new, committed 23 Oct as `0446e39`; all hex values below are read from it, **verified**) and `Docs/Web app UI mockups MFs.pdf` pp. 3, 9, 10 for structure. Visual mockups are in the combined artifact (light and dark). Where the palette and the older mockup differ, the palette wins. **Owner answers 23 Oct:** active row = palette style (SP1 A); shell-only tokens (SP2 A); sidebar surface = card colour with a divider border (SP3 A); disabled rows use the palette's disabled text with a tooltip (SP4 A); labels in Manrope Medium 14 px, active Semi-bold (SP5 A).

## 1. Palette (light)

| Token (proposed) | Hex | Palette usage |
|---|---|---|
| `--shell-text` | `#111111` | primary text, wordmark, high-emphasis UI; active nav item icon and label |
| `--shell-page` | `#FCFCFC` | base app background; secondary button fill |
| `--shell-accent` | `#22C55E` | primary CTA, active states, logo accent, focus ring (2 px); rare by design (one or two green elements per screen) |
| `--shell-card` | `#F5F5F5` | card background (default) |
| `--shell-divider` | `#ECECEC` | dividers, subtle borders |
| `--shell-border-input` | `#DFDFDF` | input borders, disabled borders, disabled primary button |
| `--shell-text-disabled` | `#C4C4C4` | disabled text, placeholder text |
| `--shell-icon-muted` | `#9B9B9B` | secondary icons, muted metadata |
| `--shell-text-secondary` | `#717171` | secondary text |
| `--shell-text-body` | `#4B4B4B` | body text (non-primary) |
| `--shell-dark-accent` | `#2A2A2A` | elevated surface (dark accents), strong secondary text; used for the "Coming soon" tooltip |
| `--shell-elevated` | `#FFFFFF` | elevated surface (modals, popovers) |
| `--shell-accent-hover` / `-pressed` | `#16A34A` / `#15803D` | primary button hover and pressed |
| `--shell-selected-tint` | `#E9F9EF` | secondary button selected state |

Supporting colours (teal `#0D9488`, indigo `#4F46E5`, amber `#D97706`) and the semantic set (positive `#22C55E`/`#15803D`, negative `#E5484D`/`#C1272D`, warning `#D97706`/`#92400E`, neutral `#6B7280`/`#4B4B4B`, information `#4F46E5`/`#3730A3`) are not used by the shell chrome. The data-visualisation palette is for the pages.

## 2. Palette (dark)

| Token | Hex | Usage |
|---|---|---|
| `--shell-page` | `#111111` | background |
| `--shell-card` | `#1A1A1A` | surface (card) |
| `--shell-elevated` | `#212121` | elevated surface |
| `--shell-text` | `#FCFCFC` | primary text |
| `--shell-text-secondary` | `#A3A3A3` | secondary text |
| `--shell-divider` | `#2E2E2E` | border |
| `--shell-accent` | `#22C55E` | brand green, unchanged |

Not specified by the palette for dark: muted icon, disabled text, sidebar surface. Proposed (**estimate**, to confirm in SP3 and SP4): muted icon `#737373`, disabled text `#5A5A5A`, sidebar surface `#1A1A1A`.

## 3. Palette against the current tokens (`frontend/src/styles/tokens.css`, **verified**)

| Role | tokens.css today | Palette | Effect |
|---|---|---|---|
| light border | `--color-border #E5E5E5` | divider `#ECECEC`, input `#DFDFDF` | two values replace one |
| secondary text | `--color-text-secondary #5C5C5C` | `#717171` secondary, `#4B4B4B` body | split into two |
| warning | `#F59E0B` | `#D97706` (text `#92400E`) | differs |
| negative | `#EF4444` | `#E5484D` (text `#C1272D`) | differs |
| card | none (`--color-surface #FFFFFF`) | card `#F5F5F5` | new role |
| dark bg | `#0F0F0F` | `#111111` | differs |
| dark ink | `#F5F5F5` | `#FCFCFC` | differs |
| dark border | `#2A2A2A` | `#2E2E2E` | differs |
| dark surface, secondary text, green | `#1A1A1A`, `#A3A3A3`, `#22C55E` | same | matches |

**Rule for this phase:** existing screens are not changed (L30), so `tokens.css` is **not edited**. The shell defines its own `--shell-*` tokens from the palette in one file (`frontend/src/shell/theme/shell-tokens.css`), light and dark, switched by the same mechanisms as today (`prefers-color-scheme` and `[data-theme]`; Tailwind `darkMode: ["class", '[data-theme="dark"]']`; **verified**). Moving the whole app to the palette is a separate task that changes existing screens (question SP2).

## 4. Typography (palette pp. 14 to 16, **verified**)

DM Sans for headings and subheadings, Manrope for body, accents and subtext. Weights: Regular body copy; Medium sub-labels, captions; Semi-bold H2/H3, buttons, tags; Bold display numerals and H1. `tokens.css` already uses DM Sans and Manrope (**verified**). Proposed sidebar label: Manrope Medium 14 px, active row Semi-bold (question SP5). Group and section names are not shown in the sidebar.

## 5. Sidebar components and states

| Part | Spec (proposed) |
|---|---|
| Wordmark | existing `UnifolioLogo` (auto variant: dark text, green accent in light; white in dark); links to `/home` |
| Row | height about 36 px (**estimate**); icon 18 px then label; 8 px radius; padding 8 x 12 px |
| Default | icon `--shell-icon-muted`, label `--shell-text-body` |
| Hover | background `--shell-divider`, label `--shell-text` |
| Active | icon and label `--shell-text`, semi-bold, with a 2 px `--shell-accent` indicator on the row's left edge (palette: active nav item, icon and label, 2 px brand green underline/indicator; **SP1 decides** between this and the mockup's filled pill) |
| Focus | 2 px `--shell-accent` outline on every interactive row (palette focus ring) |
| Group (Equity) | row with a chevron on the right, rotates 90 degrees when open; child rows indented 16 px with a 1 px `--shell-divider` guide line |
| Group "contains active" | label `--shell-text` semi-bold, no indicator; the active child carries the indicator |
| Disabled "Coming soon" | icon and label `--shell-text-disabled` (`#C4C4C4`), not clickable, `aria-disabled`; tooltip on hover and focus: "Coming soon" in white on `--shell-dark-accent` (`#2A2A2A`) |
| Back row | arrow icon, label `--shell-text-secondary`, same hover as a row |
| Divider | 1 px `--shell-divider` above the footer rows |
| Surface | `--shell-card` with a 1 px `--shell-divider` right border (SP3) |

Contrast (my calculation, **estimate**): `#4B4B4B` on `#FCFCFC` about 8.5:1; `#717171` about 4.8:1; `#9B9B9B` about 2.7:1; `#C4C4C4` about 1.7:1. Disabled text is low by the palette's own choice; decision L33 sets no extra accessibility target.

## 6. Top bar and other shell parts

Search box: a text input shell with `--shell-border-input` border, placeholder `--shell-text-disabled`; behaviour on hold. Ask Mira: secondary button (`#FCFCFC` fill, border, selected `#E9F9EF`). Family selector and theme toggle: the existing `Select` and `ThemeToggle` components. Primary buttons follow the palette (default `#22C55E`, hover `#16A34A`, pressed `#15803D`, disabled `#DFDFDF`). Green is kept rare: in the shell it appears only as the active indicator, the focus ring and the logo accent.

## 7. Utilities (new, small)

`PageLayout`, `PageState` (loading, error, empty), `PlaceholderPage`, `MiraComingSoonDialog` (built on the existing `Modal` or the Radix dialog already installed), `AppLink` (renders a disabled span for placeholder targets), `useAppNavigate`, `paths` (typed builders), `renderInShell` (test helper). Icons from `lucide-react` 0.475.0; the 16 icons proposed in the contract plus `ChartCandlestick`, `ChartPie`, `Globe`, `PiggyBank` exist (**verified**).

## 8. Open questions

All five answered as recommended (23 Oct). Still an **estimate**, not given by the palette: the dark values for muted icon (`#737373`), disabled text (`#5A5A5A`) and selected tint (`#16301F`); confirm them against real screens in the manual check. Moving `tokens.css` to the palette stays a later task.
