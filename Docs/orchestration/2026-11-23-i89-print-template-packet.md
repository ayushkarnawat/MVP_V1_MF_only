# Packet I-8/I-9: the PDF report's template pieces (Antigravity, front end, lane G-a)
**Batch I (PDF export), milestone M4.** Plan: `Docs/superpowers/plans/2026-11-17-batch-i-pdf-export-plan.md` (Tasks I-8 and I-9). **Design source, in this order of authority:** (1) the **real sample PDF** `Docs/orchestration/2026-11-13-batch-i-sample-report/Unifolio-full-report-sample.pdf` and its page images `.../full/f01.png` to `f39.png` (744 x 1053 px each, one pixel is 0.282 mm); (2) the planning workbook `Docs/orchestration/2026-11-13-batch-i-planning-workbook.html`, section 4 (open it in a browser; its "Layout sketches (earlier, kept for reference)" are **older and lose to the real sample wherever they differ**). **The sample is the design: the finished pieces, printed, must look like pages 1, 2, 3, 4 and 39 of the sample.** Written by the orchestrator on 23 Nov 2026 from measurements of those pages.
One of two lanes that run at the same time on **disjoint files**: this one (`frontend/src/print/**`, new) and `2026-11-23-i1011-export-button-dialog-packet.md` (`frontend/src/features/export/**` and `TopBar.tsx`). You build **pieces that draw things from the props they are given**; you do not load data, call the server, or build the print route (Codex does that in I-6).

**Your clone:** `C:\Users\Dell\ag-i89` (branch `ag/i89-print-template`, cut from `batch/i-export` at the commit the orchestrator names in the relay message). Work only there. Never edit the main project folder. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, the plan's Batch I section and its Global Constraints, then this packet. Open the sample pages `f01.png`, `f02.png`, `f03.png`, `f04.png`, `f39.png` and keep them beside you.

## What you build (all new files under `frontend/src/print/`)
| File | What it is |
|---|---|
| `print-tokens.css` | The **only** file that holds colour values and the page box. Always light: it never reads the app's theme and has no dark rules. |
| `fonts/` + `print-fonts.css` | `@font-face` for DM Sans Bold (700) and Manrope (variable 400 to 700) **from files in the repo**, no Google, no URL to another host. Copy the two existing files `frontend/public/email/fonts/DMSans-700-latin.woff2` and `Manrope-latin.woff2` into `frontend/src/print/fonts/` (OFL licence, README beside them says so; copy its wording into a `README.txt` there). No other weights: use only DM Sans 700 and Manrope 400 to 700 (flag if the sample needs another). |
| `Cover.tsx` | Page 1 (sample `f01.png`). |
| `Contents.tsx` | Pages 2 and 3 (sample `f02.png`, `f03.png`): the contents list. |
| `RunningHeader.tsx`, `RunningFooter.tsx` | The header and footer on every page after the cover (visible on `f02.png`). |
| `TabHeading.tsx`, `SectionHeading.tsx` | The big tab title block and the section title block (sample `f04.png`, `f05.png`, `f19.png`). |
| `NotesPage.tsx` + `notesCopy.ts` | The last page (sample `f39.png`). |
| `PrintTemplate.tsx` | A small wrapper that applies the tokens and fonts and sets the page rules (below), for the pieces and for Codex's print route to sit inside. |
| `*.test.tsx` | Your tests (below). |

## The page box (A4, in millimetres: the sample is A4 portrait, 210 x 297 mm)
- `@page { size: A4; margin: 24mm 15mm 16mm 15mm; }` for every page **except the cover**, which is full-bleed: `@page :first { margin: 0; }` and the cover fills 210 x 297 mm.
- Content width is 180 mm (from x = 15.0 to x = 195.0). Left text edge **15.0 mm**, right text edge **195.0 mm**, on every page.
- **Running header and footer on every page after the cover, by CSS page margin boxes** (supported by the Chromium in our image, Playwright 1.62): `@top-left`, `@top-right`, `@bottom-left`, `@bottom-right` in `PrintTemplate.tsx`'s stylesheet. The footer's page text is `content: "Page " counter(page) " of " counter(pages)`. The two pieces of footer text that change per report come through two CSS custom properties set on the root element by `RunningFooter` (`--print-footer-left` as a CSS string, e.g. `"Generated 17 Nov 2026 · Prices as on 5 Oct 2026"`), because margin boxes inherit from the root. **If margin boxes do not draw correctly in Chrome's print preview on your machine** (Chrome 131 or later does), stop and report instead of switching to another method: the fallback is a decision for the orchestrator.
- The header's logo is a background image on the `@top-left` box: `background: url(<ring svg or png from Logo/>) no-repeat left center; background-size: 6.8mm; padding-left: 9mm;`. Use `Logo/Unifolio Ring Logo.png` copied to `frontend/src/print/logos/ring.png` (a `logos/` folder; it is already an approved brand file, also `Logo/Unifolio Logo Transparent.png` for the cover) and import both so the bundler serves them from our own files.
- Nothing prints in the header or footer on the cover (the `:first` page has no margin boxes).

