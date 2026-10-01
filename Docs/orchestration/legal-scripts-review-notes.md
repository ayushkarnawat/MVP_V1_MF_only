# T&C + Privacy Policy: notes for reviewers

*2026-10-01. These notes go with `terms-and-conditions-draft.md` and `privacy-policy-draft.md`. They are for the manager, stakeholders and the lawyer, not for users.*

## How the documents are built

Each document opens with **"The short version"**, a summary of 7–8 plain-language bullets that most users will actually read. The full legal text sits below it. This layered approach is standard practice, used by Google, Zerodha and others. It also matches what the DPDP Act asks for: a notice that is clear, plain and itemised. Two points are written to build trust: "we can see your investments, we can never touch them" and "we never sell your data". These are true of the code today. If either ever stops being true, the documents must be updated.

## Every factual claim was checked against the code

| Claim | Where it comes from in the code |
|---|---|
| OTP valid for 5 min, locked after 5 attempts, stale records purged at 30 days | `services/auth/otp.py` |
| Sessions last 30 days and extend while in use | `services/auth/session.py` |
| CAS PDF deleted after 30 days, stored in S3 with KMS encryption | `services/import_/file_storage.py`, `infra/modules/storage` |
| CAS password never stored; locked PDF kept in memory for 15 min to allow a retry | `services/import_/buffer_cache.py` |
| PAN encrypted, plus a peppered lookup hash; one PAN per account system-wide | `models/user.py`, ADR-004 (reopened) |
| 5-day deletion grace period, undone via reactivate | `services/auth/account_deletion.py` |
| Deletion survey kept anonymously | `models/account_deletion.py` |
| IP, user agent and device ID captured at sign-in | `models/auth.py` (`OtpRequest`) |
| No cookies or trackers; localStorage holds session token, device ID and theme | `frontend/src` |
| AWS ap-south-1; email via SES | `infra/`, `decisions.md` 2026-09 |
| Market data from AMFI, mfapi.in and NSE | `services/analytics/*`, `services/dashboard/nav.py` |
| Nominees ignored | CAS member detection spec, I2 |

## Placeholders to fill in

Legal entity name, registered address, Grievance Officer's name and email, effective date, court city, SMS provider (still a stub), liability cap amount (₹1,000 suggested), and response-time commitments.

## Gaps that need a decision before go-live

1. **No consent record is stored.** The DPDP Act requires us to be able to prove consent. The code has no table recording who agreed to which version, and when. We need one (user_id, document, version, timestamp) before these documents go live.
2. **How the sign-up screen asks for consent.** The checkbox must not be pre-ticked, and it needs a clear affirmative action. Best practice is to link the Privacy Policy as its own notice rather than bury it inside the T&C. Suggested wording: *"I agree to the [Terms & Conditions] and have read the [Privacy Policy]."*
3. **Log retention.** Staging keeps CloudWatch logs for 7 days and RDS backups for 3 days. The DPDP Rules, 2025 expect processing logs to be kept for at least 1 year. The policy currently has placeholders (`[up to 1 year]`, `[7] days`). Production values need to be set.
4. **Right to access.** The policy promises a summary on request, handled by email. There is no in-app export yet, so the policy deliberately doesn't promise a download.
5. **Nomination right (DPDP s.14).** The policy promises it, but no process exists yet. For now it can be handled manually by email.
6. **Languages.** Under the DPDP Act, users must be able to get the notice in any Eighth Schedule language. Decide whether "on request" is acceptable for launch.
7. **Fund scores and SEBI.** The T&C states plainly that scores are not advice and that we are not a SEBI-registered investment adviser or research analyst. Legal should confirm that the "Fund Signal" and score wording in the UI doesn't cross into a "recommendation" under the SEBI (Research Analysts) Regulations.
8. **Timing.** Most DPDP obligations take full effect in May 2027, 18 months after the Rules were notified in November 2025. Until then, the IT Act's SPDI Rules, 2011 still apply, and they treat financial information as sensitive personal data. These drafts are written to meet both.

## Brand and in-app copy check (pass 2, 2026-10-01)

