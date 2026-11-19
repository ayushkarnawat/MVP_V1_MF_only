# H-2: the CAMS tutorial: script, on-screen text and transcript (Batch H, part 1)

Source: `Docs/orchestration/2026-11-13-batch-h-planning-workbook.html` (section 3, the Look 2 script, eight scenes, about 53 seconds, no audio; the pop-up in section 4). The words are the live CAMS form's own (as it read on 13 Nov 2026). This file is the single source for `frontend/src/features/import/tutorial/tutorialCopy.ts`.

## Strings (exact)
| Where | Text |
|---|---|
| Link (secondary text link, play icon before it) | `Watch how it works` and, beside it in muted small text, `53 sec` (accessible name: `Watch how it works, 53 seconds`) |
| Pop-up title | `How to request your statement from CAMS` |
| Close control (accessible name) | `Close` |
| Chapter buttons (in order) | `Request`, `Fill the form`, `Inbox`, `Upload` |
| End-of-video buttons | `Watch again` and the green `Request Statement on CAMS` |
| Transcript heading | `The four steps` |
| Reduced-motion line (shown above the steps instead of playing) | `Your device is set to reduce motion, so the video does not play by itself. The steps are below.` |

## Chapters (start times, seconds, from the script table)
`Request` 4, `Fill the form` 13, `Inbox` 37, `Upload` 41 (read from the finished video's own step labels on 20 Nov: Step 2 of 4 appears at about 13 s, Step 3 of 4 at about 37 s, Step 4 of 4 at about 41 s). (Scene 1, the opening, 0 to 4 s; scene 8, the end card, 47 to 53 s.)

## The four steps (the transcript, in the live form's words; each is also the chapter's text)
1. **Request.** Press Request Statement on CAMS. The official CAMS website opens in a new tab.
2. **Fill the form.** If a banner covers the form, close it first. Choose Detailed. For the period, choose Specific Period, from ten years ago to today. For folio listing, choose With zero balance folios. Enter the email registered with your funds. Set a password, and remember it. Then press Submit.
3. **Inbox.** CAMS emails your statement, usually within five to ten minutes. Download the PDF.
4. **Upload.** Come back to Unifolio, add the file, and type the same password.

Opening line (first 4 seconds, in the transcript above the steps): `Here is how to bring your full mutual fund history into Unifolio, in four steps.` Closing line (after step 4): `That is it. Your funds appear in your dashboard.`

## Rules the copy keeps
- "usually within five to ten minutes" is the app's own claim on the waiting screen; the video promises no more.
- "the official CAMS website" in the narration; no partnership claim.
- No em dashes in user-visible text.

## For the owner (not changed by this plan; flagged)
The live CAMS form does not match the app's own screen text in two places: the app says "10-year duration" and "with zero folios"; the live form's period choices are Current Financial Year, Previous Financial Year and Specific Period (a From and To date), and its folio choices are With zero balance folios, Without zero balance folios, and Transacted folios and folios with balance. The tutorial uses the form's words. Whether CAMS accepts a ten-year range has not been tested. The app's screen text is not changed here; say if you want it aligned.