## Tokens (`print-tokens.css`; the values are what the sample shows, each rounded to the palette where it is within a shade)
`--print-ink` `#111111` (all primary text); `--print-ink-2` `#475467` (sub lines, the header's family name); `--print-ink-3` `#667085` (small labels, the footer, the notes' secondary text, the cover disclaimer); `--print-green` `#22C55E` (the header rule, the brand colour); `--print-green-ink` `#15803D` (eyebrows, contents group labels); `--print-band-1` `#14532D`, `--print-band-2` `#15803D`, `--print-band-3` `#22C55E` (the cover gradient); `--print-band-ring` `rgba(255,255,255,0.18)`; `--print-band-eyebrow` `#BBF7D0`; `--print-hairline` `#E6E9EC` (the cover's rule and card edges); `--print-leader` `#CAD0CA` (dotted leaders); `--print-row-rule` `#F5F6F5` (the line under each contents entry). The sample's greys are the sample's own (slightly different from the app palette's `#717171` and `#4B4B4B`); the owner approved the sample on 17 Nov, so the PDF follows the sample: do not "correct" them to the palette, but list in the report any token where you think the owner should choose. **No hex colour or `rgb(` anywhere else in `print/`** (a test enforces it). If a sample pixel disagrees with a token by more than a shade, report it; do not change a token silently.
Fonts: **DM Sans 700** for: the cover title, the cover name, the large H1 (tab titles, "What is in this report"), the section titles, the header's report title. **Manrope** for everything else (400 for body, 600 for the contents entries and the cover's data values, 700 for small uppercase labels).

## Measurements to match (millimetres from the page's top-left; read from the sample pages; "x0 to x1" are the ink extents of the text, "cap-top / baseline" are the top of the capitals and the bottom of the line)
**Sizes below are estimates (about); the extents are the targets: choose the font size and letter spacing so each string lands on its extents to within 0.5 mm.**

