# Security & DPDP Compliance Audit — Factual Findings

**Date:** 2026-10-16
**Method:** three parallel agents read the actual Terraform (`infra/`), backend source (`backend/app/`), and `/Docs` + root docs (`decisions.md`, `session.md`, `DEFERRED_FEATURES.md`, ADRs, legal drafts), citing exact file:line for every claim. This document only states what was found in the codebase as of this commit — nothing aspirational. "Not found" means a grep/read came back empty, not that the feature doesn't matter.

---

## TL;DR — what you can truthfully claim today

| Claim | Status |
|---|---|
| AES-256 encryption of PAN at rest | ✅ True — AES-256-GCM, application-layer, `backend/app/services/import_/crypto.py` |
| Database encrypted at rest | ✅ True — RDS `storage_encrypted=true` with a customer-managed KMS key |
| TLS in transit (browser ↔ app) | ✅ True — ALB/CloudFront HTTPS-only, TLS 1.2 minimum (TLS 1.3 supported on ALB) |
| TLS for DB connections (app ↔ RDS) | ⚠️ **Not verified/not enforced** — no `rds.force_ssl` parameter group, no `sslmode` in app code |
| Secrets never hardcoded | ✅ True — Secrets Manager + KMS, env-var injection, nothing committed |
| "DPDP Act compliant" | ❌ **Not accurate today** — see DPDP section. Consent infra is well-built, but the live privacy policy/T&C served to users is a placeholder stub, and there's no data-export (right to access) feature |
| Password hashing (bcrypt/argon2) | N/A — app has no passwords; OTP + Google Sign-In only, OTP hashed with SHA-256 (justified, not a weakness here) |
| Rate limiting / WAF | ❌ Not found — only a per-identifier OTP resend throttle exists |
| Security headers (HSTS/CSP/etc.) | ❌ Not found in app code |
| CloudTrail / VPC Flow Logs / DB audit logs | ❌ Not found in Terraform |

---

## 1. Encryption at rest

- **RDS Postgres**: `storage_encrypted = true`, `kms_key_id = var.kms_key_arn` — `infra/modules/database/main.tf:24-25`. The key is a **customer-managed KMS key (CMK)**, not AWS-managed: `aws_kms_key.rds_and_secrets`, `infra/modules/security/main.tf:25-29`, with **key rotation enabled** (`enable_key_rotation = true`). RDS master password is Secrets-Manager-managed (`manage_master_user_password = true`) and encrypted with the same CMK.
- **S3 — CAS PDF bucket**: SSE-**KMS** with the same CMK, bucket-key enabled — `infra/modules/storage/main.tf:29-38`.
- **S3 — portfolio-disclosure-failed bucket**: SSE-**S3 (AES-256)**, not KMS, by deliberate design (comment explains it avoids KMS-grant friction for a PutObject-only job policy) — `infra/modules/storage/main.tf:70-78`.
- **S3 — frontend bucket**: **no explicit SSE resource configured in Terraform at all** — falls back to AWS's account-level default SSE-S3, but it's not declared in code. `infra/modules/frontend/main.tf`.
- **EBS volumes** (bastion, fck-nat EC2 instances): no `root_block_device`/`encrypted` block found anywhere in `infra/modules/networking/main.tf` — encryption depends entirely on the AWS account/region default-EBS-encryption setting, **not controlled by this Terraform**.
- **Secrets Manager**: RDS master secret and the `pan_keys` secret (PAN encryption key + lookup pepper) are both explicitly KMS-encrypted with the same CMK — `infra/modules/security/main.tf:49-61`. No SSM Parameter Store usage anywhere (grepped, zero hits) — Secrets Manager is the only secrets store.

**Bottom line:** the database and the sensitive-file bucket are genuinely KMS-encrypted with a customer-managed key. The frontend bucket and EBS volumes rely on AWS defaults rather than explicit configuration — true today because AWS defaults to encrypting new S3 objects, but not something you should describe as "we configured encryption" for those two.

---

## 2. Encryption in transit / TLS