- **Brand Identity PDF.** This covers only the logo, the colours (#111111 / #FCFCFC / #22C55E) and the fonts (Manrope / DM Sans). None of it belongs in the legal text. It applies only when these pages are styled in the app.
- **PRODUCT.md brand commitments.** The scorer's published weighting (45/30/25) is now in T&C §6, which supports the "fixed, disclosed methodology" positioning. Copy rule from that doc: "never imply more confidence than the underlying data has". T&C §7 follows it.
- **Onboarding privacy screen (`frontend/src/features/auth/TrustPrimer.tsx`).** The documents now use the same promises and wording as this screen: "We keep your insights, not your files", 30-day encrypted CAS file "for dispute resolution", "PAN stored encrypted and never shown in full", "Nothing is ever bought, sold, or transferred."
- **Account Aggregator line on TrustPrimer.** This screen says Unifolio "operates under the Account Aggregator framework", which isn't true. The user confirmed on 2026-10-01 that the whole screen is being removed, so it's out of scope here. Neither document mentions Account Aggregator.

## PAN coverage (pass 2)

The Privacy Policy now has a dedicated §3.4. Every point in it is checked against the code:
- Each PAN is stored with AES-GCM encryption (`services/import_/crypto.py`). Matching uses an HMAC lookup hash that can't be reversed.
- The PAN is shown masked as the first 2 and last 2 characters (`parser.py:mask_pan`).
- The PAN is claimed at upload and released if the upload is discarded or expires (`pan_claims.py`).
- The PAN is deleted along with the member row (`import_/deletion.py:_remove_member`) and with the account (hard delete). The user's own PAN is always kept while the account exists (M17).
- A PAN row was added to the retention table, and the T&C "one person, one account" clause now explains why we store PANs.
- **Legal should confirm:** the promise that we never use PAN for KYC or credit checks, and never share it except where the law requires, is true today. It needs to be treated as a lasting product commitment.

## Business decisions (user, 2026-10-01)

- **Entity.** Confirmed by the user on 2026-10-01: **Keystone Wealthtech LLP**, a limited liability partnership, with Unifolio as its brand. Both documents use "Keystone Wealthtech LLP". Under LLP Act s.15, an LLP's name must end in "LLP", so it can't be "Pvt. Ltd.". The LLPIN and registered office address are still placeholders. If the registered name differs at all from "Keystone Wealthtech LLP", update it in all four places (Privacy §1/§16, T&C §1/§21).
- **Marketing.** The user decided: product updates and offers by email, SMS and WhatsApp, opt-out at any time, and **no separate opt-in**. The documents reflect this (Privacy §12, T&C §11). **⚠ Legal should check:** (a) under DPDP s.6, consent has to be specific to each purpose, so marketing bundled into the sign-up consent may be challenged; (b) under TRAI's TCCCPR 2018, promotional SMS needs DLT registration and must respect the DND registry; (c) WhatsApp's business policy requires opt-in for marketing messages. A ticked-by-default toggle in settings is one low-friction middle ground, if legal advises it.
- **Paid features.** These are definite, but what will be paid and how is still undecided. T&C §8 commits only to showing the price before purchase, never charging without consent, and giving notice before a free feature becomes paid. Payment, renewal and refund terms are a `[PLACEHOLDER]` until pricing is decided.

## Standard clauses added (2026-10-01, pass 3)

Added after comparing against common Indian fintech T&Cs and privacy policies:
1. **Electronic record under the IT Act, 2000.** T&C §1 and Privacy §2.
2. **Section 43A of the IT Act and the SPDI Rules, 2011.** Privacy §2.
3. **Arbitration under the Arbitration and Conciliation Act, 1996.** Sole arbitrator, seat in `[CITY]`, English. Interim court relief and consumer/DPDP rights are carved out. T&C §19.
4. **Force majeure.** Includes fund-house, RTA, AMFI and cloud outages. T&C §20.
5. **Survival.** Covers §§10, 15, 16, 17 and 19. T&C §20.
6. **Feedback licence.** Personal data is explicitly excluded. T&C §10.
7. **Beta features.** No guarantees. T&C §13.
8. **DND (NCPR) override consent.** T&C §11 and Privacy §12. **⚠ For legal:** under TRAI's TCCCPR 2018, a clause in the T&C may not count as valid consent to message numbers registered as DND. Many fintechs include one anyway, but it's legally weak.

**These are drafts. They are not legal advice, and a qualified lawyer should review them before they are published.**
