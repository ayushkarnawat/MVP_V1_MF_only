# Visual gate: auth screens against the owner's PDFs (4 Nov 2026)

How this was checked: every screen was rendered at full resolution in headless Chrome from the dev screens page
(`/dev/auth-screens?screen=<id>`), put next to the clean mockup picture, and measured for overflow in an iframe at each
size. Desktop only. Nothing here is a claim of a pixel-perfect match: the "Differences" column lists what a person can still
see. **The owner signs the last column.**

## Fit (no scrolling inside the card, no page scroll, no horizontal scroll)
Ten screens (every sign-up and log-in screen and state with a card) at 1920x1080, 1536x730, 1440x810, 1366x650 and 1280x600:
**50 of 50 fit** after the fixes (measured with `scrollHeight` against `clientHeight` of the card, the right panel, the left
panel and the page). Narrow set, also 10 screens: 1100x800, 1024x768 and 1024x700 fit. **One known exception:** sign-up 4 at
1024x600 (a window smaller than the 1280x600 floor) scrolls inside its right panel by 22 px; nothing is clipped.
768 wide stacks into one column and scrolls the page normally (no horizontal overflow).

## Screen by screen (1440x810)
| Screen | State | PDF page | Matches | Differences still visible | Owner |
|---|---|---|---|---|---|
| Sign-up 1, mobile number | empty | sign-up p2 | Wide layout, mint panel, official logo, laptop sketch with no box, icon badges, `+91` with chevron, green pill with arrow, terms line, hairline and "Log in" link, step bar | The green pill "One dashboard for your entire financial life" is inside red circle 1 and is not drawn; headline words come from the copy sheet; sketch lines are cleaner and heavier than the pencil-wash original | [ ] |
| Sign-up 2, code | empty | sign-up p5 | Phone sketch, six rounded cells (focus ring green, checked), resend line, OR line, grey "Get code via call" pill with phone icon, edit link with pencil | Mockup draws five cells, the app checks six digits (behaviour, kept); heading words come from the copy sheet ("Verify your number", the clean picture says "Enter the OTP") | [ ] |
| Sign-up 3, account | empty | sign-up p8 | White left panel with ID-card sketch, leading person and mail icons, `i` hint, arrow button, hairline | "Why do we need your PAN name?" card and the lock line are copy-sheet content | [ ] |
| Sign-up 4, profile | nothing chosen | sign-up p11 | Person sketch, icon badges and radios on the four rows, 3 x 2 chips with icon and checkbox, one-line Select all header, arrow button | Mockup shows "Just getting started" pre-selected and a different headline; the build selects nothing (design rule Q67) and uses the copy-sheet headline; a few chip labels wrap to two lines | [ ] |
| Sign-up 5, connect | Mutual funds picked | sign-up p16 | Floating-cards sketch, icon badges, "Coming soon" pills right after the titles, chevrons, six rows, button visible | Headline words from the copy sheet | [ ] |
| Sign-up 6, all set | importing | sign-up p19 | Wallet scene left, tick with rays right, solid green check rows, "Accounts being imported" card with right-hand check, grey "While we fetch your data" card | Words from the copy sheet ("Getting your accounts ready"); the mockup lists three source rows, the build lists the real imported accounts | [ ] |
| Log-in 1 | email tab | log-in p2 | Wide layout, boxed tabs with mail and phone icons, leading mail icon, arrow button, OR line, "Sign up" with arrow | Mockup right panel is a little taller (OR line sits lower) | [ ] |
| Log-in code | phone | log-in p5 | Same code panel as sign-up 2, phone and edit lines under the paragraph | Mockup has no "Test mode" banner (shows only in development) | [ ] |

## Other changes in this release
| Change | Evidence |
|---|---|
| Category card `%` instead of `pts` | `otherLogic.ts`; 196 tests in `mutual-funds/other` |
| Home "Worth a look" chip `%` instead of `pts` | `worthCopy.ts` (`▲ 15%`, `▼ 5%`); Home tests pass (722) |
| Performance card (Model Portfolio Returns) | Screenshot with fixture data: one bordered strip (Benchmark line, then one paragraph), fund name once (legend pill, truncated with the full name on hover), no overlap. Not checked: the chart itself (unchanged code; it did not draw in headless capture), the Actual XIRR side (already compact, not changed) |

## What this gate did not check
- Error states (wrong code, expired code, no-account message) and the sign-up 3 "name only" state: covered by tests, not by screenshot.
- Real browsers other than Chrome; reduced motion (the CSS rule is tested, not seen); a click-through of the whole flow on staging.
- Select all and Clear all: covered by the existing behaviour tests (they pass, unchanged); not clicked in a browser.

## Fixes made by the orchestrator after the Gemini run
Gemini's output was kept, with these changes: the content block widened from 440 to 520 px (the mockup blocks are about 520);
the code-cell look moved into one CSS class that also overrides a global `div > input:focus` rule in `index.css` (which made
the focused cell show no border at all, scoped to the auth page only); Connect rows 6 px shorter; the "Coming soon" pill no
longer wraps; chip text 12.5 px; the shortest spacing tier slightly tighter; the compact spacing tier now also applies below
1200 px width; hairline border on the benchmark strip.

## Sketches, second pass (4 Nov, evening)
Seven sketches were redrawn (thinner variable ink, lighter washes, the solid green slabs removed): laptop, phone, envelope,
id-card, cards, wallet, tick. The person on "How do you usually invest" is now **the designer's own drawing from the mockup
PDF**, cut out with its background made transparent (`person.png`, alpha channel, feathered edges) after the owner approved
that exception, because three redraws did not match. Known differences: the redrawn ones are cleaner than the pencil-wash
originals and the card labels use a system sans font, not the designer's handwriting font; the person PNG is the mockup's
own resolution (about 500 px wide, upscaled 2x), so it is softer than the vector sketches on a high-density screen.

## Live check on staging (after the deploy, `ls-redesign.unifolio.in`, commit `b782be23`)
Sign-up 1 and log-in 1 at 1440x810 (measured: no page scroll either way, card 1240 x 762 inside the 810 window), screenshots
at 1920x1080, 1366x650 and 1024x768 (all fit); no Google button. Not checked live (needs a real code, the owner's job): sign-up
2 to 6 and the log-in code screens, QA groups G and H beyond the first screens.