- **ALB**: HTTP (port 80) listener exists but only issues a 301 redirect to HTTPS — no plaintext app traffic is served. HTTPS listener uses `ssl_policy = "ELBSecurityPolicy-TLS13-1-2-2021-06"` (**TLS 1.2 minimum, TLS 1.3 supported**) with an ACM certificate. `infra/modules/backend/main.tf:337-364`.
- **ALB → ECS backend** (inside the VPC): plaintext HTTP on port 8000 — not internet-exposed, confined to a security-group-restricted private path.
- **CloudFront** (frontend + marketing + docs-viewer): `viewer_protocol_policy = "redirect-to-https"`, `minimum_protocol_version = "TLSv1.2_2021"`, SNI-only. `infra/modules/frontend/main.tf:39,84-88`.
- **Port 80 security-group rule** is open `0.0.0.0/0` by design (needed for the redirect itself), with a code comment confirming the intent.
- **Database connection TLS (app ↔ RDS)**: **not found**. Grepped all of `infra/` for `force_ssl`/`rds.force_ssl`/`sslmode`/`parameter_group` — zero matches. There is no custom `aws_db_parameter_group`, so RDS runs on the AWS-default parameter group, which does **not** force SSL unless `rds.force_ssl=1` is explicitly set. The backend app code also has no `sslmode` anywhere. **This means DB traffic encryption in transit is not currently enforced or verifiable from code** — it would rely on the Postgres/driver defaults, which don't mandate TLS.

**Bottom line:** "TLS in transit" is true and well-configured for anything a browser or the public touches (frontend, API, CloudFront). It is **not confirmed** for the backend-to-database hop — that's a real gap if you want to claim end-to-end TLS everywhere.

---

## 3. Network isolation

- 3-tier VPC: public / private_app / private_data subnets across 2 AZs. RDS lives only in `private_data`, `publicly_accessible = false`. ECS backend tasks and all scheduled batch jobs run in `private_app` with `assign_public_ip = false`.
- Bastion: public subnet, but **SSM Session Manager only** — no SSH key, no inbound security-group rule at all (confirmed: only egress rules exist for its SG).
- IMDSv2 enforced (`http_tokens = "required"`) on both the bastion and the NAT instance.
- RDS ingress is scoped to specific security groups (ECS, bastion) on port 5432 — **no CIDR-based (0.0.0.0/0) ingress rule on the database**.
- Egress on ECS tasks, the bastion, and the NAT instance is `0.0.0.0/0` all-protocols — flagged in the Terraform's own comments as a "deliberate staging decision," not an oversight.
- NAT is a single `fck-nat` EC2 instance (not a managed AWS NAT Gateway), single-AZ — a documented availability trade-off, not a security one.
- **VPC Flow Logs: not found** anywhere in Terraform.

---

## 4. Secrets management

- DB password, PAN encryption key, and PAN lookup pepper are all injected into ECS tasks via the ECS `secrets` block (`valueFrom` a Secrets Manager ARN) — **never as plaintext environment variables**.
- No static AWS access keys anywhere in `infra/` — SES and S3 access are granted via IAM task-role policies, not credentials.
- No Google OAuth client *secret* exists anywhere (only the public client ID) — consistent with the app using Google's ID-token verification flow, which needs no client secret.
- `backend/.env` is confirmed git-ignored and untracked; `.env.example` contains only empty placeholders. No hardcoded secret literals were found anywhere in `backend/app/**/*.py` (checked against `SECRET_KEY=`, `password=`, AWS key patterns).
- Production PAN keys are provisioned via `TF_VAR_*` env vars into Secrets Manager, explicitly documented as "never written to a .tfvars file."

**Bottom line:** secrets hygiene is solid — nothing hardcoded, nothing committed, proper IAM-role-based access instead of static keys.

---

## 5. Application-level encryption (PAN)

File: `backend/app/services/import_/crypto.py`

