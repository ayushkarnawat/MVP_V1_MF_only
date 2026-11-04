# Handoff: make the sign-up and sign-in screens look exactly like the owner's PDFs (visual fidelity pass)

Written 4 Nov 2026 by the UI round 2 backend orchestrator, for the manager's Claude (orchestrator) and Antigravity (worker). The owner asked the manager to take over all UI fixing. **Goal: after this pass and a staging deploy, every new sign-up and sign-in screen looks exactly like the owner's two PDFs, with the new copy.** Nothing in the backend needs to change.

## 1. Why this exists (what went wrong)
UI round 2 shipped to `ls-redesign.unifolio.in` with the right behaviour and the right copy but not the right look. On sign-up screen 1 the owner saw: the logo and the illustration inside visible white boxes; the three feature rows with no icons; the illustration stacked above the text instead of beside it; no `+91 ⌄` chevron; no arrow on Get OTP; no divider above "Already have an account?"; a flat white page instead of the mint gradient with a soft-shadowed card. Causes, all confirmed in the repo:
1. **The images are not the artwork.** `frontend/public/illustrations/auth/*.webp` are the compressed previews embedded in the planning page (`2026-11-02-auth-redesign-plan.html`): lossy WebP on an off-white background, no transparency, a 3.9 KB logo (296x100) and a 34 KB laptop sketch (423x587). Their README says so. The official transparent wordmark already exists at `frontend/public/brand/Unifolio Logo Transparent.png` and was not used.
2. **The icons were never wired.** `AuthLeftPanel` accepts `rows[].icon` but no screen passes one; the plan's task text did not list the icon badges, arrows, chevron or divider.
3. **The tests check behaviour, not looks.** Every S6 test asserts text, focus and requests. Nothing compares a screen with a mockup. The screenshot step of the earlier stage gates was dropped, and the S6 gate closed on tests and build.
4. **Nobody compared the built screens with the PDFs side by side.** That comparison is the first step of this pass and the gate at its end.

