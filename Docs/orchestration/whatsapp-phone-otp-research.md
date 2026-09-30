# WhatsApp Phone-OTP — Pre-Implementation Research

*2026-09-30. Research only, nothing implemented. Replaces the phone-OTP "stub" with real
delivery over WhatsApp, following the same pattern as the Postmark → SES email work.*

**Two ways to send WhatsApp OTPs, compared throughout this document:**

- **Option 1: Meta WhatsApp Cloud API, direct.** The backend calls Meta's API itself. No
  middleman.
- **Option 2: AWS End User Messaging Social.** An AWS service that sits in front of the same
  Meta API. The backend calls AWS (like it calls SES today), and AWS calls Meta.

Either way, the user gets the identical WhatsApp message from Meta. Indian BSPs
(MSG91/Gupshup/AiSensy/Interakt) are a third category, covered briefly in §3.3.

---

## Q1. Meta billing and requirements

### 1.1 How Meta bills

- **Per delivered template message** since 1 Jul 2025, priced by *category* and *recipient
  country*. OTPs use the **authentication** category, the cheapest business-initiated one.
- Authentication, India recipient: **≈ ₹0.115/msg (~$0.0014) + 18% GST ≈ ₹0.136**. It gets
  cheaper through volume tiers at high monthly volume.
- **Authentication-international** (OTP to a *non-India* number from an India-registered
  account, raised 1 Apr 2026): **≈ ₹1.75–2.50/msg (~$0.03), ~20× domestic.**
- Undelivered messages aren't charged. No monthly fee and no phone-number fee.
- India-registered businesses have been **billed in INR** since 1 Jan 2026.
- **Who you pay depends on the option.** With Option 1 you add a payment method (card) in
  Meta's WhatsApp Manager and Meta bills you directly. With Option 2 **AWS bills you for Meta's
  fee on your AWS invoice**, so there's no payment method in Meta at all.

### 1.2 General requirements (both options; AWS doesn't remove any of these)

