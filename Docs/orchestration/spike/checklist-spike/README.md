# Floating checklist spike (throwaway)

From this folder run `python -m http.server 8123`, then open
`http://localhost:8123/` in desktop Chrome and Edge 116 or later.
The API requires a secure context; localhost counts. No build or dependencies.
Nothing here ships. Use no real details; leave the stand-in boxes empty.
Checklist wording comes from section 5's `PITEMS` in the planning workbook.
The fake request is a timer, never a network request.

1. Start with a closed floating window. Choose 0.3 seconds and press
   **Request Statement (open the checklist first)**. Inspect the results for
   `requestWindow returned window` and `window.open returned window` or `null`.
   In the stand-in tab, check whether the floating window stays above it and
   tick an item. Return to the main page: its state and Q5 log must update.
   Record Q4 using **Record observation**.
2. Compare the floating and in-page appearance by closing and reopening the
   checklist. Repeat with the system using dark mode; the floating window must
   remain light. Record Q6. The Q6 logs show both stylesheets copied from this
   page (the external CSS and inline style).
3. Close the floating window before every fresh attempt. Repeat the first
   button for delays 1, 3 and 6 seconds. Then test
   **Request Statement (call the request first)** at all four delays, closing
   the window before each attempt. Results identify each order and delay.
   A `null` result means the stand-in tab was blocked. Do not pre-open a tab
   or change popup permissions during the comparison.
4. Close, then press **Open the checklist only** twice. The second click must
   log `Q7 focused existing window`. Tick all items, press
   **I have submitted the form**, then reload the main page. The floating
   window should close; the load line and main page must restore five ticks
   and step `Wait for the email`. Record Q8, then reopen the checklist.
5. Close it, tick **Simulate a refused request**, then press the first request
   button. Expect `NotAllowedError (simulated)`, the in-page checklist, and a
   stand-in opening attempt. Untick the simulation afterwards. This exercises
   the refusal handler, not a real browser denial. A real refusal, including
   a possible six-second request-first failure, logs its actual error name.
6. Press **Copy results** and paste the output back. Copy before a reload too:
   results are kept only for the current page load; only ticks and step persist.
   Repeat in Edge and once in Firefox to check `documentPictureInPicture=false`
   and the same in-page checklist. Safari/mobile can be checked the same way.

Do not run overlapping attempts. Close any stand-in tabs manually between
attempts. Browser timing, popup blocking, focus, always-on-top behavior,
clipboard access, styling and reload closure require these human checks;
syntax checking cannot establish their outcome. Manual observations identify
the latest attempt; record them before starting the next one. No messages are
passed between windows: the original checklist DOM and handlers are moved.