## 2. The sources of truth: the two PDFs (the owner and the manager both have them)
`Unifolio Webapp sign up redesign 1.pdf` (21 pages) and `Unifolio Webapp login redesign 1.pdf` (8 pages). Page size 1440x810. **Each design page is one flat 1536x1024 picture, not layered artwork** (so illustrations can only be cropped from it at about the size they already are; sharper art needs the designer's originals, see section 5).

**How the pages work** (this is how the owner marked them up):
- A page titled with just a number (`1`, `2`, ...) is the **clean design picture** of that screen: layout, spacing, type scale, colours, icons and illustration are authoritative. Its words are **placeholders** in some places.
- The next page (`1 Copy`) is the same picture with **red circles and numbers** over the parts whose **words must be replaced**.
- The following page(s) (`1 Copy` again) are the **copy sheet**: numbered text that replaces what is inside the red circle with the same number. A page that says `NO CHANGE` means the design's own words stay.
- So: **take the look from the clean picture, the words from the copy sheet.** Where a red circle covers a block that has icons (for example the three feature rows), the icons are part of the design and stay; only the text changes. The tag pill "One dashboard for your entire financial life" sits inside red circle 1 on screen 1, so it was probably meant to be replaced by the new headline: treat its absence as correct unless the owner says otherwise.

**Page map**

| Screen | PDF | Clean design | Annotated | Copy sheet(s) |
|---|---|---|---|---|
| Sign-up 1, mobile number | sign up | p2 | p3 | p4 |
| Sign-up 2, verify the code | sign up | p5 | p6 | p7 |
| Sign-up 3, create your account (name, email) | sign up | p8 | p9 | p10 |
| Sign-up 4, investor profile and goals | sign up | p11 | p12 | p13, p14, p15 |
| Sign-up 5, connect accounts | sign up | p16 | p17 | p18 |
| Sign-up 6, you're all set | sign up | p19 | p20 | p21 |
| Login 1, welcome back (Email / Mobile tabs) | login | p2 | p3 | p4 |
| Login 2, code | login | p5 | p6 (NO CHANGE) | |
| Login 3 | login | p7 | p8 (NO CHANGE) | |

**Extract them:** `Docs/orchestration/auth-visual-fix/extract_mockups.py` (`pip install pymupdf`, then `python extract_mockups.py "<folder with the PDFs>" ./mockups`) writes the full-size picture of every page (`signup_p02_img0.png`, ...), a 100 dpi render of every page (the annotated pages need this), and `signup_copy.txt` and `login_copy.txt` with every page's text. Do not commit the PDFs or the output.

**The copy that is already right (do not change):** the built headline, paragraph and row text on sign-up 1 and login 1 match the copy sheets: headline "One dashboard for your family's financial life"; sign-up paragraph "Bring your family's investments together, uncover deeper insights, and make more informed financial decisions."; login paragraph "Pick up where you left off." (then the same three rows); rows "All your investments / Mutual funds, stocks, PMS, real estate, gold and more.", "Insights that matter / Understand performance, uncover overlap and spot potential risks.", "Your family's wealth, together / See your family's investments in one place." Other screens' copy is in `signup_copy.txt` (verify the code; "Let's start with the basics" / "Tell us a few basic details to get started."; "Tell us a little about how you invest and what you're working towards, so we can make your insights more relevant." and "What are you working towards?"; "Bring your investments together." / "Secure & Private"; "You're all set!" / "Getting your accounts ready"). **Never put the old placeholder words from the design picture back** (for example "See everything you own. Understand what it means.").

## 3. The design vocabulary the build is missing (confirmed from the PDF pictures of screens 1, 3, 4 and login 1; inventory the rest)
- **Page and card:** a light mint gradient page with two faint arcs, a large rounded card with a soft shadow. The left panel treatment **differs per screen**: screen 1 and login 1 have a mint-tinted left panel with the text on the left and the **illustration beside it on the right** (wide layout); screen 3 has a white left panel with a hairline vertical divider, the illustration above the headline (stacked); screen 4 has a mint left panel, illustration above the headline, three icon rows below. Copy the layout of each screen as drawn; do not force one layout on all.
- **Logo:** the large wordmark sitting directly on the panel, no box (official file in `brand/`).
- **Illustrations:** drawn on the panel with no visible white square.
- **Icon badges:** a round mint circle with a green line icon, beside each feature row (bar chart, light bulb, people group on screen 1; light bulb, sliders, target on screen 4).
- **Inputs:** a leading icon inside the field (envelope for email, person for name, phone for mobile), a rounded 12 px field, an `i` icon with the hint text under the field, the country selector `+91 ⌄` with a chevron.
- **Buttons:** the green pill with white text and a **trailing arrow** (`Get OTP →`, `Continue →`).
- **Top bar:** `← Back` at the top left of the right panel, `Step N of 5` with five segments at the top right (green for done, grey for the rest), same position on every screen.
- **Login 1:** `Email | Mobile number` tabs **with icons** (envelope, phone), an `OR` divider with hairlines, `New to Unifolio? Sign up →`.
- **Screen 4:** the four investor options are rows with an **icon badge on the left and a radio on the right**; the six goals are **chips with a line icon and a checkbox on the right**, in a 3x2 grid; headline accent words in green ("your **experience.**", "your **entire financial life.**").
- **Text accents:** the headline's second half is green where drawn.

## 4. Where the code is
All under `frontend/src/features/auth/redesign/` unless noted: `AuthSplitCard.tsx` (the card and top bar), `AuthLeftPanel.tsx` (logo, sketch, headline, rows; **`rows[].icon` exists and is never passed**), `sketches.ts` (asset file names, motion table, `logoSrc()`), `AuthField.tsx` (has an `icon` prop), `SegmentedTabs.tsx`, `StepProgress.tsx`, `SignupPhoneEntry.tsx`, `LoginEntry.tsx`, `SignupCode.tsx`, `LoginCode.tsx`, `EmailCode.tsx`, `OtpPanel.tsx`, `AccountDetails.tsx` (screen 3), `InvestorProfile.tsx`, `OptionRow.tsx`, `ChipCheckbox.tsx` (screen 4), `ConnectAccounts.tsx`, `SourceRow.tsx` (screen 5), `AllSet.tsx`, `StatusRow.tsx`, `InfoCard.tsx` (screen 6 and 3), `loginCopy.ts`, `finishCopy.ts`; tokens in `frontend/src/styles/auth-tokens.css` (mint tints `#E4FAEC` fading to `#F6FEF9`, card shadow, step colours, the float keyframes); assets in `frontend/public/illustrations/auth/` and `frontend/public/brand/`.
**Review without a backend:** run `npm run dev` and open **`/dev/auth-screens`** (development builds only): the dev index renders every redesigned screen with fake props (`devScreens.tsx`). Use it for the side-by-side comparisons.

## 5. Assets plan
1. **Logo:** use `frontend/public/brand/Unifolio Logo Transparent.png` (the wordmark with the green ring "o", the same one as in the mockup). Check it really has transparency; if not, export a transparent PNG or SVG from the owner's source.
2. **Illustrations:** **ask the owner for the original illustration files** (SVG or transparent PNG, ideally at 2x): laptop-with-cards, phone-code, envelope-code, id-card, person-thinking, floating-cards, wallet-folder, tick. Fallback if they do not exist: crop each from the 1536x1024 design picture as a **lossless PNG** (not the 1 to 34 KB lossy WebP), place it on the panel with `mix-blend-mode: multiply` so the near-white background disappears into the mint, and say in the report which sketches are still lower quality. Update `sketches.ts` file names and the README in `public/illustrations/auth/` (it currently says "lossy WebP on an off-white background").
3. **Icons:** the line icons in the design (bar chart, bulb, people, envelope, phone, person, info, sliders, target, umbrella, graduation cap, house, sun, document, sprout, briefcase, arrow, chevron). Use the repo's existing icon set (`frontend/public/icons.svg` and the icon library the app already uses; check `package.json`) so the stroke weight matches; no new dependency.

## 6. Method (the same orchestrator-and-worker method as UI round 2)
**Roles:** the manager's Claude is the orchestrator (writes packets, reviews every diff, runs the gates, commits, deploys); Antigravity (Gemini) is the worker. Standing worker rules: `Docs/orchestration/ui-common-rules-antigravity.md` (frontend only, no git writes, tests first, the worker **cannot see the screen** so it must say so, and **the orchestrator takes every screenshot**). Packet format and a reference-solution approach: see `ui-s1-fe-packet.md` and `ui-s2-fe-packet.md`.

**Phases (suggested packet names `vf-1` to `vf-5`):**
1. **vf-0 inventory (orchestrator, no worker).** Run the extraction script. Run the app, open `/dev/auth-screens`, screenshot every redesigned screen and state at **1440x810** (the PDF canvas) and **1920x1080**. For every screen put the PDF's clean picture next to the screenshot (Read both) and write `Docs/orchestration/auth-visual-fix/delta-table.md`: one row per visible difference (element, the mockup, the build, the file to change). The known ones in section 3 are the start; screens 2, 5, 6 and login 2 and 3 are not inventoried yet.
2. **vf-1 assets and foundations:** logo, illustrations (section 5), page background and arcs, card shadow, the wide and stacked left-panel variants, icon badge component, top bar (`Back`, `Step N of 5`).
3. **vf-2 shared controls:** `AuthField` leading icons and hint-with-icon, the primary button arrow, the country selector chevron, `SegmentedTabs` icons, the `OR` divider, footer links with arrows.
4. **vf-3 screens:** login 1, sign-up 1, then the code screens, sign-up 3, 4 (icon rows and goal chips), 5, 6, login 2 and 3. One screen per task so each gets its own visual check.
5. **vf-4 visual gate and deploy** (section 8 and 9).

**Tests:** keep every existing test green (behaviour must not change). Add **structural** tests for what was missed: the three feature rows each render an icon; the primary button shows the arrow; the phone field shows the chevron; the left panel has the wide layout on screen 1 and login 1 and the stacked layout on screens 3 and 4 (assert on a layout `data-` attribute or class, not on pixel values); the images are PNG or SVG with no white background class; the logo is the brand file. These guard against a repeat; they do not replace the screenshot comparison.

## 7. Rules that must not break
- **Behaviour, flows and copy stay as built** (the copy is already right per the copy sheets). This pass changes look and structure only. No backend change, no migration, no new dependency, no `package.json` or lockfile change.
- **Mobile is unchanged:** under 768 px or on a `/mobile` path the legacy screens render as before.
- **Accessibility holds:** keyboard order, visible focus, announced errors, the screen 4 option groups as one Tab stop each, `prefers-reduced-motion` stops the sketch float. Decorative icons are `aria-hidden`.
- **Google sign-in stays hidden** (`AUTH_SHOW_GOOGLE = false`).
- **Plain words** in anything user-visible; never log a code, email or phone number.
- If a design element needs something the repo does not have (a font, an icon, a new asset), STOP and ask the owner rather than approximating.

## 8. The visual gate (what "done" means)
For **every screen and every state the PDFs draw** (default, filled, error where drawn), at 1440x810 and 1920x1080, the orchestrator puts the PDF's clean picture and the screenshot side by side and fills in a table: `screen | state | PDF page | matches? | differences`. **Done = no visible difference** in layout, spacing, type scale, weights, colours, icon presence and style, button shape and arrow, illustration placement and quality, top bar, and page background, with the new copy. Differences that cannot be closed (for example sketch sharpness until the originals arrive) are listed with the reason and shown to the owner. Also check: 1024 px and 768 px widths (the card stacks, nothing clips), keyboard walk, reduced motion. The owner signs the table.

## 9. Branch, deploy and rollback
- **Current state (4 Nov 2026):** staging runs `leapswitch-redesign` at `5830bb08` or later (it contains the final merge of UI round 2, `89ecd3ae`). `ui-round-2` is now behind it and should not be used. The backend lane has nothing to add; nothing here needs a migration.
- **Recommended:** a branch `ui-visual-fix` cut from `origin/leapswitch-redesign` in its own worktree; commit prefix `vf:`; merge into `leapswitch-redesign` when the visual gate passes (the manager's own branch rules decide how).
- **Deploy is front end only:** on the VM in `/opt/unifolio-redesign` (`git fetch origin`, check out the commit, `git rev-parse HEAD`), then `sudo sh ./scripts/deploy-redesign.sh` (no `--full`: it builds the bundle into `frontend/dist`, Caddy serves it live, the backend and worker are untouched). Then a hard refresh (Ctrl+Shift+R) in a private window. No database backup is needed for a front-end-only change. Follow the guard rules of `2026-11-04-staging-deploy-guide-ui-round-2.md` (STOP conditions, never improvise, never `clean-db.sh`, `restore.sh` or `rollback.sh`).
- **Rollback:** check out the previous commit on the VM worktree and rerun `deploy-redesign.sh` (front end only).
- **After the deploy:** the visual rows of `2026-11-04-staging-qa-checklist-ui-round-2.md` (groups G, H, I) must be re-run against the PDFs, not against memory; screenshot each.

## 10. What is already verified and must not regress
Backend: the full suite with Postgres on the merged head is 5755 passed with 5 known environmental failures (they read an untracked cache file); migration `0053` is applied on staging. Frontend S6 tests pass. The deploy and QA documents: `2026-11-04-staging-deploy-guide-ui-round-2.md`, `2026-11-04-staging-qa-checklist-ui-round-2.md`.

## 11. Honest limits
I (the backend orchestrator) have seen the PDF pictures of sign-up screens 1, 3 and 4 and login 1 and the owner's staging screenshot of sign-up screen 1; I have **not** compared the built screens 2, 3, 4, 5, 6 or login 2 and 3 with their pictures. Do not trust the delta list in section 3 as complete: the inventory in vf-0 is the real list.