- **Algorithm: AES-256-GCM**, via Python's `cryptography` library (`AESGCM`). A random 12-byte nonce is generated per encryption; `base64(nonce + ciphertext)` is what's stored.
- A **separate, non-reversible HMAC-SHA256** ("pepper"-keyed) hash is stored alongside for lookup/duplicate-matching, so the app never decrypts one household's PAN to check for a cross-account collision — it compares hashes.
- Key source: environment variables (`PAN_ENCRYPTION_KEY`, `PAN_LOOKUP_PEPPER`), validated at startup to be well-formed 32-byte base64 values; the app **refuses to start outside development** if either is missing or malformed.
- In production, both values live in AWS Secrets Manager, KMS-encrypted with the same customer-managed key described in §1.
- This is **not** Postgres `pgcrypto` — it's application-layer encryption before the value ever reaches the DB. Columns are plain `String` (base64 text), not `bytea`.
- PAN is **never returned in plaintext by any API** — only a masked form (`pan_masked`) is exposed to clients. Confirmed by direct code read of the claim/matching logic.

This is genuinely "AES-256 encryption" for the one category of truly sensitive personal data (PAN) the app stores. It is correctly scoped — not a blanket "everything is AES-256-encrypted" claim, just PAN specifically.

---

## 6. Authentication & sessions

- **No passwords** — the app is OTP (email, soon SMS) + Google Sign-In only. A vestigial `WRONG_PASSWORD`/`EMAIL_PASSWORD` enum value remains from a removed flow but there's no password column, no `bcrypt`/`argon2`/`passlib` in the codebase.
- **Sessions**: opaque bearer tokens (`secrets.token_urlsafe(32)`), stored as a SHA-256 hash server-side — **not JWTs**. 30-day expiry, refreshed on activity.
- **Google Sign-In**: verified via Google's own `id_token.verify_oauth2_token` (pure JWT signature verification against Google's public keys) — no JWT-signing secret of Unifolio's own exists anywhere in the codebase.
- **OTP**: 6-digit, CSPRNG-generated, SHA-256-hashed at rest, 5-minute TTL, max 5 verify attempts, 60-second resend throttle. The code explicitly documents *why* SHA-256 (not bcrypt) is the right choice here — OTPs are short-lived, low-entropy, not long-lived credentials, so an expensive hash buys nothing.
- **No IP-based or global rate limiting / WAF** was found anywhere in the backend — only the per-identifier OTP throttle above.

---

## 7. Injection protection

- SQLAlchemy 2.0 ORM used throughout. **No raw string-interpolated SQL found** anywhere in `backend/app/` — every `db.execute()` call uses parameterized Core constructs (`insert()`, pre-built statement objects), never an f-string or `.format()`-built query.

---

## 8. CORS / security headers

