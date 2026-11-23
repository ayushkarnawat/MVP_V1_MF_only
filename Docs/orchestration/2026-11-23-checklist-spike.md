# H-7 result: the floating checklist spike (Chrome 157, 23 Nov 2026)
Test page: `Docs/orchestration/spike/checklist-spike/` (branch `batch/h-spike`). Run by the owner in desktop Chrome 157 (`documentPictureInPicture=true`, secure context).

## Results
| Question | Result |
|---|---|
| Floating window opens when `requestWindow` is the first call in the click | **Yes** (0.3 s order, twice) |
| Floating window stays on top of the CAMS stand-in tab; ticks update the main page's state | **Yes** (Q4 PASS; shared handlers, no messages) |
| Copied stylesheets give the same look; stays light with the system in dark mode | **Yes** (Q6 PASS) |
| Reload closes the window; ticks and step come back from the browser's storage | **Yes** (Q8 PASS) |
| **CAMS tab (`window.open`) after the floating window opened in the same click** | **Blocked** (`null`), even with only a 0.3 s request |
| **Floating window after `window.open` in the same click** | **Refused** (`NotAllowedError`) |
| `window.open` from a button **inside** the floating window | **Works** (twice): a click in the window is a fresh click |
| Refusal falls back to the in-page checklist | Yes (the real `NotAllowedError` above fell back; the button was not broken) |
| Request-first order, other delays (1, 3, 6 s), second-click focus, Firefox/Edge | **Not run** (not needed for the decision below; Edge to be repeated on the final design) |

## What it means
**One click can do only one of the two things: open the floating window or open a new tab.** The plan's order (floating window first, then the request, then the CAMS tab from the same handler) does not work as drawn: the CAMS tab would be blocked as a pop-up. The reverse order fails too.

## Decision (recommended; the owner confirms)
Use the plan's own fallback idea, with the floating window as the one that opens from the green button:
1. The green "Request Statement on CAMS" click opens the **floating checklist first** (before any `await`), then starts the request in the background.
2. The checklist's first step has a button **"Open the CAMS form"** (disabled with "Getting your link ready" until the request returns, then enabled); pressing it opens CAMS. That second click is a fresh click, so it is not blocked.
3. Where the browser has no floating-window support (Firefox, Safari, phones) or refuses it: today's behaviour, unchanged (request, then CAMS opens), plus the in-page checklist panel.
4. If the request fails, the floating window shows the error with Try again; the user is never blocked.
Cost: one extra click on supporting browsers. **Alternative if the owner prefers one click:** drop the floating window and keep only the in-page panel (no change to the CAMS open).

## To check by eye on the final design
That the CAMS tab opened from the floating window comes to the front; Edge (same engine, expected the same); that the floating window's size and position are sensible on a small laptop screen.

## Effect on the plan
Task H-8's test "opens the window first, before the request and before opening CAMS" stays; add: "CAMS opens only from the checklist's own button, and that button is disabled until the request has returned" and "without support, the green button opens CAMS exactly as today". H-9 and H-10 follow.