1. **Meta Business Portfolio** (business.facebook.com), owned by one or more personal
   Facebook accounts.
   - **What it is:** the Meta account that represents *Unifolio the company*, as opposed to
     any one person. It was formerly called "Meta Business Manager" / "Business Manager".
     It's a private admin workspace, **not** a public Facebook page, and it's free.
   - **What it holds:**
     - *assets*: the WhatsApp Business Account(s), their phone numbers and message templates,
       plus any Facebook Pages, Instagram accounts or ad accounts, if we ever add them
     - *people and permissions*: who can administer what
     - the company's *business verification status*
     - the *WhatsApp messaging limit* (250 → 2,000 → …/24h)
   - **Who owns it:** it is created and administered by personal Facebook accounts (your own,
     plus ideally a second admin so you're never locked out). Those people's personal profiles
     are **never visible** to users receiving OTPs. Users only see the WhatsApp display name
     "Unifolio".
   - **How many:** one per company. All WhatsApp setup, whether Meta direct or through AWS,
     lives inside it, so it stays yours if we ever switch provider.
2. **WhatsApp Business Account (WABA)** inside that portfolio.
3. **A sender phone number** that can receive one SMS or voice-call verification and is **not
   active on the WhatsApp or WhatsApp Business app**. After registration it can't be used in
   the app. A fresh SIM or a landline both work; most VoIP/virtual numbers are rejected.
   - **What "not on WhatsApp" means exactly:** the number must not currently be registered on
     **either** WhatsApp app, meaning neither regular WhatsApp (Messenger) **nor** the WhatsApp
     Business app. It is not enough that it's merely "not on WhatsApp Business". A number
     that's on regular WhatsApp is also blocked.
   - **If the number is already on WhatsApp:** it becomes eligible once you **delete that
     WhatsApp account** in the app (Settings → Account → Delete my account). Just uninstalling
     the app isn't enough. Chats on that account are lost.
     - For a number on the *WhatsApp Business app*, Meta also offers "coexistence" (the same
       number on the Business app and the API at the same time). It has limitations, and
       availability varies by country, so it's not recommended for an OTP-only sender.
   - **After registration:** the number keeps working for normal calls and SMS. It just can
     no longer be used in any WhatsApp app, because the Cloud API "owns" it.
   - **Recommendation:** a brand-new SIM bought for this purpose, kept physically safe. It's
     needed again for re-verification or recovery. **Not** anyone's personal number.
4. **Display name** ("Unifolio"). Meta reviews it; it must match the brand/website.
5. **Two-step verification PIN** (6 digits) on the number.
6. **An approved authentication template**:
   - body text fixed by Meta: *"<code> is your verification code. For your security, do not
     share this code. This code expires in 5 minutes."*
   - a **Copy-code** button (one-tap and zero-tap only work in Android apps, not our web app)
   - no custom text, links or branding
   - approval is usually minutes to hours
7. **Business verification** (only needed to lift the messaging limit, see Q5/Q6):
   - legal name, address, phone, and a website (`unifolio.in` with a live privacy policy)
   - documents: Certificate of Incorporation / GST / Udyam-MSME, plus an address proof in the
     same legal name
   - sometimes a DNS TXT domain check in Route 53

### 1.3 What I need from you (both options)

1. Is Unifolio a registered company or LLP? Which documents from §1.2(7) can you upload?
2. The dedicated sender phone number (§1.2(3)).
3. A Facebook account (ideally two admins) to own the Meta Business Portfolio.
4. Display-name confirmation, and a live privacy-policy page on `unifolio.in`.
5. Decision: what happens for users who don't have WhatsApp (see "Other decisions" below).
6. **Option 1 only:** a card added to Meta's WhatsApp Manager payment settings.
   **Option 2 only:** AWS console access in `ap-south-1` to run the signup (you click through
   it, as with SES domain verification) and the usual Terraform apply.

---

## Q2. Do we actually need AWS or any other third-party provider?

**No.** Meta's WhatsApp Cloud API is public and free to call directly. A developer app on
developers.facebook.com plus a WABA is all you need. AWS or a BSP is a convenience layer, not
a requirement. It's our choice to make, not something Meta forces.

What AWS gives us that Meta direct doesn't:

- No API secret: the backend authenticates with the ECS task's IAM role, exactly like SES/S3
  today.
- One bill: Meta's fee appears on the AWS invoice.
- Delivery-status events go to an SNS topic, so we don't need a public webhook endpoint on
  our backend.
- Terraform-managed permissions, the same shape as the existing SES IAM statement.

---

## Q3. Third-party provider: pricing and requirements

### 3.1 AWS End User Messaging Social: pricing

| Fee | Amount (India authentication message) |
|---|---|
| Meta fee (passed through by AWS, same Meta rate card and volume tiers) | ≈ ₹0.115 + GST |
| AWS message fee | **$0.002 per outbound message** (≈ ₹0.17). The global rate is $0.005; India authentication/utility messages have the lower $0.002 rate |
| Inbound messages (users replying) | $0.001 each. Irrelevant for OTP |
| Monthly / setup fee | None |
| **All-in per OTP** | **≈ ₹0.30–0.32** (vs ≈ ₹0.136 on Meta direct) |

At MVP volumes the difference is tiny: 1,000 OTPs/month ≈ ₹300 on AWS vs ≈ ₹140 direct,
about ₹160/month more. At 100,000 OTPs/month the gap is about ₹16,000/month, so worth
revisiting at scale.

### 3.2 AWS: extra requirements on top of Q1's Meta ones

- The existing AWS account (already have it), with the service used in **ap-south-1 Mumbai**.
  Mumbai appears in AWS's billing region list for this service; I'll confirm it in the console
  at setup.
- The Meta Business Portfolio/WABA gets created *through* AWS's console, via Meta's embedded
  signup (a Meta login popup), and linked to AWS in the same flow.
- One IAM permission (`social-messaging:SendWhatsAppMessage`) on the backend task role,
  via Terraform.
- **No AWS sandbox or production-access request** (unlike SES). The only limits are Meta's.

### 3.3 Indian BSPs (MSG91 / Gupshup / AiSensy / Interakt), for completeness

- They charge Meta's fee plus a per-message markup, and some add a monthly plan fee.
- They need the same Meta requirements as Q1, plus an account with the vendor, a prepaid
  wallet, and an API key to store in Secrets Manager.
- Their one real advantage is built-in automatic **SMS fallback**, but SMS OTP in India needs
  **TRAI DLT registration** (entity + sender header + template, ~1–2 weeks).
- Not recommended unless we specifically want SMS fallback.

---

## Q4. Which is easier, cleaner and more efficient for us?

### Pros and cons

| | **Option 1: Meta direct** | **Option 2: AWS End User Messaging Social** |
|---|---|---|
| **Cost per OTP** | ✅ ≈ ₹0.136, cheapest | ❌ ≈ ₹0.30, about 2× (still tiny at MVP scale) |
| **Credentials** | ❌ Long-lived Meta System-User access token. Must go in Secrets Manager, be granted to the ECS task, and be rotated/protected. A leaked token lets anyone send from our number | ✅ None. The ECS IAM role is used, same as SES/S3 |
| **Fit with current code** | 🟡 New HTTP client code to `graph.facebook.com` (`httpx`/`requests`) | ✅ `boto3` (already pinned). `socialmessaging.send_whatsapp_message(...)` sits right next to how `SesEmailProvider` is written |
| **Terraform** | 🟡 New Secrets Manager secret, extend the `ReadAppSecrets` policy, env wiring | ✅ One IAM statement plus env vars, a near copy of the SES block |
| **Billing** | 🟡 Separate card and invoice on Meta | ✅ On the existing AWS bill |
| **Delivery-status events** (to detect "not on WhatsApp") | ❌ Needs a public HTTPS webhook route on the backend plus Meta signature verification | ✅ Sent to SNS, no public endpoint |
| **Free test number without verification** | ✅ Yes, see Q5/Q6 | ❌ No. AWS needs a real registered number |
| **Setup effort** | 🟡 Developer app + WABA + System User + token | 🟡 Embedded signup inside the AWS console |
| **Vendor lock-in** | ✅ None, Meta is the source | 🟡 Light. Switching later to Meta direct means swapping one provider class |
| **Moving between them later** | Easy either way: both are one provider class behind `OTP_DELIVERY_MODE`, and the WABA itself stays in *your* Meta Business Portfolio either way | |

### Recommendation

**Option 2 (AWS) for staging and launch.** It's the cleanest fit for this codebase: the SES
pattern again, no secret to manage, one bill, no public webhook. The extra ~₹0.17/OTP is
negligible at our volume.

**Hybrid worth considering:** use **Meta's free test number (Option 1)** during development
and testing *while* business verification runs, then cut over to AWS for real users. The code
could support both behind `OTP_DELIVERY_MODE` (`whatsapp_meta_test` / `whatsapp_aws`), but it
costs an extra provider class.

**Pure cost choice:** Option 1 throughout, accepting the token and webhook overhead. Worth
re-evaluating once volume passes roughly 50K+ OTPs/month.

---

## Q5. Verification time, and do we stay on stub until verified?

| Step | Time | Blocks sending? |
|---|---|---|
| Meta Business Portfolio + WABA creation | Minutes | Yes, needed first |
| Sender phone-number registration (SMS/voice OTP) | Minutes | Yes |
| Display-name review | Usually hours to ~2 days | Can delay sending from that number until approved |
| Authentication template approval | Usually minutes to hours | Yes, needed first |
| **Meta business verification** | **Usually 1–5 business days, occasionally ~2 weeks** | **No.** It only lifts the limit from 250 to 2,000 recipients/24h |
| AWS-side verification (Option 2) | **None.** No sandbox or production-access step like SES had | No |

**Short answer: we do not have to stay on stub until we're verified.** Once the number,
display name and template are through (typically a day or two), real OTPs work.

---

## Q6. Can we do real OTP verification without the stub before we're verified?

**Yes, two ways:**

1. **Unverified business, our own real number (both options).** New business portfolios can
   send to up to **250 unique recipients per 24 hours** without business verification. Real
   numbers, real OTPs, normal pricing. That's plenty for staging and internal testing.
   Verification only matters for going past 250/day (→ 2,000, then scaling automatically).
2. **Meta's free test number (Option 1 only).** Every Meta developer app gets a free test
   sender number instantly. It can message **up to 5 pre-registered recipient numbers**
   (your team's phones), with no business verification, no dedicated SIM and no payment
   method, and those messages are free. That makes it a good way to replace stub for the team
   *today*, before any of the Q1 paperwork is done. It can't message arbitrary users, so it's
   not usable for real signups.

Either way, **stub stays only for local development** (`OTP_DELIVERY_MODE=stub` in your local
`.env`, and forced in tests by the existing conftest fixture). Staging moves to real WhatsApp
as soon as one of the two paths above is set up.

---

## Other decisions needed (both options)

1. **Users without WhatsApp.** Meta accepts the send right away and reports "not on
   WhatsApp" (error `131026`) only **asynchronously**, so we can't tell the user at request
   time. Options:
   - **(a)** OTP-screen copy: "Sent on WhatsApp. Didn't get it? Continue with email instead."
     **Recommended for MVP.**
   - **(b)** Automatic SMS fallback. Needs an SMS provider plus DLT (~1–2 weeks).
2. **Internal naming.** `Channel = Literal["sms", "email"]` and `otp_delivery_mode` say "sms".
   Keep `"sms"` internally with a comment (less churn), or rename to `"phone"`.

---

## Codebase: where things stand and what changes

**Current state**

- `otp.py` already shares all OTP logic across channels. The phone branch just has no send
  call yet; in stub mode the code comes back in the API response and shows on screen
  (`devOtp` in `AuthEntryFlow.tsx`).
- `OTP_DELIVERY_MODE` (phone) is already independent of `EMAIL_DELIVERY_MODE`, and stub is
  already refused in production.
- `otp_requests.phone_number` already exists: **no migration.**
- The existing conftest fixture forces stub in tests, so no real sends from the test suite.
- ⚠️ Phone validation is **frontend-only** (`validation.ts`, +91). The backend accepts any
  string (`schemas.py:35`). With WhatsApp, foreign numbers cost ~20× (Q1.1), so **server-side
  `^\+91[6-9]\d{9}$` validation is mandatory.** The only throttle today is 60s per number; a
  per-IP/device limit is worth considering.

**Changes (either option)**

- **Backend**
  - New `backend/app/services/auth/whatsapp_provider.py`, mirroring `email_provider.py`: a
    Protocol, a stub provider, the real provider (AWS `boto3` *or* Meta HTTP), a
    `WhatsAppSendError`, and a factory function.
  - `otp.py`: send before persisting, same ordering as email, so a failed send doesn't engage
    the resend throttle.
  - `config.py`: new settings for the WhatsApp phone-number ID and the template name/language.
  - `api/auth.py`: turn a failed send into a 502 in `/otp/request` and
    `/contact-change/request`.
  - `schemas.py`: the +91 validator.
- **Frontend**
  - "Sent to your WhatsApp on +91 …" copy.
  - A 502 error message.
  - The "use email instead" escape hatch.
- **Infra**
  - Option 2: one IAM statement plus env vars.
  - Option 1: a Secrets Manager secret, the `ReadAppSecrets` policy, env vars, and a webhook
    route if we want status events.
  - fck-nat already provides outbound internet.
- **Tests:** mocked with `unittest.mock.patch` (house style, no `moto`).
- **Docs:** implementation plan, `decisions.md`, `backend.md`, and
  `aws-golive-launch-blockers.md`.

**Doc-vs-code discrepancy to flag:** `CLAUDE.md`/`session.md` item 9 still lists "phone-OTP
login silently creates a new account" as open. On this branch, `verify_otp_route` returns 401
for `flow == "login"`. The bug survives only in the legacy `flow`-omitted branch, which the
current frontend never calls. Worth confirming and closing separately.

## End-to-end checklist: Option 1 (Meta WhatsApp Cloud API, direct)

Parts of this run in parallel: once steps 5–7 are done and the code is built, the team can
test with Meta's free test number while business verification is still pending.

### Your part

**A. Before you start**

1. Buy a new SIM for the sender number. It must never have been on any WhatsApp app, or its
   WhatsApp account must be deleted first (§1.2(3)).
2. Have the company documents ready as PDFs: Certificate of Incorporation / GST / Udyam, plus
   an address proof in the same legal name.
3. Put the privacy policy live on `unifolio.in`. Meta needs its URL for verification and to
   switch the app to Live in step 14.
4. Have a personal Facebook account, and ideally a second person as backup admin.

**B. Business Portfolio** (business.facebook.com)

5. Create the Business Portfolio using Unifolio's exact legal name and an `@unifolio.in`
   email, then add the second admin.
6. Start business verification: Business settings → Security Centre → Start verification.
   Enter the legal name, address, phone and website, and upload the documents.
   - If Meta asks for domain verification, add the TXT record it gives you in Route 53.
   - This takes 1–5 business days. Carry on with the next steps meanwhile.

**C. Developer app and test number** (developers.facebook.com)

7. Register as a developer → Create App → use case "Connect with customers through
   WhatsApp" → link it to the Business Portfolio.
8. Open WhatsApp → API Setup. A **free test number** is already there.
   - Add up to 5 team phone numbers as recipients, confirming each with the code Meta sends.
   - Send `hello_world` to check it works.
9. Create a permanent access token:
   - Business settings → Users → System users → Add (Admin role).
   - Assign it the app and the WhatsApp Business Account, both with full control.
   - Generate a token for the app, set expiry to **Never**, and tick
     `whatsapp_business_messaging` and `whatsapp_business_management`.
   - **The token is shown once. Never paste it in chat.** Put it in local `backend/.env` now,
     and in AWS Secrets Manager once the Terraform is applied.
10. Copy the **App Secret** (App settings → Basic). It's only needed if we build the
    delivery-status webhook, and it goes into Secrets Manager the same way.

**D. OTP template, billing, real number**

11. Create the OTP template in WhatsApp Manager → Message templates → Create:
    - category **Authentication**, name `unifolio_otp`, language English
    - **Copy code** button, security recommendation on, expiry **5 minutes**
    - create it in each WhatsApp Business Account you send from (the test one and the real one)
12. Add a payment method in WhatsApp Manager → Billing, a card billed in INR. The test number
    doesn't need it; real sends do.
13. Add the real number: API Setup → Add phone number.
    - display name "Unifolio", category Finance
    - verify the SIM by SMS or voice call, then set the 6-digit PIN
    - wait for display-name approval (hours to ~2 days)
14. Switch the app to **Live** mode (needs the privacy-policy URL, an icon and a category).
15. *(Only if we build the webhook)* App → WhatsApp → Configuration: enter the callback URL
    and verify token I provide. This needs a public HTTPS backend URL, which depends on the
    still-open backend API domain decision (§19/§22 Phase 5).

**E. Send me these** (none are secret)

- App ID and WhatsApp Business Account ID
- Phone number ID, for both the test and the real number
- the template name and language
- confirmation that the token is in your `.env` and, later, in Secrets Manager

### My part

1. **Implementation plan** in `Docs/superpowers/plans/`, with the delegation and review steps
   our orchestration process requires. You approve it before any code.
2. **Backend:**
   - server-side +91 validation
   - `whatsapp_provider.py` (a stub for local dev plus the Meta Cloud API sender, calling
     `graph.facebook.com`)
   - send-before-persist in `otp.py`
   - new settings, a 502 on send failure, and tests
3. **Webhook (optional):** a delivery-status endpoint that checks Meta's
   `X-Hub-Signature-256` signature with the App Secret, to detect "not on WhatsApp".
4. **Frontend:** "Sent to your WhatsApp" copy, a proper error message, and a "Didn't get it?
   Use email instead" link.
5. **Terraform:** Secrets Manager secret(s) for the token (+ App Secret), extend the
   `ReadAppSecrets` IAM policy, and inject them into the ECS task with the new env vars.
6. **Checks and docs:** independent code review, full test run, updates to `decisions.md`,
   `backend.md` and `aws-golive-launch-blockers.md`, and a staging cutover guide like the SES
   one.

### Then you

- Run `terraform apply`, then put the token (+ App Secret) into the new secret(s).
- Set `OTP_DELIVERY_MODE=whatsapp_meta` on staging. Test with the test number first, then the
  real one.
- Commit when you're happy.

**Timeline:** steps 1–11 plus the code take about a week, and the team can use the test number
meanwhile. Real users can get OTPs once the real number and display name are approved (a day or
two), up to 250/day. The limit rises to 2,000/day when business verification finishes
(1–5 days).

---

## End-to-end checklist: Option 2 (AWS End User Messaging Social)

Shorter than Option 1: no developer app, no access token, no App Secret, no Live-mode switch,
no Meta payment method and no public webhook. **But there's no free test number.** Real sends
only start once the real number, display name and template are approved, typically a day or
two after step 7.

### Your part

**A. Before you start** (same as Option 1)

1. Buy a new SIM for the sender number, following the same rules as Option 1.
2. Have the company documents ready as PDFs (same as Option 1).
3. Put the privacy policy live on `unifolio.in`. It's still needed for Meta business
   verification.
4. Have a personal Facebook account, and ideally a second admin.

**B. Business Portfolio** (business.facebook.com)

5. Create the Business Portfolio (exact legal name, `@unifolio.in` email) and add the second
   admin. AWS's signup can create one for you, but creating it yourself first means the legal
   name and details are right from the start.
6. Start business verification (same as Option 1, step 6). It takes 1–5 business days, so
   carry on meanwhile.

**C. Connect WhatsApp to AWS** (AWS console, region **ap-south-1 Mumbai**)

7. AWS End User Messaging → Social messaging → **Add WhatsApp phone number** → launch Meta's
   signup popup:
   - log in with your Facebook account and choose the Business Portfolio from step 5
   - create a new WhatsApp Business Account, named "Unifolio"
   - add the new SIM's number: display name "Unifolio", category Finance, verify it by SMS or
     voice call
   - back in the AWS console, finish the setup and set the 6-digit two-step verification PIN
   - leave the event destination blank for now (I'll add an SNS topic in Terraform if we want
     delivery events)
8. Confirm in the console that the number is listed under **ap-south-1**, and wait for
   display-name approval (hours to ~2 days).

**D. OTP template**

9. Create the OTP template in Meta's WhatsApp Manager (reachable from the AWS console's link,
   or business.facebook.com → WhatsApp Manager → Message templates):
   - category **Authentication**, name `unifolio_otp`, language English
   - **Copy code** button, security recommendation on, expiry **5 minutes**

**E. Billing**

10. Nothing to set up in Meta. Meta's fee and AWS's fee both appear on the AWS invoice.
    Optional: add an AWS Budgets alert on End User Messaging spend.

**F. One AWS check** (the same check as SES Part 0, item 4)

11. AWS Console → ECS → staging cluster/service → task definition → "Task role". Confirm it is
    the Terraform-managed `aws_iam_role.backend_task`, so the new permission lands on the role
    the running backend actually uses.

**G. Send me these** (none are secret)

- AWS **phone number ID** (the console shows it as `phone-number-id-…`) and its ARN
- the WhatsApp Business Account ID
- the template name and language
- confirmation of the region, and the result of step 11

### My part

1. **Implementation plan** in `Docs/superpowers/plans/`, with the same delegation and review
   steps. You approve it before any code.
2. **Backend:**
   - server-side +91 validation
   - `whatsapp_provider.py` (a stub for local dev plus an AWS sender using the already-pinned
     `boto3`: `socialmessaging.send_whatsapp_message(originationPhoneNumberId=…,
     metaApiVersion=…, message=<template JSON>)`, authenticated by the ECS task's IAM role, no
     key)
   - send-before-persist in `otp.py`
   - new settings, a 502 on send failure, and tests (mocked `boto3`, house style)
3. **Frontend:** same as Option 1 ("Sent to your WhatsApp", error message, "use email
   instead" link).
4. **Terraform:**
   - one IAM statement, `social-messaging:SendWhatsAppMessage`, scoped to the phone-number
     ARN (a new variable; empty disables it, like `ses_identity_arn`)
   - new ECS env vars
   - optional SNS topic + event destination for delivery events, with no public endpoint
   - **no secrets**
5. **Checks and docs:** same as Option 1. Independent review, full test run, doc updates,
   staging cutover guide.

### Then you

- Run `terraform apply`.
- Set `OTP_DELIVERY_MODE=whatsapp_aws` on staging and test end-to-end with your own phone.
- Commit when you're happy.

**Timeline:** the code takes about the same time as Option 1. Staging stays on stub until the
real number, display name and template are approved (a day or two after step 7). After that,
real OTPs go to anyone, up to 250/day. The limit rises to 2,000/day when business verification
finishes (1–5 days). If the team needs real WhatsApp OTPs sooner, the hybrid in Q4 (Meta's free
test number now, AWS later) covers the gap.

---

## Sources

- [Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Meta — Authentication-international rates](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/authentication-international-rates/)
- [Meta — Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Meta — Authentication templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates)
- [Meta — Business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)
- [AWS End User Messaging pricing](https://aws.amazon.com/end-user-messaging/pricing)
- [AWS End User Messaging Social — charged per message](https://docs.aws.amazon.com/social-messaging/latest/userguide/charged-per-message.html)
- [AWS blog — Send WhatsApp messages with End User Messaging Social](https://aws.amazon.com/blogs/messaging-and-targeting/send-whatsapp-business-messages-with-aws-end-user-messaging-social/)
- [WANotifier — Test phone number limitations](https://help.wanotifier.com/en/article/test-phone-number-limitations-in-direct-setup-kt0ly2/)
- [ChatMaxima — WhatsApp API pricing India 2026](https://chatmaxima.com/whatsapp-api-pricing/india/)
- [Authgear — WhatsApp API pricing explained (2026)](https://www.authgear.com/post/whatsapp-api-pricing/)
