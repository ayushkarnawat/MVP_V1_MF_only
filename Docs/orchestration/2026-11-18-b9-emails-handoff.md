# Handoff: b9-emails (Batch B, task B-9)
**Status:** OPEN (written 2026-11-18; relay to Codex after B-2 is committed and C-5 is done or skipped)
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-b-journey-plan.md` (Task B-9, B-11). **Design source: `Docs/orchestration/2026-11-12-batch-b-planning-workbook.html`, section 6** ("Head of Family emails": four emails, light and dark, desktop 600 px and phone widths). The workbook is the design: copy, order and measurements below are read from it; a deviation is a defect; if something here and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude. **Adversarial review: yes** (hostile names, links, tokens in images and logs).
**Work in:** `D:\unifolio-b-journey` (branch `batch/b-journey`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this file.

## Task
Rebuild the four Head of Family emails in one shared branded layout: a card on a coloured backdrop with the Unifolio logo, a small tag, a two-colour headline, a subtitle, a round illustration on the right, then the email's blocks, then a footer. Light and dark mode. The four builders keep their names, arguments and return shape (`tuple[str, str, str]`: subject, plain text, html) so `head_change.py` and every caller stay untouched.

## Design: the four emails (copy from the workbook; do not reword)
Headline = text, then a **green accent** span, then optional text (`before | ACCENT | after`). Apostrophes are the typographic `’` in the headline strings below (copy exactly). Every name is HTML-escaped; names come from the builder arguments only.

**1. To the new Head of Family** (`head_changed_for_new_head_email(*, new_head_name, old_head_name)`; no link, no button; the names are not shown in this email, as today). Tag `ACCOUNT UPDATE`. Headline `You’re now the | Head of Family.`. Subtitle `The Head of Family role for your Unifolio account has been transferred to you.` Illustration: "id cards, arrow right" (`ill-forward`). Blocks: (a) **dark block** with the crown icon: `You can now sign in using your own email address or mobile number to access and manage your family’s combined financial view.` (b) **pale block** with the layers icon, bold heading `Your family’s portfolio data remains unchanged.` then `All existing investments and financial information remain intact.` Footer lines: `This is an automated account notification. Please do not reply.` / `Need help? We’re here at support@unifolio.in.` (the address is a green link `mailto:`).

**2. Undo link, to the previous head** (`head_change_undo_email(*, undo_url, valid_until)`). Tag `ACCOUNT SECURITY`. Headline `Want to | reverse | this change?`. Subtitle `If you didn’t authorise the change to your family’s Head of Family, you can restore the previous sign-in using the button below.` Illustration "id cards, arrow left" (`ill-back`). Blocks: (a) **button** `Undo Head of Family Change` (full width, green pill, links to `undo_url`); (b) **line** with the date icon: `This link is valid until <b>{format_ist_datetime(valid_until)}.</b>` (keep the existing IST formatter; the workbook sample reads `10 November 2026, 5:07 PM IST`: if the formatter's output differs, keep the formatter and say so under Open questions); (c) **line** with the warning icon: `Please note: The link will expire earlier if the previous phone number or email address is used for another account in the meantime.` (d) **pale block** with the link icon, bold `Having trouble with the button?` then `You can copy and paste the link below into your browser:` then a **link box** holding the **full link as text** (the exact `undo_url`, escaped, wrapping with `word-break: break-all`, never truncated). Footer: `This is an automated security email. Please do not reply.` / `Need help? Contact us at support@unifolio.in.`

**3. To the previous head, after the change** (`head_changed_for_old_head_email(*, new_head_name, old_head_name)`; no link, no token). No tag. Headline `Your family’s account has been | updated.` Subtitle `The Head of Family for your Unifolio account has changed.` Illustration `ill-forward`. Blocks: (a) **dark block** with the person icon, small caps `NEW HEAD OF FAMILY`, bold `{new_head_name}`, then `Will access Unifolio using their own email address and mobile number.` (b) **line** (people icon): `You ({old_head_name}) will remain a family member, but you will no longer be able to sign in using this email address.` (c) **line** (layers icon): `Your family’s portfolio data remains unchanged.` (d) **pale block** (shield icon), bold `Didn’t authorise this change?` then `We’ve sent you a separate email with a link to reverse this change. If you don’t recognise this activity, please contact us at support@unifolio.in.` Footer: `We’re here if you need us.` / `This is an automated notification. Please do not reply to this email.`

**4. Changed back** (`head_change_reversed_email(*, restored_head_name, other_head_name)`; **no link and no token**; the workbook marks this one as a draft for the owner's review). Tag `ACCOUNT UPDATE`. Headline `The change has been | reversed.` Subtitle `The Head of Family for your Unifolio account is back to the previous setup.` Illustration `ill-back`. Blocks: (a) **dark block** (crown icon), small caps `HEAD OF FAMILY AGAIN`, bold `{restored_head_name}`, `Signs in with the previous email address and mobile number.` (b) **line** (people icon): `{other_head_name} remains a family member and no longer signs in as Head of Family.` (c) **line** (layers icon): `Your family’s portfolio data remains unchanged.` (d) **pale block** (shield icon), bold `Didn’t expect this?` then `If you don’t recognise this activity, please contact us at support@unifolio.in.` Footer as email 3.

Every email's footer ends with a bold `Team Unifolio`. Subjects stay the existing constants (`HEAD_CHANGED_SUBJECT`, `UNDO_SUBJECT`, and the reversed email's own subject); do not change them. The plain-text part carries the same facts in the same words (names, validity line, the full undo link in email 2, no link anywhere else), with `\n` between blocks; "their", never a guessed pronoun.

## Measurements (workbook CSS, desktop first; phone = 375 px wide)
- Backdrop around the card: padding 20 px 14 px (phone 12 px 8 px). Card: white, radius 18 px, padding 22 22 16 (phone 16 14 12), max width **600 px**, fluid below that.
- Top row: logo left (image, displayed about 28 px high), tag right: 11 px, weight 700, letter-spacing .07em, green; 18 px below.
- Header row: text left, illustration right. Headline 32 px / 700 / line-height 1.1 (phone 25 px); the accent word in green. Subtitle 15 px (phone 13.5 px), 10 px above, muted. Illustration 150 × 118 px (phone 96 × 78), round.
- **Dark block**: radius 14, padding 16 18 (phone 12), margin-bottom 14, icon 44 px round (phone 34) then text; text 15 px (phone 13.5); small caps line 11 px / 700 / letter-spacing .07em in the light green; bold name 19 px / 700.
- **Pale block**: radius 14, padding 14 18 (phone 10 12), margin-bottom 14, icon + text; bold heading 17 px / 700 in green; text 14.5 px (phone 13).
- **Line**: icon 44 px (phone 34) + text 14.5 px (phone 13), margin-bottom 12.
- **Button**: full width, centred, radius 99 px, 17 px / 700 (phone 15 px), padding 16 px (phone 13 px), margin-bottom 16.
- **Link box**: 1 px border, radius 12, padding 9 12, 12.5 px, muted, 8 px above.
- **Footer**: top rule 1 px, 14 px above, 12 px padding-top, 13 px muted; `Team Unifolio` 16 px / 700, 10 px above.
Use tables and inline styles (600 px fluid; `border-radius` on cells is fine; no flexbox, no grid, no script). Fonts: `'DM Sans'` for headline, logo-text and bold names, `'Manrope'` for the rest, with the system sans stack after them (most inboxes ignore web fonts; that is expected).

## Colours: palette first (the palette PDF is the colour source)
| Role | Light | Dark | Source |
|---|---|---|---|
| Card | `#FFFFFF` | `#1A1A1A` | palette (elevated / dark surface) |
| Text | `#111111` | `#FCFCFC` | palette |
| Subtitle and body muted | `#4B4B4B` | `#A3A3A3` | palette (body text; dark secondary) |
| Footer muted | `#717171` | `#A3A3A3` | palette (secondary text) |
| Green accent, tag, links | `#15803D` | `#34D399` | palette (positive text; dark positive text) |
| Button | `#22C55E` bg, `#111111` text | same | palette (primary button, primary text) |
| Rules and line separators | `#ECECEC` | `#2E2E2E` | palette (divider; dark border) |
| Link box border | `#DFDFDF` | `#2E2E2E` | palette (input border; dark border) |
| Pale block background and icon discs | `#EAFBF0` | see below | palette (positive tint) |
| Outer backdrop | `#EEF6F0` | `#111111` | workbook drawing (light, no palette match); palette (dark base) |
| Dark block background | `#14301F` | `#14301F` | **workbook drawing only** (no palette dark green) |
| Dark block small caps | `#4ADE80` | `#4ADE80` | **workbook drawing only** |
| Pale block background, dark mode | `#17261C` | | **workbook drawing only** |
| Icon disc, dark mode | `#1F3B28` | | **workbook drawing only** |
| Illustration disc | `#EAFBF0` | `#F2FCF6` (a light disc behind the art so it stays visible) | workbook drawing |
The "workbook drawing only" colours are flagged so the owner sees them; do not change them.

