# Planning (market scenarios): layout (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 2. Inputs: functionality spec sections 1 to 5, shell contract v1.5, PDF page 29, the Home and Profile layout documents for the frame. Desktop only. The widths below are proposals (1280 and 1024 px); they are to be checked against the shell layout document's breakpoints in the build step. Nothing here is built.

## 1. Page frame

Inside the shell's `PageLayout` (content column to the right of the sidebar, top bar above). Page padding and max width come from the shell; nothing is redefined here. Title row: H1 "Planning" and one subtitle line (wording G4). In the `market` state the title row also holds the Back link (left of the title block, icon `chevron-left`, text "Back to Planning"). Within `future` the same Back link appears.

## 2. Landing

Two cards side by side, equal width, gap 24 px, each 112 px tall: icon tile (48 px, tinted), title (H3, Semi-bold), one line of body text, and a round arrow button at the right. Below 1024 px wide the cards stack. The whole card is the click target; the arrow is decorative (hidden from assistive tech, the card is a button with the title as its name). Focus ring 2 px green.

## 3. Scenario list

- **Curated block:** a grid of scenario cards, 5 per row at 1280 px and above, 3 per row from 1024 to 1279 px, 2 per row below. Card height follows content (name two lines, description two lines, stat line); cards in a row share one height.
- **Toggle row:** the "More scenarios" / "Hide" text button, left aligned, below the curated block.
- **More block (when open):** the pills row (All, Crashes, Bull Runs, Policy / Rate) then the same grid.
- **Selected card:** 2 px green outline and the selected tint. Other cards: card background, 1 px divider border.
- Card layout (top to bottom): icon tile (40 px) at the left with the name beside it (Semi-bold, two lines maximum, ellipsis), dates in secondary text, description in body text (two lines, ellipsis, full text in the tooltip), then the bottom row: stat at the left, chevron at the right. Badges (Freeze, ongoing, Assumption-based) sit at the top right.

## 4. Scenario detail

Appears below the list after a smooth scroll. Content width follows the page. Top to bottom:

| Row | Layout |
|---|---|
| Heading row | name (H2) and dates and description at the left; member dropdown at the right (200 px); disclaimer line under both, full width, italic secondary text |
| Tiles | 4 tiles in one row at 1024 px and above (2 by 2 below); each tile: caption, large value, one small line |
| Charts | at 1280 px and above: three columns 5fr / 6fr / 4fr: Benchmark comparison, Impact by asset class, Insights from Mira. From 1024 to 1279 px: the two charts side by side, Mira card full width below. Below 1024 px: all stacked |
| Phase cards | multi-phase only: 3 cards in a row, under the tiles and above the charts |
| Members | "By family member" card, full width; rows expand in place |

Vertical rhythm: 24 px between rows, 16 px inside cards (20 px padding). Chart cards have equal height in their row.

## 5. State matrix

| Where | Loading | Empty | Partial or no data | Error |
|---|---|---|---|---|
| List | 8 skeleton cards (same grid) | "No scenarios are available yet." | n/a | "Scenarios aren't available right now." with Try again |
| Detail | skeleton tiles and two skeleton chart cards under the heading (heading shown from the list data) | household has no holdings: message with a link to import a statement (G6); tiles and charts hidden | tiles show what exists; "Not enough historical data to estimate" where a number is null; coverage line explains; pre-2006: index-only view with note | "Scenarios aren't available right now." with Try again; the list above stays usable |
| Member change | tiles and charts dim to 60% with a small spinner; the previous numbers stay until the new response arrives (no layout jump) | a member with no funds is not offered | as above | the dropdown reverts to the previous member and the error shows in place |
| Coming soon (`future`) | none | the view itself | n/a | none |

## 6. Scope behaviour

Planning is not scoped by the top bar (scope none): no member banner, no top-bar selector effect. The dropdown on the detail is the only member control (L5, L19). Family combined is the default; the choice is kept while moving between scenarios and reset when Planning is left.

## 7. Responsive and accessibility

Desktop only (mobile untouched). Keyboard order: Back, cards, More toggle, pills, selected detail's dropdown, charts (focusable bars with an accessible name and value each), Mira button, member rows (expand with Enter or Space). Every bar has a text value, so no information is colour-only. Reduced motion: no smooth scroll, no bar animation.

## 8. Dark mode

Same layout. Tints become low-opacity primaries (M15 of Home). Detail in the mockups file.
