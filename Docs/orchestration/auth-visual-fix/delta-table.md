# Auth visual fidelity: delta table (vf-0 inventory)

4 Nov 2026. Built from: the owner's nine staging screenshots, the clean pictures of every design page (sign-up p2, p5, p8, p11, p16, p19; log-in p2, p5, p7, extracted at full size), the real code, and orchestrator screenshots of `/dev/auth-screens?screen=<id>`. Desktop only (1024 px and wider). **Status column:** DONE = fixed in the foundation commit (`vf: foundation ...`, checked by screenshot); T1 to T8 = the Gemini task in `vf-packet.md` that fixes it.

## A. Every screen (page, card, panels, top bar)
| # | Element | Mockup | Build before | Status |
|---|---|---|---|---|
| A1 | Page background | Almost white mint wash `#F8FEFA`, two faint green arcs, card floats | Flat `#F4FAF6` | DONE (`.auth-page`) |
| A2 | Card | 28 px radius, large soft shadow, about 1240 x 780 on a 1440 x 810 window, never taller than the window | 1100 px wide, as tall as its content (726 to 875 px), so it scrolled | DONE (`--auth-card-h`, `--auth-card-w`) |
| A3 | Left panel tint | Very light mint `#F2FCF6` to `#F8FDF9`, runs flush to the card edge (no inner rounded box) | Strong mint `#E4FAEC` in an inner rounded box with a 40 px white frame | DONE |
| A4 | White-panel screens (3, 5, 6) | White left panel with a short hairline on its right edge | Same mint box as the others | DONE (`tone="white"`) |
| A5 | Logo | Official wordmark sitting on the panel, no box | A 296 x 100 lossy WebP with a white background (visible box) | DONE (`brand/unifolio-logo-light.png`) |
| A6 | Illustrations | Hand-drawn sketches on the panel, no box | Lossy WebP crops on off-white (visible box) | DONE (8 vector sketches, transparent; one fidelity note below) |
| A7 | Feature rows | Round mint badge with a green line icon, title 15 px 600, detail 13 px muted | No icons | DONE for sign-up 1, log-in 1, 4, 5 (`rowIcons`) |
| A8 | Left-panel layout | Sign-up 1 and log-in 1: text left, sketch beside it (wide). All others: sketch above text (stacked) | Always stacked | DONE (`layout="wide"`) |
| A9 | Headline accent | Green second half | Dark green `#15803D` | DONE (`--auth-accent`) |
| A10 | Top bar | `Back` left, `Step n of 5` + five 36 x 6 px segments right (green, grey `#E6E8EE`), identical on every screen | 24 x 4 px mint-grey segments | DONE |
| A11 | Heading focus box | none | A green rectangle around the heading on load (programmatic focus) | DONE (outline removed on `h1`) |
| A12 | One viewport | Whole screen visible with no page scroll | Sign-up 1, log-in 1, 4 and 5 scrolled at 1440 x 810 (+112 and +92 px on 4 and 5) | DONE for the card and left panel (height tokens in three steps: 780+, under 760, under 680). The right panels are fitted in T2 to T8 |