## Layout function and dark mode
- Add `_branded_layout(...)` in `backend/app/services/auth/email_templates.py` (the four builders use it). Design its parameters yourself (tag, headline parts, subtitle, illustration name, a list of typed blocks, footer lines); keep it small and tested. **Do not touch `_email_header()`, `_email_footer()`, `otp_email_html`, `_notice_email_html` or `contact_changed_email`**: a test pins the sign-in email's header (`test_existing_signin_email_html_is_unchanged_by_default`); it must keep passing untouched.
- Dark mode by styles only: `<meta name="color-scheme" content="light dark">` and `<meta name="supported-color-schemes" content="light dark">`, plus one `<style>` block with `@media (prefers-color-scheme: dark)` overrides using `!important` on classes (the existing OTP email shows the pattern and why: Gmail's app). Inline styles carry the light values. Light and dark images (logo, illustration, icons) are two `<img>` per place toggled by classes (`.light-only` shown by default, hidden in dark; `.dark-only` the reverse). No script anywhere.
- `_branded_layout` takes an internal `scheme: Literal["auto", "light", "dark"] = "auto"`; `"dark"` renders the dark values as the base styles and `"light"` forces light, **only for the preview script**; the four builders always use `"auto"`.

## Images (task B-11, done by Claude; the files will exist in `frontend/public/email/` before you run the visual check)
Image URLs are `{settings.frontend_base_url.rstrip('/')}/email/<name>.png` (read `settings.frontend_base_url`; never put a token, a name, an email or an id in any image address). Names (each in `-light` and `-dark` variants, except the logo pair): `logo-light.png`, `logo-dark.png`; `ill-forward-light.png`, `ill-forward-dark.png`, `ill-back-light.png`, `ill-back-dark.png`; icons `ic-crown`, `ic-layers`, `ic-person`, `ic-people`, `ic-shield`, `ic-date`, `ic-warn`, `ic-link`, each `-light.png` and `-dark.png`. The illustrations and icons are **plain round shapes as the workbook draws them** (the owner's original pictures or a designer's art replace them later by overwriting the same files). Every `<img>` has `width`, `height`, `alt` and `style="display:block;border:0"`. Alt text: the logo `Unifolio`; illustrations `Illustration: change of Head of Family` (forward) and `Illustration: change reversed` (back); icons a plain word each (`Crown`, `Layers`, `Person`, `People`, `Shield`, `Date`, `Warning`, `Link`). The key facts are always real text, never only in an image.

## Preview script
`backend/scripts/preview_emails.py <output-folder>`: writes, for each of the four emails, four HTML files (light 600 px, dark 600 px, light 375 px, dark 375 px) using sample invented data (Aditi Shanbhag, Rohan Shanbhag, `https://ls-redesign.unifolio.in/undo-head-change#token=SAMPLEONLY`), each wrapped in a minimal page that sets the viewport width. It refuses an output folder inside the repository (never write into the repo) and prints the file list.

## Tests first (the HTML tests run in your sandbox: no TestClient is involved)
`backend/tests/services/auth/test_email_templates.py`: rewrite the existing builder tests for the new copy and add: `test_names_are_escaped_in_all_four` (hostile names `<script>alert(1)</script>` and `"><img src=x onerror=1>` appear escaped and never as markup in html; the plain text keeps them as typed); `test_undo_link_box_text_equals_the_real_link_and_the_token_stays_after_the_hash`; `test_undo_email_is_the_only_one_with_a_link_or_button` (emails 1, 3 and 4 contain no `<a href` except `mailto:support@unifolio.in` and no `https://` link other than image addresses); `test_changed_back_email_has_no_token_or_link`; `test_image_urls_have_no_token_or_personal_data` (every `src` equals `{base}/email/<known name>.png`; none contains a name, an email, `token` or `#`); `test_every_image_has_alt_text_and_size`; `test_dark_mode_block_has_no_script` and `test_color_scheme_meta_present`; `test_copy_uses_their_not_a_guessed_pronoun` (no `he`, `she`, `his`, `her` as words in any of the four, html or text; `their` present in email 3); `test_each_email_has_the_exact_headline_subtitle_and_footer_of_the_workbook` (the strings above, per email); `test_layout_is_tables_without_flex_or_grid` (no `display:flex`, `display:grid`); `test_phone_and_desktop_widths` (max width 600 and a fluid rule for narrow screens present); `test_shared_header_unchanged` (the pinned hash test keeps passing; do not edit it); `test_valid_until_line_uses_the_existing_ist_formatter`; `test_plain_text_part_carries_the_same_facts` (names, the validity line and the full link in email 2; no link in the others); `test_preview_script_writes_sixteen_files_and_refuses_a_repo_folder`.
Run each new test and see it fail for the stated reason **before** implementing.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/auth/test_email_templates.py -v
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/auth/test_head_change_flow.py tests/services/auth/test_head_change_swap.py tests/services/auth/test_head_change_undo.py -v
```
(If a head-change test asserts old email wording and now fails, list each in the report; do not edit those files; Claude decides.) The route tests (`tests/api/test_head_change_routes.py`) use TestClient: Claude runs them. No full suite.

## Files you may touch
`backend/app/services/auth/email_templates.py`, `backend/scripts/preview_emails.py` (new), `backend/tests/services/auth/test_email_templates.py`. Anything else: Deviations in the report.
## Do not touch
`frontend/**` (the images are Claude's); `head_change.py` and the routes; the OTP email and its pinned header test; subjects; any migration; `auth-tokens.css`.

## Constraints
Additive for callers (same builders, same signatures, same return shape: the old link and old tests of callers keep working). Names escaped; no token or personal data in any image address or log; the undo token stays after `#` in the URL as given; shared header untouched. No analytics, no tracking pixels. No real data (invented names only). Git is read-only for you.

## Open questions (flag, do not guess)
- Does `format_ist_datetime` produce the workbook's `10 November 2026, 5:07 PM IST` shape? If not, report the actual shape.
- Anything in the workbook copy that cannot be built in table HTML without a compromise (say what you did).
- Does any other module build these emails or their subjects (search `head_changed_for`, `head_change_undo_email`, `head_change_reversed_email`)?

## Report format
One fenced block `CODEX REPORT: b9-emails`: status; baseline HEAD; exact commands with counts; which tests were RED first and why; tests you could not run and why; `git status --short`; the file list `preview_emails.py` wrote (a real run into a folder outside the repo, for example under your scratch directory); Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-18-b9-emails-handoff.md (your task: B-9)
Work only in D:\unifolio-b-journey on branch batch/b-journey. Tests first. Git is read-only. Do not touch frontend/**.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