**Cover (page 1, `f01.png`)**
- Green band: from the top edge to **148 mm**, full width, gradient `linear-gradient(135deg, band-1 0%, band-2 55%, band-3 100%)` (sampled: top-left `#13532D`, left edge at the band's foot `#147438`, bottom-right `#21C25C`).
- A large translucent ring on the band: centre **(170.5 mm, 53.6 mm)**, outer radius **79.6 mm**, inner radius **61 mm**, fill `--print-band-ring`; it runs off the right and top edges and is clipped by the band (it is the brand ring; do not draw it as an image: use CSS (a radial-gradient or a bordered circle clipped by `overflow: hidden`)).
- White logo card (radius about 3.5 mm): **x 15.0 to 56.2, y 15.0 to 32.2** (41.2 x 17.2 mm), holding `Unifolio Logo Transparent.png` centred, about 30 mm wide.
- Eyebrow `CONFIDENTIAL · PREPARED ON 17 NOV 2026` (the date is the generated date, upper-case): Manrope 600, about 8 pt, letter spacing about 0.12 em, colour band-eyebrow, left 15.0, cap-top about 70.7, baseline about 74.0; the text ends near x = 101.8.
- Title `Mutual Fund` / `Portfolio Report`, two lines, white, DM Sans 700, **about 40 pt on a 44 pt line (15.5 mm)**: line 1 spans x 15.0 to 100.8 (cap-top about 80.5, baseline about 92.6); line 2 spans x 15.0 to 121.4. Left-aligned at 15.0 (the letter M's left edge sits at 15.8 because of its side bearing: do not shift it).
- White area below the band. `PREPARED FOR` label: Manrope 700, about 7 pt, letter spacing about 0.1 em, colour ink-3, x 15.2 to 39.8, cap-top 166.0, baseline 168.5. Name line: DM Sans 700, about 22 pt, ink, x 15.2 to **126.7** for "Suresh Raman Iyer and family" (so the size is set by that string), ascender-top 173.6, descender-bottom 181.5. Sub line: Manrope 400, about 10 pt, ink-2, x 15.2 to 97.9 for "Family combined · 3 members · 6 funds · 5 folios", y 184.6 to 188.5.
- A 1 px rule in `--print-hairline` at y = **212.0**, x 15.0 to 195.0.
- Three data columns below the rule, **left edges at x = 15.2, 76.8 and 138.6** (column pitch 61.8 mm): each has a label (Manrope 400, about 7.5 pt, ink-3, cap-top 218.2) over a value (Manrope 700, about 9 pt, ink, y 222.4 to 226.1). Sample: `Scope` / `Family Combined, full report`; `Prices as on` / `5 Oct 2026`; `Holdings as on` / `September 2026`.
- Disclaimer at the foot: Manrope 400, about 7 pt, ink-3, line pitch about 3.9 mm, x 15.0 to 193.1, three lines, y 273.2 to 284.5. Words: `This report is generated from the statements imported into Unifolio and is meant for your own use. It contains no PAN. Figures are indicators of past performance and are not a recommendation to buy, sell or hold any fund.` (the sample's last sentence, "Sample report: ...", is for the sample only: **do not include it**).

**Header (every page after the cover; on `f02.png`)**
- Ring logo: **x 15.0, top 6.8 mm, 6.8 mm across**. Beside it the title `Mutual Fund Portfolio Report` in DM Sans 700 (about 8.5 pt), ink, starting at x = **22.6**, ending x **69.4**, baseline about 14.2. Right side: the scope name (the cover's "Prepared for" name: `Suresh Raman Iyer and family`, or the member's name) in Manrope 400 (about 9 pt), ink-2, **right edge 195.3**, y 9.9 to 13.0 (x 154.7 to 195.3 for that string).
- The rule under it: **1 pt, `--print-green`, at y = 23.9 mm, x 15.2 to 194.8** (the page's top margin begins at 24 mm).

**Footer (every page after the cover)**
- Left: Manrope 400, about 7 pt, ink-3, **x 15.0**, y 286.2 to 288.8; sample text `Generated 17 Nov 2026 · Prices as on 5 Oct 2026` (the sample also adds ` · Sample from a synthetic statement`: that part is sample-only, **omit**; the prices part is omitted when there is no price date). Right: `Page 2 of 39`, same style, **right edge 195.3**. No rule above the footer.

**Contents (`f02.png`, `f03.png`)**
- Eyebrow `CONTENTS`: Manrope 700, about 7 pt, letter spacing 0.15 em, `--print-green-ink`, x 15.2 to 35.3, y 25.1 to 27.7. H1 `What is in this report`: DM Sans 700, about 30 pt, ink, x 15.2 to **111.8**, y 33.0 to 42.6.
- Groups: the tab name in upper case (`OVERVIEW`, `PERFORMANCE`, `ALLOCATION`, `HOLDINGS`, `TRANSACTIONS`, `OVERLAP`, `OTHER ANALYTICS`, then `NOTES`), Manrope 700, about 7 pt, letter spacing 0.12 em, `--print-green-ink`; "OVERVIEW" spans x 15.2 to 32.7 and its cap-top is at **55.3**. Entries: each is a row of **9.6 mm** (the title at the left in Manrope 600 about 11.5 pt ink, a dotted leader (1 px dotted `--print-leader`, sitting on the x-height line) filling the gap, the page number right-aligned to **195.3** in Manrope 500 about 11.5 pt), with a 1 px line under the row in `--print-row-rule`. The first entry's cap-top is at 62.9; "Summary" spans x 15.2 to 32.5. Gap between the last row of a group and the next group's label: about 3.7 mm more than the row pitch (the sample: last row cap-top 132.0, next label cap-top 144.2).
- The list flows to a second page when it does not fit (it does in the sample: the page break falls between "Cash Flow Over Time" and "All Transactions"), the header and footer repeat, and a group label is never left alone at the foot of a page (`break-after: avoid` on the label).
- The numbers come from the caller: `entries: { tab: string; title: string; page: number | null }[]`. A `null` page prints nothing at the right (the print route measures pages in a second pass; Codex handles that).

**Tab and section headings (`f04.png`, `f05.png`, `f19.png`)**
- `TabHeading({ tab })`: eyebrow `TAB` (as in the sample: Manrope 700, about 7 pt, letter spacing 0.15 em, `--print-green-ink`, x 15.0 to 22.0, y 25.4 to 27.7) over the tab's name in DM Sans 700 about **31 pt**, ink (`Overview` spans x 15.5 to 58.1, cap-top 33.0, baseline 40.6; `Notes` spans x 15.8 to 42.1). It starts a new page (`break-before: page`).
- `SectionHeading({ title, subtitle })`: title DM Sans 700 about **16 pt** ink (`Summary` spans x 15.2 to 42.3, ascender-top 51.1, descender-bottom 56.7 on a page that opens a tab; when a section opens a page that is not a tab opener the title's cap-top is at 25.1, as `Value over time` on `f05.png`), subtitle Manrope 400 about 8.5 pt ink-3 (`Family Combined · 3 members · 6 funds · Prices as on 5 Oct 2026` spans x 15.2 to 105.6, y 59.0 to 62.4), 3 mm gap below.

**Notes (`f39.png`)**: `TabHeading` with tab `Notes`, then a `SectionHeading` titled `Notes` with the subtitle `How the numbers are calculated`, then blocks: a heading (DM Sans 700 about 10.5 pt ink) over a paragraph (Manrope 400 about 9.5 pt ink-2, line height 1.55, max width 180 mm), 5 mm between blocks. The text is in `notesCopy.ts` as data (`export const NOTES: { heading: string; paragraphs: string[] }[]`), taken from the sample (page 39) **minus** the sample-only block "About this sample", and with the sample's typo `Prices are as on %s.` replaced by a function: `pricesSentence(priceDate: string | null): string` that returns `Prices are <the date tail>.` using `formatDataDateTail("prices", iso)` from `frontend/src/lib/dataDates.ts` (**never type "as on" or "as of" in a print file**: a repo scan test forbids it; import the helper). The six blocks, in order: `Current value`, `Invested and gain`, `XIRR`, `Value over time and period returns`, `What the dates mean`, `Important` (the sample's exact sentences; the "market-cap list is the AMFI classification effective 1 Jul 2026" sentence takes its date from `formatDataDateTail("marketCapList", iso)` or is built from the helper's output, same rule). Codex later swaps this text for the "i" icons' own explanations (Batch E); keep it in this one file so that is a one-file change.

## Props (these exact shapes; Codex's print route is written against them)
```ts
export interface CoverProps {
  holderName: string | null;          // the account holder's name, or null when missing
  scope: { kind: "family" } | { kind: "member"; memberName: string };
  memberCount: number; fundCount: number; folioCount: number;
  generatedOn: string;                // already formatted by the caller, e.g. "17 Nov 2026"
  scopeLabel: string;                 // e.g. "Family Combined, full report"
  dataDates: { label: string; value: string }[];   // up to two, e.g. { label: "Prices as on", value: "5 Oct 2026" }
}
export interface ContentsEntry { tab: string; title: string; page: number | null }
export interface ContentsProps { entries: ContentsEntry[] }
export interface RunningHeaderProps { scopeName: string }
export interface RunningFooterProps { generatedOn: string; priceNote: string | null }  // priceNote e.g. "Prices as on 5 Oct 2026"
export interface TabHeadingProps { tab: string }
export interface SectionHeadingProps { title: string; subtitle?: string }
export interface NotesPageProps { priceDate: string | null; marketCapDate: string | null }
```
**Words rules for the cover (from the plan; the tests below pin them):** "Prepared for" shows `<holderName> and family` for a family; the member's name for a member report; **if `holderName` is null on a family report it shows `Your family`**, never a guess. The sub line for a family is `Family combined · N members · N funds · N folios` (singular forms when the number is 1: `1 member`, `1 fund`, `1 folio`); for a member it is `Member report · N funds · N folios` (**new words, not in the sample: flag them to the owner under Open questions**). The cover never prints PAN, a folio number, an email or a phone number (it receives none; the test feeds a PAN-shaped string in `holderName` and expects the component to render it as given but a separate test asserts no prop name carries one: see below).

## Tests (you write them first; show them fail, then make them pass; invented data only)
`Cover.test.tsx`: `shows the title, the eyebrow with the generated date in capitals, and the scope label`; `family report shows "<name> and family"`; `family report with no name shows "Your family"`; `member report shows the member's name and "Member report"`; `sub line uses singular forms for 1`; `shows each data date label and value`; `no PAN, folio, email or phone text is produced from the props it takes` (assert the component's rendered text for fixtures equals the allowed strings only); `carries no sample-only wording ("Sample", "synthetic")`. `Contents.test.tsx`: `groups entries by tab in the order given, tab names in capitals`; `each entry shows its title and its page number`; `a null page shows no number`; `a group label is marked break-after avoid`; `renders every entry it is given (no cap)`. `RunningHeader/Footer.test.tsx`: `header shows the title and the scope name`; `footer shows "Generated <date>" and the price note, and omits the price note when null`; `footer sets --print-footer-left on the root`. `TabHeading/SectionHeading.test.tsx`: `tab heading has the eyebrow TAB and the tab name and breaks before the page`; `section heading shows the subtitle only when given`. `NotesPage.test.tsx`: `shows the six blocks in order`; `prices sentence uses the helper and has no "as on" literal`; `no "%s" or sample-only text remains`. `printTemplate.guard.test.ts`: `no hex colour or rgb() in any file under print/ except print-tokens.css`; `no external URL in any font or style file (no "http", "googleapis", "gstatic")`; `no parseFloat, toFixed, Intl, console, any in print/`; `no "as on" / "as of" literals in print/ (they come from lib/dataDates.ts)`; `every <button is absent (a printed page has no buttons)`; `no import from another feature (only components/, lib/ and print/)`; `the fonts used are only DM Sans 700 and Manrope`.

## Files you may change
Only new files under `frontend/src/print/` and the copied font and logo files in it. **Do not touch** anything else: not `frontend/src/main.tsx`, not `features/**`, not `shell/**`, not `index.css`, not `package.json`, not the old `features/analytics/print/**` (the old print page keeps working beside the new one), not `backend/**`, not any existing assertion. Anything else you think is needed: stop and report.

## Checks (PowerShell, from your clone)
```
$S = 'export UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell; bash /mnt/c/Users/Dell/lanes/unifolio-i-export/Docs/orchestration/wave-fe-check.sh ag-i89'
wsl.exe -d Ubuntu -- bash -c "$S test src/print"
wsl.exe -d Ubuntu -- bash -c "$S types"
wsl.exe -d Ubuntu -- bash -c "$S lint src/print"
```
If WSL is denied on your machine, write the code and tests anyway, say so in the report, and run in PowerShell inside the clone what runs: `npx vitest run src/print`, `npx tsc -b`, `npx oxlint src/print` (the orchestrator runs the rest).

## Your own visual check (required; the orchestrator repeats it)
Put a throw-away harness in a folder named `_scratch/` at the clone's root (a Vite page that renders `Cover`, `Contents` with the sample's entries, and two pages with `TabHeading`, `SectionHeading` and the header and footer, inside `PrintTemplate`). Open it in Chrome, press Ctrl+P, destination "Save as PDF", paper A4, margins "Default" (the CSS decides), "Background graphics" ticked, headers and footers **off**. Put each page beside the matching sample page image and compare: the band edge, the ring, the text extents in the table above, the header rule, the footer positions. Report which numbers you had to move and by how much. Do not commit or keep `_scratch/` (the orchestrator removes it): list it in the report.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the exact exported names and signatures; each measurement you could not match (string, target extent, what you got); decisions the packet did not cover; whether margin boxes drew correctly in Chrome; every Open question (including the member-report sub line wording and the `TAB` eyebrow).

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/superpowers/plans/2026-11-17-batch-i-pdf-export-plan.md (background: Batch I, Tasks I-8 and I-9)
5. Docs/orchestration/2026-11-23-i89-print-template-packet.md (your task: I-8/I-9)
Open the sample page images Docs/orchestration/2026-11-13-batch-i-sample-report/full/f01.png, f02.png, f03.png, f04.png, f05.png, f19.png and f39.png and build to them: the sample is the design. Work only in C:\Users\Dell\ag-i89 on branch ag/i89-print-template. Tests first: write the tests and show them fail, then make them pass. Create only new files under frontend/src/print/. Never run a git command that changes anything. Touch nothing else. Reply with the report block from the packet, nothing else.
```