- CORS is **not wildcarded** — explicit origin list from `ALLOWED_ORIGINS` env var, falling back to a hardcoded localhost-only list in dev.
- **However**: an `allow_origin_regex` permitting *any* `localhost`/`127.0.0.1` origin on any port, combined with `allow_credentials=True` and `allow_methods/allow_headers=["*"]`, is applied **unconditionally in every environment** — no code-level guard disables it in staging/production. This is a real, fixable gap (low severity since it's scoped to localhost, but worth tightening for a production-hardening pass).
- **No security-headers middleware exists** in the backend — no HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or TrustedHostMiddleware. (HSTS could still be applied at ALB/CloudFront — not checked in this pass, since it's infra not app code — but nothing in the backend app sets it.)

---

## 9. CAS PDF & file handling

- Storage backend is selectable: local disk (dev, plaintext on disk) or S3 (relies entirely on the bucket's default SSE-KMS config — the app code itself applies no explicit encryption parameter on `put_object`).
- **30-day retention**, enforced by a daily EventBridge-scheduled job (`expire_stored_files`) that nulls the DB reference and deletes the underlying file.
- The user-supplied CAS-unlock password is used transiently in-memory per request — **no password column exists on the Import model, and no logging statement references it** (though exception-handler/APM-level capture at the framework level wasn't exhaustively ruled out; no Sentry or similar is in `requirements.txt`).

---

## 10. DPDP Act (2023) compliance posture — the important section

**Short version: strong technical groundwork, but you cannot currently say "DPDP Act compliant" as a flat claim**, mainly because of what's actually served to users today.

**What's genuinely built:**
- **Append-only consent ledger** (migration `0022`, `consent_records` table): DB-level triggers (Postgres trigger, SQLite equivalent) physically prevent UPDATE/DELETE. Records purpose, document type+version+sha256, timestamp, truncated/HMAC'd IP (raw IPs are never stored), user agent, device ID. Versioned — re-consent is forced if the live document changes.
- **ADR-004** (`Docs/PRDs/ADR-Technical-Stack-Decisions.md:305-438`) is a real, substantive architectural decision record explicitly reasoning through DPDP implications of persisting PAN, arriving at AES-256-GCM encryption + 30-day CAS retention as the compromise, with its own documented rationale for why this is still more DPDP-minimizing than the rejected alternative (indefinite plaintext retention).
- **Account deletion**: 30-day grace period, reactivable, then a real hard-delete across every user-linked table (households, folios, transactions, imports, snapshots, analytics, sessions, OTP requests).
- Hosting is confirmed in `ap-south-1` (Mumbai) for the primary infrastructure.

**What's not there yet / would be a false claim today:**
- **The live Privacy Policy and Terms of Service served to users are literal one-line placeholders** — `backend/app/services/legal/documents/privacy_policy.md` reads: *"This document is being finalised with our lawyers. The final text will replace this placeholder, and you'll be asked to agree to it again."* Their registered version strings are literally `"privacy-placeholder-2026-10-01"` / `"tos-placeholder-2026-10-01"`. A substantive DPDP-aware draft **does exist** (`Docs/orchestration/privacy-policy-draft.md`, names the company as "Data Fiduciary," cites the DPDP Act, lists user rights under §10) but it has **not been wired into the app** and still has unfilled placeholders (legal entity name, grievance officer, response-time commitments).
- **No data-export / "right to access" feature exists in-app.** This is a known, explicitly identified gap (`Docs/orchestration/legal-scripts-review-notes.md:35`) — the draft policy deliberately avoids promising an in-app download because there isn't one; access requests would currently have to be handled manually by email. It is not even tracked in `DEFERRED_FEATURES.md`.
- **Consent withdrawal only exists as a side effect of full account deletion** — there's no "I want to withdraw consent for analytics but keep my account" path. This matches the draft policy's own stated design, but it's narrower than the full DPDP consent-withdrawal expectation.
- **Log retention is misaligned with the DPDP Rules, 2025's expectation of ≥1 year for processing logs**: CloudWatch log groups are set to 7-day retention in Terraform, and the policy draft itself has unfilled `[7] days` / `[up to 1 year]` placeholders that haven't been reconciled.
- One open data gap flagged in `decisions.md:549`: CAS-sourced NAV history for CAS-only funds isn't deleted on account/import deletion — explicitly noted as pending the "DPDP retention review."
- **Substantive obligations under the DPDP Rules, 2025 don't take effect until 14 May 2027** per your own research doc (`Docs/orchestration/2026-09-23-pan-verification-kyc-research.md:29`) — so there is runway, but the gap above is real today, not hypothetical.

---

## 11. Logging / monitoring (security-relevant)

- **Not found anywhere in Terraform**: CloudTrail, VPC Flow Logs, RDS audit logging (no `pgaudit`, no `enabled_cloudwatch_logs_exports`).
- What does exist: 7-day-retention CloudWatch logs for ECS/job containers, an RDS availability/failure event subscription feeding SNS email alerts, CloudWatch alarms on batch-job failures, and ECR image scan-on-push. These are operational/health monitoring, not security audit trails.

---

## Fixable gaps worth prioritizing (factual, ranked by how likely they are to surface in a customer/investor/regulator conversation)

1. **Live Privacy Policy/T&C are placeholders** — the single biggest "can't claim DPDP compliance" blocker; the substantive draft exists and mostly needs legal sign-off + wiring in.
2. **No data-export (right to access) feature** — a core DPDP data-principal right with no in-app mechanism yet.
3. **RDS connection TLS not explicitly enforced** (`rds.force_ssl`) — cheap infra fix.
4. **No HSTS/CSP/security-headers middleware** — cheap app-code fix (e.g. `starlette-csp` or a small custom middleware).
5. **CloudWatch log retention (7 days) vs. DPDP Rules' ~1-year expectation for processing logs** — needs a deliberate retention decision, not just a Terraform value bump.
6. **CORS `allow_origin_regex` is unconditional** — low severity (localhost-scoped) but should be dev-only.
7. **No IP-based rate limiting / WAF** on the public API.
8. **No CloudTrail / VPC Flow Logs / DB audit logging** configured.