## B. Right panels and controls
| # | Screen | Element | Mockup | Build before | Fix |
|---|---|---|---|---|---|
| B1 | Sign-up 1 | Mobile field | `+91 ⌄` with chevron, a hairline divider, placeholder | `+91` with no chevron | T2 |
| B2 | Sign-up 1 | Primary button | Green pill, soft green shadow, text and trailing arrow | Flat pill, no arrow | T2 (`AuthButton`) |
| B3 | Sign-up 1 | Terms line | 13 px grey, green links, left aligned | Centred | T2 |
| B4 | Sign-up 1 | Hairline above "Already have an account? Log in" | Present | Present (now drawn by the card) | DONE |
| B5 | Log-in 1 | Tabs | Boxed group, selected tab faint green with a green mail or phone icon | Grey pill, no icons | T3 |
| B6 | Log-in 1 | Field | Leading mail icon | No icon | T3 |
| B7 | Log-in 1 | `OR` | Line, `OR`, line | Plain `OR` text | T3 |
| B8 | Log-in 1 | "New to Unifolio? Sign up" | Green link with an arrow | No arrow | T3 |
| B9 | Code screens (sign-up 2, log-in 2 and 3, email code) | Code cells | Six rounded squares, green focus ring | Small grey cells | T4 (`cellClassName`) |
| B10 | Code screens | Resend | One line: "Didn't receive the code? Resend code in 00:28" (second part green) | Split left and right, grey | T4 |
| B11 | Code screens | Verify button | Green pill with an arrow | No arrow | T4 |
| B12 | Code screens | `OR` and call | `OR` line, grey pill with a phone icon "Get code via call" | Plain grey text | T4 |
| B13 | Code screens | Number or email and edit link under the paragraph | Green phone or mail icon with the number; green pencil with "Edit number" | Plain text and a small link | T4 (`identity`) |
| B14 | Sign-up 3 | Fields | Leading person and mail icons, `i` icon hint under the name | No icons, no `i` | T1, T5 |
| B15 | Sign-up 3 | Button | Arrow | No arrow | T5 |
| B16 | Sign-up 4 | Four investor rows | Icon badge left (sprout, chart, people, briefcase), radio right, selected row green border on faint green | Text only, no radio | T6 |
| B17 | Sign-up 4 | Goals | 3 x 2 grid of chips, each with a line icon and a checkbox at the right | Wrapped pills | T6 |
| B18 | Sign-up 4 | "Select all" header | One line: heading, grey note, green link at the right | The note wrapped under the heading, "Select all" twice on screen | T6 (behaviour unchanged, layout fixed) |
| B19 | Sign-up 5 | Left sketch | Floating cards only | Wallet scene | T7 (`sketch="cards"`) |
| B20 | Sign-up 5 | Sources | Badge icons, "Coming soon" pill right after the title, chevron at the right | Text only, pill far right | T7 |
| B21 | Sign-up 6 | Left sketch | Wallet scene | Tick | T8 (`sketch="wallet"`) |
| B22 | Sign-up 6 | Right top | Tick sketch with rays | Plain green circle | T8 |
| B23 | Sign-up 6 | Status rows | Solid green check circle, ring spinner | Bare tick, small spinner | T8 |
| B24 | Sign-up 6 | Cards | "Accounts being imported" with badge icons and right-hand check; grey "While we fetch your data" card with bulb badge | Plain text rows | T8 |

## B2. Two extra changes the owner asked for (not part of the auth screens)
| # | Where | Owner's request | Status |
|---|---|---|---|
| X1 | Mutual funds, "Returns against the category average" | Show `%` (for example `-1.6%`), not `pts`; the summary sentence no longer says "in percentage points" | DONE by the orchestrator (`otherLogic.ts`; 196 tests in `mutual-funds/other` pass). The Home page "Worth a look" chip `▲ 15 pts` is a different card and was left alone (ask the owner) |
| X2 | Individual fund, Performance card | Less cluttered; data and all notes stay | T11 in `vf-packet.md` (benchmark strip, one fund name, pill legend; fixes the overlap of the fund name and "Benchmark:") |

## C. Known differences we accept or must ask about
- **Code length:** the sign-up 2 mockup draws five cells; the app sends and checks six digits. Six stays (behaviour).
- **Copy:** words come from the copy sheets, not the clean pictures (for example the headline "One dashboard for your family's financial life", the new paragraphs, "Select all that apply" instead of "Select up to 3"). Pill "One dashboard for your entire financial life" is inside red circle 1 and is not drawn.
- **Sketch fidelity:** the sketches are redrawn as vector line art in the same style, not traced from the pictures. They are cleaner and heavier than the owner's pencil-wash drawings (no hatching, flat mint washes). If the designer has the original files, drop them over `public/illustrations/auth/<name>.svg` or `.png` with the same name (open question for the owner).
- **Not inventoried yet:** error states, and the sign-up 3 "name only" state, are checked in the visual gate (section 8 of the handoff), not here.
