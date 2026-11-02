# Handoff: sign-up, sign-in and onboarding redesign planning (2 Nov 2026), for the next Claude session

Written at the end of the planning session on this redesign, for the session that continues it on another Claude account. **Same owner, same repo, same branch: the work resumes exactly where it stopped, as if it had only been paused.** Read this file top to bottom, then open `Docs/orchestration/2026-11-02-auth-redesign-plan.html` (the plan itself, committed next to this file). Nothing in the app has been built. This is a planning artifact and a decision log.

---

## 0. Where we are, in one minute

- **The job:** redesign the **sign-up, sign-in and onboarding screens** of the web app, from the first auth screen up to the point the user lands on Home. The owner supplied two mockup PDFs. This is a **UI-only redesign**. The backend is not changed, with **one approved exception**: the onboarding "goals" (see section 5).
- **Branch:** `leapswitch-redesign` of `ayushkarnawat/MVP_V1_MF_only` (repo clone name on GitHub is `mvp_v1_mf_only`). The whole app was already redesigned on this branch; sign-up, sign-in and onboarding were the only screens left.
- **Output so far:** a long planning artifact (HTML), published as a private claude.ai artifact, version 7, and committed here as `Docs/orchestration/2026-11-02-auth-redesign-plan.html`. It has mockups of every PDF screen, flows, a file-by-file change list, the backend and database spec for the goals change, and **29 questions, all answered by the owner on 31 Oct**.
- **Status:** planning is complete for what the owner has decided. **The owner now wants to add more UI changes and more changes to this plan** (they said so when switching accounts). Those have not been given yet. Expect them as the first thing in the new session.
- **Nothing is built.** After the plan is final, the next step is one detailed implementation plan per phase. **Nothing is built until the owner says "go".**
- **Three small approvals are still pending** (section 9).

The owner's standing style, learned in this session: they decide quickly, give short answers ("A", "B", "correct", "yes"), and they stop you if you do more than they asked. See section 2.

---

## 1. Source material

### 1.1 The two PDFs (not in the repo)

The owner attached these to the old session. They are **not committed**. If you need an original image, ask the owner to attach them again. The plan HTML embeds each PDF mockup page as a collapsed reference image under each mockup, so the pictures are not lost.

| PDF | Slides | Contents |
|---|---|---|
| "Unifolio Webapp login redesign" | 8 | Title slide, then three screens, each followed by a "Copy" slide: login 1 (Welcome back), login 2 (verify mobile number, copy slide says NO CHANGE), login 3 (verify email address, NO CHANGE). Slide 3 is the annotated version of login 1 with three red numbered regions. |
| "Unifolio Webapp sign up redesign" | 21 | Title slide, then six screens, each followed by an annotated version (red numbered regions) and "Copy" slides: sign-up 1 (Let's get started), 2 (Enter the OTP), 3 (Create your account), 4 (investor profile), 5 (What would you like to connect first?), 6 (All set). |

Every mockup in the PDFs is a bitmap (1536 by 1024). The "Copy" slides give the **new wording** to replace text in the mockup. The red numbered regions mark which text blocks get which copy. The plan's mockups apply that new copy.

### 1.2 The repo

Branch `leapswitch-redesign`, checked at commit `f0e3dfc` on 2 Nov 2026. Auth and onboarding files were **unchanged** between the earlier check (`16ad6ef`) and `f0e3dfc`. See section 7 for the verified code map.

---

## 2. Owner rules and working style (read this twice)

These came directly from the owner during the session.

1. **UI only.** Do not change anything on the backend, except the approved goals change.
2. **Redesign only the screens that are in the PDFs.** Quote: "do not invent any screens, we will just redesign the screens that are in the pdf." For the statement upload screens, **use today's screens as they are** (they are shown as real screenshots in the plan).
3. **Do exactly what is asked, nothing more.** Twice the owner interrupted work that went beyond the request:
   - They gave a three-part list (text alignment, a "Chosen option" badge, a screen-order change). The session started on all three. The owner stopped it: "stop dont do the second change i have given you (screen ordering). if you have changed anything in the artifact for this, undo it. do only the first one, text alignment." Everything for the screen order was undone. The badge was done later when they asked for it by itself. See section 10 for the screen-order request, which may come back.
   - When changing one screen, do not also change a similar screen unless asked (login 1 alignment was applied to login 1 only; sign-up 1 was offered, not changed).
4. **When asked to mark answered questions, change only the badges.** The question cards keep their options, text and recommendation as they were. Only add the "Answered" badge and the "Chosen option" badge.
5. **The artifact's writing style:** plain, short sentences. No em-dashes, no "not X but Y" constructions, no scare quotes around invented labels. Say what a thing does. Recommend, do not survey.
6. **Mockups use the PDFs' own sketches and style** (cropped from the PDFs) and the app's design tokens. The page itself uses the **same layout and design as the earlier "Unifolio Web Redesign Plan" artifact** (left section index, mockup, what changes, how we build it, backend readiness, open questions). The owner asked for that explicitly.
7. **Amber tags on a mockup** mean "I propose departing from the PDF here" and point to a question. They are removed once the question is answered.
8. Commit rules for this repo: docs commits use the prefix `docs:`. Never push to `main` or `feat/leapswitch-staging`. See `CLAUDE.md` and `AGENTS.md` (read them first, as the repo asks).

---

## 3. What was done in the old session, in order

1. Read both PDFs fully (all 29 slides). Told the owner the key observations and mockup inconsistencies (section 6.4).
2. Found the earlier artifact "Unifolio Web Redesign Plan" (same layout to reuse) and "Unifolio Auth Flow Redesign Map". Found the real repo (`MVP_V1_MF_only`) and cloned `leapswitch-redesign`.
3. Read the real code: auth screens, onboarding, import flow, App.tsx, shell routes, backend auth API, the user model, migrations, PRD-02 and PRD-05, DEFERRED_FEATURES.
4. Ran the frontend locally with the API stubbed and captured **real screenshots of today's flow** (sign-up, login, onboarding, import). These are embedded in the plan.
5. Cropped the sketches out of the PDFs (eight illustrations plus the logo) for the mockups.
6. Built the plan artifact and published it (version 1 on 30 Oct).
7. The owner answered 15 questions on 31 Oct. The plan was updated, the copy changes were applied, and a detailed backend and database section for the new goals was added (version 2).
8. Small layout fixes on login 1: moved the headline and paragraph down so they line up with "Welcome back" and the sketch, then moved the two numbered pins down (versions 3 and 4).
9. The owner said: use today's screens for the upload screens, do not invent screens. The drawn import mockups were replaced by real screenshots (version 5).
10. "Chosen option" badges were added to every answered card (version 6).
11. The owner answered the last 13 questions. All 29 are answered (version 7).
12. A standalone `.html` was produced and given to the owner. It is the file committed with this handoff.

---

## 4. The plan artifact (what it contains and how it is built)

### 4.1 Where it lives

- **Committed file (source of truth):** `Docs/orchestration/2026-11-02-auth-redesign-plan.html`. Self-contained: images are embedded as data URIs and the diagram library (mermaid 11.4.1) is embedded. Opens offline in any browser. About 4 MB.
- **Published artifact:** `https://claude.ai/artifact/2YTWqyuReWgaghLyjXNQYD`, version 7 (id `1793437679-40e5`). It is **private to the old account**. The new account probably cannot open or update it. **Treat the committed HTML as the source of truth.** To publish from the new account, publish a new artifact from an edited copy (see 4.4), or have the owner share edit access.

### 4.2 Section map of the plan (ids you can search for)

Start here: `summary` (short version, six findings, mistakes in the PDFs and how they were settled), `connect` (how the new screens connect to the rest of the app), `flows` (before and after diagrams, what each screen calls, where Back goes, today's real screenshots).
Login: `l1` Welcome back, `l2` Verify mobile number, `l3` Verify email address.
Sign-up: `s1` Let's get started, `s2` Verify your number, `s3` Create your account (plus the derived "3b" verify-email screen), `s4` investor profile, `s5` What would you like to connect first? (plus today's import screens as screenshots), `s6` All set.
Then: `goals` (New goals: backend and database), `mobile`, `system` (design system), `gaps` (screens without a mockup, with error-state drawings), `state` (state, resume and data), `code` (file-by-file changes and tests, plus Q27), `phasing` (build phases, Q28), `decisions` (all decisions at a glance, what only the owner can provide, next step).

Each screen section has: a coded mockup (with the PDF reference image collapsed under it), a pin legend, a copy table (Today vs New), "What changes from today", "How we build it" (Frontend and Backend cards), "Backend readiness" (status tags), and the question cards for that screen.

### 4.3 Conventions inside the HTML

- **Layout, tokens and classes come from the earlier Web Redesign Plan artifact:** `.wrap`, `.layout`, `.toc`, `section.page`, `.sec-head`, `.card`, `.two`, `.callout` (`.warn`, `.info`), `.tbl`, `.st` status tags (`ready`, `partial`, `missing`, `scope`, `new`), `.q` question cards with `.opts`, `.opt` (`.pick` = recommended, `.is-chosen` = chosen), `.rec`, `.mockwrap`, `.mock-scroll`, `.diagram` (mermaid blocks are `<pre class="mermaid">`).
- **Auth mockup components** are namespaced `.sx-*` with a fixed light palette (the PDFs are light only): `.sx` (screen root), `.sx-card`, `.sx-l` (left panel), `.sx-r` (right panel), `.sx-h`, `.sx-p`, `.sx-feat`, `.sx-in`, `.sx-btn`, `.sx-otp`, `.sx-opt`, `.sx-chip`, `.sx-flag` (amber departure tag), `.pin` (numbered black circle that matches the PDF's red regions).
- **Badges:** `<span class="ans">Answered</span>` in a question card header and in the decisions table; `<span class="chosen">Chosen option</span>` inside the chosen option's `<h5>`.
- **Question numbering:** Q1 to Q28 in reading order, plus **Q13b** (goal limit), which sits in the `goals` section. The numbers were renumbered once during the session; the plan text and the numbers below are consistent.
- **Images:** sketches (`img/`), PDF reference images (`ref/`), and today's screenshots (`before/`), all webp.

### 4.4 How to edit the HTML

The committed file is large because of embedded images and the diagram library. Use this helper to split it into an editable copy and rebuild it (tested: split then build gives a byte-identical file). Save it as `plan_tool.py`.

```python
#!/usr/bin/env python3
"""Split the standalone plan into an editable copy, and rebuild it.

  python3 plan_tool.py split   plan.html work/     -> work/index.html (small, editable) + work/assets/*.webp + work/mermaid.js
  python3 plan_tool.py build   work/ plan.html     -> standalone file again (images and mermaid inlined)

Edit work/index.html with any editor. Images are referenced as assets/<hash>.webp. To add an image,
put the file in work/assets/ and reference it as assets/<name>.webp.
"""
import base64, hashlib, os, re, sys

INIT_MARK = "<script>\n(function(){\n  var dark"

def split(src, out):
    s = open(src, encoding="utf8").read()
    os.makedirs(os.path.join(out, "assets"), exist_ok=True)
    i = s.index(INIT_MARK)
    a = s.rindex("<script>", 0, i)
    lib = s[a + len("<script>"): i - len("</script>\n")]
    open(os.path.join(out, "mermaid.js"), "w", encoding="utf8").write(lib.replace("<\\/script", "</script"))
    s = s[:a] + "<!--MERMAID_LIB-->\n" + s[i:]
    def img(m):
        data = base64.b64decode(m.group(1))
        name = hashlib.sha1(data).hexdigest()[:10] + ".webp"
        open(os.path.join(out, "assets", name), "wb").write(data)
        return f'src="assets/{name}"'
    s = re.sub(r'src="data:image/webp;base64,([A-Za-z0-9+/=]+)"', img, s)
    open(os.path.join(out, "index.html"), "w", encoding="utf8").write(s)
    print("split ok")

def build(work, dest):
    s = open(os.path.join(work, "index.html"), encoding="utf8").read()
    lib = open(os.path.join(work, "mermaid.js"), encoding="utf8").read().replace("</script", "<\\/script")
    s = s.replace("<!--MERMAID_LIB-->\n", "<script>" + lib + "</script>\n")
    def img(m):
        b = base64.b64encode(open(os.path.join(work, m.group(1)), "rb").read()).decode()
        return f'src="data:image/webp;base64,{b}"'
    s = re.sub(r'src="(assets/[^"]+\.webp)"', img, s)
    open(dest, "w", encoding="utf8").write(s)
    print("build ok")

if __name__ == "__main__":
    (split if sys.argv[1] == "split" else build)(sys.argv[2], sys.argv[3])
```

Notes for editing:
- The **original generator scripts are gone** (they held discarded edits and were set aside). From version 4 on, every change was made **directly in the HTML**. Do the same: edit `work/index.html`, using exact-string replacements with an assertion that the string occurs once.
- Mermaid diagrams are `<pre class="mermaid">` blocks. Validate any new diagram by loading the page with the mermaid library and calling `mermaid.parse` on each block.
- Check a mockup visually after editing: render the file in Chromium (Playwright is preinstalled) and screenshot the section.
- The standalone file needs `loading="lazy"` removed from images (the committed file already has it removed). If you re-publish the light version as a claude.ai artifact, keep lazy loading and publish the images through the `files` map.
- When publishing as a claude.ai artifact, the platform adds the document skeleton and the diagram runtime. The artifact source is the body of the HTML (it starts at `<title>`), without `<!doctype>`, `<html>`, `<head>`, `<body>` and without the embedded mermaid script.

---

## 5. The goals change (the one approved backend and database exception)

The PDF's investor-profile screen asks "What are you working towards?" with **six life goals**. The database only accepts four product goals. The owner decided (Q13): **replace the goal enum with the six**. The staging database is cleared before this ships, so no user data is converted. The full spec is in the plan's `goals` section. Summary:

**The six goals (codes are the session's proposal, still to be confirmed by the owner):**

| Code | Label |
|---|---|
| `wealth_creation` | Build my wealth |
| `retirement` | Plan for retirement |
| `childrens_education` | Fund my children's education |
| `buy_home` | Buy a home |
| `financial_freedom` | Achieve financial freedom |
| `tax_planning` | Plan my taxes |

They replace `consolidated_view`, `understand_holdings`, `family_management`, `performance_comparison`. No old value maps onto a new one.

**Limit (Q13b, answered A):** up to 3 goals, no "All of it" shortcut. The PDF's "(Select up to 3)" hint stays beside the heading.

**What exists today (verified in the repo):**
- `users.primary_goals`: JSONB on Postgres, JSON on SQLite (migration 0019). Postgres CHECK `ck_users_primary_goals_allowed`: array of 1 to 4 items, all contained in the four old values.
- `users.primary_goal` (legacy, singular): a **native Postgres enum type `primarygoal`** with the four old values (migration 0001). Deprecated on 30 Sep. The old note says "migration 0021 drops it", but 0021 became `member_contact_fields`, so it was never dropped. The schema doc also reserved 0024 for the drop; 0024 is taken.
- `app/models/enums.py` `PrimaryGoal`; `app/models/user.py` (both columns); `app/services/auth/schemas.py` `UpdateMeBody` (list field, a legacy single `primary_goal` field folded in by `_fold_legacy_goal`, `_dedupe_goals` bounds 1 to 4 with message "Pick between 1 and 4 goals."); `app/api/auth.py` `update_me` (writes the list and dual-writes `primary_goal`); `scripts/report_onboarding_goals.py` (uses the enum, an `all_four` figure).
- Frontend: `features/auth/types.ts`, `Q3Purpose.tsx` (the **mobile** onboarding goals screen; four options, "All of it" shortcut), `OnboardingFlow.tsx`, and Profile: `profile-v2/lib/onboardingOptions.ts` (`GOAL_OPTIONS`), `goalChips.ts` (collapses a full set to "All of it"), `components/GoalsDialog.tsx` (an "All of it" button), `pages/PersonalInfoPage.tsx`, `fixtures/me.ts`, plus about 13 frontend test files.

**What the change is:**
- **One Alembic migration** (number below), in this order: set `primary_goals` to NULL (no old value maps to a new one; a no-op on cleared staging), then on Postgres swap the CHECK to the six codes and 1 to 3 items, then drop the `primary_goal` column and (Postgres) `DROP TYPE IF EXISTS primarygoal`. The downgrade recreates the type, the column and the old CHECK, and clears goals first. The old column is dropped, not altered, because Postgres cannot remove values from an enum.
- **Backend files:** `models/enums.py` (six members), `models/user.py` (delete `primary_goal`), `services/auth/schemas.py` (delete the legacy field and the fold validator; bounds 1 to 3; message "Pick between 1 and 3 goals."; a `MAX_GOALS = 3` constant), `api/auth.py` (delete the dual write; drop the `PrimaryGoal` import if unused), `scripts/report_onboarding_goals.py` (replace `all_four` with a "picked the maximum" count).
- **Frontend files:** the types, `onboardingOptions.ts` (six options, old subtitles dropped), `goalChips.ts` (remove the "All of it" branch), `GoalsDialog.tsx` (limit 3, remove the "All of it" button, add "Select up to 3"), `Q3Purpose.tsx` mobile screen (six options, limit 3, no shortcut, Skip stays, needs six small drawings), the new desktop profile screen, fixtures, tests.
- **The mobile goals screen must change in the same release.** If it kept sending the four old values, mobile users would be rejected by the backend at that step.
- **Tests:** rewrite the goal cases in `backend/tests/api/test_auth_routes.py` (about lines 689 to 730), delete `test_patch_me_accepts_legacy_single_primary_goal`, update the head assertion in `backend/tests/test_migrations.py`, add a migration round trip, rewrite the Postgres CHECK test in `backend/tests/functional_postgres/test_member_detection_postgres.py` and add one that the type `primarygoal` is gone, update `backend/tests/scripts/test_report_onboarding_goals.py`.
- **Docs:** `Docs/PRDs/Database-Schema-Unifolio.md` (rows for both columns and the version row), `Docs/PRDs/PRD-02-Signup-Onboarding.md` (FR-5), `backend.md`, `database.md`, `decisions.md`, `log.md`, `DEFERRED_FEATURES.md` (Profile financial details), the Profile planning docs and `unifolio-backend-map.html`, `CLAUDE.md` pointer, and a new staging deploy guide.
- **Release sequence:** merge backend and frontend (mobile goals screen included) in one release; on the staging VM run `sudo ./scripts/clean-db.sh`; deploy builds the backend first; run `docker compose run --rm backend alembic upgrade head` (deploy README step 5); start the backend, then the front end goes live; verify (new codes saved, old codes and four goals and an empty list return 422, a direct bad insert is refused by the CHECK, `\d users` shows no `primary_goal`, `\dT` shows no `primarygoal`, desktop screen, mobile step and Profile all save and show the same chips, the report script runs).
- **Migration number.** The parallel change-requests plan (`Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`) uses 0047 to 0050. **As of 2 Nov the branch has 0047, 0048 and 0049 landed**; 0050 (Head of Family) is Run 5, not yet done. The goals migration takes **the next free number after those, 0051 expected. Run `alembic heads` first and stop if the number is taken.**
- **Risks recorded:** number collision (above); an old backend instance still running after the column drop (LeapSwitch is one VM with docker compose, so stop, migrate, start); an old cached frontend sends old codes and gets 422 (hard refresh); the mobile screen forgotten; SQLite tests do not enforce the CHECK (the API enum is the guard; the Postgres functional test covers the CHECK); stray old values in a database that was not wiped (migration clears them; `goalChips` already shows unknown codes as a humanised label).

---

## 6. The design, as decided

### 6.1 The shared look

- One split card on desktop: left panel (mint wash, a sketch, headline, paragraph, feature rows) and right panel (form). Logo top-left. A step bar ("Step N of 5") on sign-up.
- Primary button: full-width green pill with an arrow. Headlines have green accent words.
- **Tokens (Q22, A):** use the app's tokens, not the PDF's exact values. The PDF's green measures `#00B75B`; the app's brand green is `#22C55E`. Fonts: the app's DM Sans (display) and Manrope (body). Add only the PDF's mint tints as auth-only tokens (left panel about `#E4FAEC` fading to `#F6FEF9`).
- **Light only (Q21, A):** the PDFs and sketches are light only. Auth and onboarding screens are forced light.
- **Sketches (Q23, B):** ship the sketches as the crops taken from the PDFs (about 400 px wide, soft on retina). Replacing them with the originals is an optional follow-up.
- **Desktop only (Q20, A):** the mobile app keeps today's look. A small prop on the two shared components separates the looks (Q27, A, section 8).

### 6.2 Screen order and per-screen content (the plan's current state)

**Login (the page opens on sign-up; login is reached by the "Log in" link):**

1. **Welcome back** (`l1`). Left: no pill. Headline "One dashboard for your family's financial life" (green accent on "financial life" is the session's guess). Paragraph "Pick up where you left off." Three rows: All your investments (Mutual funds, stocks, PMS, real estate, gold and more.), Insights that matter (Understand performance, uncover overlap and spot potential risks.), Your family's wealth, together (See your family's investments in one place.). Right: Back (goes to sign-up screen 1), "Welcome back", "Log in to continue to your Unifolio account.", an **Email | Mobile number** tab control (**Email is the default**), the field, **Get OTP**, OR, "New to Unifolio? Sign up". **No Google button** (hidden behind one setting, code kept).
2. **Verify your mobile number** (`l2`, copy unchanged). Phone sketch, "Welcome back.", masked number, Edit number; right: six boxes, resend countdown starting at 60 seconds, **Verify and log in**, OR, **Get code via call shown with no function**.
3. **Verify your email address** (`l3`, copy unchanged). Envelope sketch, same layout, masked email (first 2 letters of the name and the full domain, e.g. `si••••••@gmail.com`).
After login: Home (onboarding first if it was not finished, as today).

**Sign-up:**

1. **Let's get started** (`s1`). Same left headline/paragraph pattern: headline "One dashboard for your family's financial life" (pill removed); paragraph "Bring your family's investments together, uncover deeper insights, and make more informed financial decisions."; the same three rows. Right: "Step 1 of 5", "Let's get started", "Enter your mobile number to create your Unifolio account.", a fixed **+91** field (no chevron), Get OTP, "By continuing, you agree to our Terms & Conditions and Privacy Policy." (the **only** place this line appears, Q11), "Already have an account? Log in". No Back (it is the default screen).
2. **Verify your number** (`s2`). Phone sketch, "Quick and secure.", "We've sent a 6-digit verification code to +91 98765 43210", Edit number. Right: "Step 2 of 5", heading **Verify your number**, "Enter the 6-digit code we sent to your mobile number.", **six** boxes (the PDF draws five; the copy says 6-digit), countdown, Verify & Continue, OR, Get code via call (shown, no function). Back goes to screen 1.
3. **Create your account** (`s3`). ID-card sketch. Left headline "Let's start with the basics." and an info card "Why do we need your PAN name? It helps us correctly match your investments across your accounts and avoid duplicates." Right: "Step 3 of 5", "Create your account", "Tell us a few basic details to get started.", **Full name (as per PAN card)** (placeholder "e.g. Siddharth Surve", hint "Enter your name exactly as it appears on your PAN card."), **Email address** (the "(optional)" is removed: the email is compulsory and verified, Q9), Continue, shield and "Your data is encrypted and protected." (the Terms line was moved to screen 1).
   - **3b, Verify your email address** is **not in the PDFs**. The backend will not create the account until the email code is verified, so this screen is needed. It is drawn from login screen 3 with words written by the session. It is flagged "Derived: needs your review". See section 9.
4. **How do you usually invest? and What are you working towards?** (`s4`). Person sketch. Left: headline "Help us personalise your experience."; paragraph "Tell us a little about how you invest and what you're working towards, so we can make your insights more relevant."; rows More relevant insights (Explore insights that relate to your investments and goals.), A tailored experience (Get a more relevant experience based on your preferences.), You're always in control (Update your preferences anytime in settings.). Right: "Step 4 of 5"; **How do you usually invest?** "This helps us tailor your experience and insights." with four options mapped to the existing investor types: I'm just getting started (`beginner`), I manage my own investments (`self_directed`), I work with a financial professional (`advisor_assisted`), A mix of both (`mixed`). Then **What are you working towards? (Select up to 3)** with the six goals. Continue. **Nothing is pre-selected** and there is a quiet **Skip for now** link (Q12, A). Replaces today's two separate screens (investing and purpose).
5. **What would you like to connect first?** (`s5`). Cards sketch. Left: headline "Bring your investments together." with "Connect your accounts to see your family's investments in one place and understand how they fit together."; rows Secure & Private (Secure connections designed to give you visibility into your investments.), Takes just a few minutes (Connect multiple accounts in one go.), All major asset types (Mutual funds, stocks, PMS, real estate, gold and more.). Right: "Step 5 of 5", "What would you like to connect first?", "You can always add more accounts later.", **Mutual funds** (active; "Import your holdings via CAMS or MF Central", wording kept as in the PDF, Q15 B), then **Stocks & ETFs, PMS & AIFs, Real estate, Gold, Bank accounts, loans & credit cards** all marked **Coming soon** (Q14, A). Continue. **No skip: onboarding cannot finish without an import** (Q16, B).
   - After Continue the user sees **today's import screens, exactly as they are** (Q17, A): how to bring in a statement (Request from CAMS or Already have a statement), the CAMS request screen, the upload screen, the waiting screen, parsing, errors and about a dozen prompts. Real screenshots of three of them are in the plan. **No import screen is redesigned and none was invented.**
6. **All set** (`s6`). Wallet sketch. Left: "You're all set!" with "We're importing your investment data and getting your dashboard ready. This may take a few minutes."; three status rows (Accounts connected / Importing your investment data / Preparing your dashboard, each with its one-line description). Right: the step label reads **Done** with all five bars full (Q7, A); a tick, "Getting your accounts ready"; "Accounts being imported" lists **only real rows** (Mutual Funds, imported via CAS statement, ticked); **View details** opens **Profile, Import History** (`/profile/settings/import-history`) (Q19); the tip "While we fetch your data..."; a **Go to my dashboard** button that opens **Home** (Q18, A). No timed redirect.

### 6.3 Back rules (as written in the plan)

Sign-up 1: none. 2: screen 1 (number kept). 3: screen 1 (the phone code is used up; the pending token lasts 10 minutes). 3b: screen 3. 4: screen 3 with **name and email both read-only** (Q10, B). 5: screen 4 with answers filled. Today's import screens keep their own links ("Back to import options"); there is no Back to screen 5. 6: none. Login 1: sign-up screen 1 (Q2). Login 2 and 3: login 1 with the typed value kept.

### 6.4 Inconsistencies found in the PDFs and how they were settled

Step counter (six screens, "of 5"; two screens say "4 of 5"): settled as five steps, All set = Done (Q7). Sign-up OTP draws five boxes but says 6-digit: build six. "Get code via call" appears on the email code screen: shown, no function (Q4). Login email is masked by hiding the domain: settled as hide part of the name, show the domain (Q6). Login screen 1 has a Back link but nothing before it: Back goes to sign-up (Q2). Mockup 5 shows Stocks and PMS as live: marked Coming soon (Q14).

---

## 7. Verified repo facts (code map)

All checked against the branch. Auth and onboarding code is unchanged between `16ad6ef` and `f0e3dfc`.

**Entry (`frontend/src/App.tsx`):** loading spinner, then pending-deletion screen, then viewport check (under 768 px or a `/mobile` path = mobile). Mobile: a landing page, then `MobileInitialFlow` (the same `AuthEntryFlow` and `OnboardingFlow` with a mobile background). Desktop: no session = `AuthEntryFlow` (default mode **signup**); session but `onboarding_completed` false = `OnboardingFlow`; else `ReconsentGate` then `ShellRoot` (`/` redirects to `/home`). `main.tsx` serves the public `/legal/*` pages and `/print/analytics`.

**Auth (`frontend/src/features/auth/`):** `AuthEntryFlow.tsx` (647 lines; every API call and branch; steps landing, email, phone, otp, email_otp, link_account), `AuthShell.tsx` (the split card on desktop, a single column below 1024 px, plus a roadmap strip), `AuthShowcasePanel.tsx` (today's left sketch), `Landing.tsx` (signup mode: phone + Get OTP + consent line; login mode: Google, Email, Phone buttons), `PhoneEntry.tsx`, `EmailEntry.tsx`, `OtpVerify.tsx` (six-cell `OtpInput`, "Local Dev OTP" banner in stub mode), `OnboardingFlow.tsx` (+ `onboardingSteps.ts`, `onboardingHistory.ts`, `resumeStep`), `Q1Name.tsx`, `Q2Investing.tsx`, `Q3Purpose.tsx`, `OnboardingCardStack.tsx` (the small centred card on desktop), `SoloCasUpload.tsx` (finds or creates the "self" household member, renders `ImportFlow`, then sets `onboarding_completed`), `AuthContext.tsx` (`login`, `updateMe`, `me`), `api.ts`, `validation.ts` (`validateIndianPhone`, `validateEmail`, `validatePersonName`, `formatPhoneForDisplay`). Onboarding step values: landing, phone, otp, q1_name, q2_investing, q3_purpose, cas_upload, done (the legacy `trust_primer` is also handled).

**Today's order:** sign-up: phone (Landing) → phone code → **email entry ("One more step", required)** → email code → account and session created → name ("What should we call you?", saves the self member) → investing (skippable) → purpose (multi-select, skippable) → statement upload (request from CAMS, or upload; **no skip**) → Home. Login: Landing (Google, Email, Phone) → email or phone entry → code → Home.

**Backend (`backend/app/api/auth.py`):** `POST /auth/otp/request` (phone; `flow` signup or login; the Terms and Privacy versions travel with this request and the consent is recorded at the Get OTP click; 409 if a signup number exists; 404 if a login number is unknown; 429 "Please wait Ns" within 60 seconds), `POST /auth/otp/verify` (a phone-first signup returns `email_required` with a pending token, **the account is not created until the email code is verified**), `POST /auth/email-otp/request` and `/verify`, `POST /auth/oauth/google`, `GET` and `PATCH /auth/me`, `POST /household-members`. `RESEND_THROTTLE_SECONDS = 60` in `services/auth/otp.py`. `otp_delivery_mode` defaults to `stub` (the code is returned and shown on screen). Email codes go out through Amazon SES.

**Shell:** `frontend/src/shell/` (react-router `BrowserRouter`, registry of routes). Home `/home`; Profile pages include `/profile/settings/import-history` (the Import History page), `/profile/import-health`, `/profile/connected-accounts` (currently a **coming-soon** page).

**Import:** `features/import/` (`ImportFlow`, `TwoPathImportContainer`, `ImportPathChoice`, `RequestCamsPath`, `WaitingForCasView`, `UploadForm`, prompts). The same component powers the in-app `/import` "Add data" page. Onboarding passes `surface="onboarding_upload"` so the PAN disclaimer is recorded against the right screen. MF Central is **not built** (needs an AMFI ARN partnership, see `DEFERRED_FEATURES.md`). NSDL/CDSL demat parsing is not built. The Portfolio pages for stocks, debt, gold, real estate, others are placeholders.

**Profile consumers of onboarding answers:** `profile-v2/lib/onboardingOptions.ts` (`GOAL_OPTIONS`, `INVESTOR_OPTIONS`), `goalChips.ts`, `GoalsDialog.tsx`, `InvestorTypeDialog.tsx`, `PersonalInfoPage.tsx`. Wording changes on the sign-up screens must match these or a user sees different labels in Profile.

**Deploy:** LeapSwitch staging is one VM with docker compose. `deploy/leapswitch/scripts/` has `deploy.sh`, `clean-db.sh` (wipes user-domain data), and the README says migrations run with `docker compose run --rm backend alembic upgrade head`.

### 7.1 Overlap with the parallel change-requests plan (important)

A second track runs on the same branch: `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md` (13 change requests, Runs 1 to 7, commits prefixed `cr-r<N>:`, driven by an orchestrator with Codex and Gemini workers; its latest handoff is `Docs/orchestration/2026-11-01-orchestrator-handoff-change-requests.md`). It overlaps with this redesign in three places. **Coordinate; do not collide.**
- **Run 6, Task 6.1** creates `components/OtpStubBanner.tsx` and modifies `features/auth/OtpVerify.tsx` (a shared "Test mode: no SMS is sent yet. Your phone code is ..." strip). The redesign's `OtpPanel` is planned over `OtpVerify` and must keep a stub-code banner. Use `OtpStubBanner` if Run 6 has landed.
- **Run 6, Task 6.2** modifies `features/auth/api.ts`, `features/auth/types.ts` and `features/legal/ReconsentGate.tsx` (Head of Family change). **Run 5** adds migration 0050 and changes sessions and identities (a Google identity cannot sign in after a head swap).
- **Run 7, Task 7.2** introduces a green token (`bg-[var(--pos)]`) for buttons and notes that about 257 hard-coded copies of `#22C55E` (mostly sign-in and import screens) are left as a backlog. The auth redesign (Q22, A) uses the app's tokens, so it should adopt that token rather than hard-code a green.
- Migration numbers: see section 5.

---

## 8. Build approach and phases (decided)

- **Q27, A:** build the new components **beside the old ones**, switched by a small `variant` prop set in `App.tsx` from the existing `isMobile` check. `"split"` (desktop) renders the new screens; `"legacy"` (mobile) renders today's. One shared state machine, so fixes help both. The old desktop-only pieces (`AuthShowcasePanel`, the roadmap strip, `OnboardingCardStack`) become dead code on desktop and are removed in a later cleanup, not in this change. The `variant` flip in `App.tsx` is also the rollback.
- **Q28, A:** order: foundations, login, sign-up front, sign-up back. Phase 1 ends with every screen reachable from a dev-only index page so the owner can look at all of them before any flow is wired.
- **Phases:** 0 Decisions (done), 1 Foundations (`auth-tokens.css`, `AuthSplitCard`, `AuthLeftPanel`, `StepProgress`, `AuthField`, `OtpPanel`, `maskPhone`, `maskEmail`, `useResendCountdown`, sketches, `variant` prop), 1b Goals change (backend and frontend, can ship before the new screens), 2 Login, 3 Sign-up front (screens 1 to 3 and the email check, pending-name store), 4 Sign-up back (4, 5, 6), 5 States, tests, tablet, accessibility, 6 Staging QA and rollout. The plan has the table.
- **Tablet (768 to 1023 px):** the new right panel stacks over the sketch (part of Q20, A).
- **Resume (Q26, A):** the saved `onboarding_step` is free text, so no migration. Map the old values to the new screens: `q1_name` and a missing name go to screen 3; `q2_investing` and `q3_purpose` both go to screen 4 with answers filled; `cas_upload` goes to screen 5.
- **New browser storage:** one `sessionStorage` key `unifolio.pendingSignup` (name and phone) holds the typed name from screen 3 until the session exists after the email check (because in the plan's current order the name is typed before the account exists). It is cleared after the self member is saved, or if the signed-in phone does not match.
- **Error states (Q25, A):** one shared alert style (red box with an optional green shortcut button, today's pattern redrawn). Three examples are drawn in `gaps`.
- **Screens without a mockup (Q24, A):** link-account, the Google consent and phone steps, the re-consent gate, the pending-deletion screen and the maintenance banner are left as they are.

---

## 9. Pending items

**Three small approvals the owner still owes (listed in the plan's "What only you can provide"):**
1. **Legal and security sign-off** on the wording "Your data is encrypted and protected", which stays on the name screen (Q11). PAN is stored encrypted (ADR-004); confirm what else is, before a blanket claim ships.
2. **Approval of the words written for the verify-email screen (3b).** This screen is **not in the PDFs**. The session offered to swap it for today's real email-code screen (consistent with "do not invent any screens"); **the owner has not answered that.** Ask.
3. **Confirm the six goal codes** (section 5).

**Offered but not done:** the login 1 alignment (headline and paragraph moved down to line up with "Welcome back" and the sketch) was applied to login 1 only. Sign-up 1 uses the same left panel and has the old spacing. The owner has not asked for it.

**Interpretations the owner confirmed:** Q19 means Profile, Import History (`/profile/settings/import-history`); Q23 B means ship the PDF crops.

**Interpretations of non-letter answers (shown with a "Chosen option" badge on the closest card; the owner has not objected):** Q2 chosen C ("Go to sign-up screen 1"); Q4 chosen B ("Draw it disabled with coming soon", although the owner said only "display it, no function"); Q11 chosen B; Q13 chosen B; Q19 card shows A (Profile, Import health) as the closest, but the real answer is Import History.

---

## 10. The screen-order request that was started and then cancelled (it may come back)

The owner's third request in one message (verbatim): *"the final order of the auth screens should be as it is today. for sign up, enter phone number, phone otp, enter emai, email otp and then the rest according to the pdf. for login, the email/phone page with email as default, then respective otp screen and then the home page. add a section that will give the flow and order of screens, if there isnt a section like this in the artifact. if there is a section already and it doesnt follow this, update it."*

Meaning: sign-up order = phone, phone code, **email entry**, **email code**, then the PDF's screens (name, investor profile, connect, all set). The PDF's "Create your account" screen has name and email together, so in that order it would become **name only**. The session started this and prepared a "Final screen order" section, then the owner stopped it (see section 2.3): *"stop dont do the second change i have given you (screen ordering)... do only the first one, text alignment."* **It was fully undone and is not in the committed plan.** The plan today shows: phone, phone code, **name and email together (screen 3)**, email code (3b), then the rest.

Why it matters: the owner later answered Q9 with "email compulsory, **just as today**", which fits today's order. Treat the screen order as **likely to return**. If it does:
- Sign-up becomes 8 screens: 1 phone, 2 phone code, 3 enter your email (today's "One more step", restyled; not in the PDF), 4 verify your email (not in the PDF), 5 create your account (**name only**, the email field removed), 6 investor profile, 7 connect, 8 all set. Step bar: the two email screens and the name screen all count as step 3 (Q7, A). Login stays: Email or Mobile number tab (Email default), the matching code screen, Home.
- It **removes the need for the pending-name storage** (the name is typed after the session exists, as today) and changes Back rules (screen 3 Back goes to screen 1; the name screen has no Back; Back from the profile shows the name read-only).
- It would need a **"Final screen order" section** in the plan, an updated flow diagram, call table and Back table, the renumbering of sections, and one new question (what the PDF's name-and-email screen shows now that the email is earlier; the session's draft recommendation was "name only, heading as drawn").
- It would add **two screens that are not in the PDFs** (email entry and email code), which conflicts with "do not invent any screens". The owner must decide whether those use today's real screens or a restyled version. **Ask before drawing them.**

Do not start any of this unless the owner asks.

---

## 11. The 29 decisions (final, 31 Oct), in the plan's numbering

"Chosen" is the option the badge shows. "Answer" is what the owner said. Where they differ, the Answer rules.

| Q | Question | Chosen | Answer (owner) |
|---|---|---|---|
| Q1 | Google button on login | A. Hide it, keep the code | A: hide behind a flag, keep the code |
| Q2 | Where Back goes on login 1 | C. Go to sign-up screen 1 | The app opens on sign-up, Back on login goes to sign-up, no Back on sign-up |
| Q3 | Default login tab | A. Email first | A |
| Q4 | "Get code via call" | B. Draw it disabled | Display it, no function for now |
| Q5 | Resend countdown | A. Starts at 01:00 | A |
| Q6 | Masking | A. Phone keep last 5; email keep first 2 letters and the full domain | A |
| Q7 | Step numbering | A. Five steps, All set is the finish | A |
| Q8 | Country drop-down | A. Fixed +91, no chevron | A |
| Q9 | Email optional? | A. Required and verified, UI only | A, email compulsory, just as today |
| Q10 | Back from screen 4 to 3 | B. Both read-only | B |
| Q11 | Lines under Continue on screen 3 | B. Keep the encryption line, drop the repeat consent line | "Move the second line to the screen 1" |
| Q12 | Pre-selection and Skip | A. Nothing pre-selected, Skip for now | A |
| Q13 | The six goals vs the database | B. One small backend change, then the six | "change the current enums to these. the database will be cleared while staging anyways" plus a request for the detailed backend and database flow (section 5) |
| Q13b | Goal limit and "All of it" | A. Up to 3, no All of it | A |
| Q14 | Which source rows are active | A. Mutual funds only, others Coming soon | A |
| Q15 | MF Central and "All major asset types" wording | B. Keep as drawn | "Keep as pdf mockups" |
| Q16 | Finish onboarding without an import | B. Keep it mandatory | B |
| Q17 | Redesign the import sub-screens | A. Keep as is, today's screens | Use today's screens; redesign only the PDF screens |
| Q18 | All set screen content | A. Real rows only, a button | A; Go to my dashboard opens Home |
| Q19 | Where "View details" goes | A (closest) | "accounts, import history": Profile, Import History. Owner confirmed |
| Q20 | Mobile and tablet | A. Desktop only now | A |
| Q21 | Dark mode | A. Force light | A |
| Q22 | PDF greens and fonts vs the app's | A. App tokens, add mint tints | A |
| Q23 | Sketch source files | B. Ship the PDF crops | B, owner confirmed |
| Q24 | Restyle of screens with no mockup | A. Leave as they are | A |
| Q25 | Error and loading states | A. Shared alert style | A |
| Q26 | Users mid-onboarding at release | A. Map old step values | A |
| Q27 | Build and rollout | A. New components, variant prop | A |
| Q28 | Build order | A. Foundations, login, sign-up front, sign-up back | A |

---

## 12. What to do first in the new session

1. Read `CLAUDE.md` and `AGENTS.md` (the repo requires it), then this file, then open the plan HTML. Skim `summary`, `flows`, the screen sections, `goals`, `decisions`.
2. **Do not change anything yet.** Tell the owner in a few lines what you understood (the job, that all 29 questions are answered, the three pending approvals) and ask for the **new UI changes and additions** they said they would give.
3. For each new item, **do exactly what is asked** (section 2). If it changes a screen, change that screen only. If it needs a new screen that is not in the PDFs, ask first.
4. Update the plan by editing a split copy (section 4.4), rebuild the standalone file, verify it (images load, the diagrams render, no sideways scroll), and commit it with a `docs:` message. Keep the committed file name stable or tell the owner the new name.
5. When the plan is final and the owner says "go", write one implementation plan per phase (see the repo's plan format under `Docs/superpowers/plans/`). Respect section 7.1: check where Runs 5 to 7 of the change-requests track stand before touching `OtpVerify.tsx`, `ReconsentGate.tsx`, `features/auth/api.ts`, `features/auth/types.ts` or the green token.
