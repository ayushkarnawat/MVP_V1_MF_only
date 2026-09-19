# CAS-File S3 Storage + PAN/Postmark Secrets — Infrastructure Plan

**Who this is for:** whoever runs this against the real AWS account (your manager). It assumes familiarity with `terraform` and `git`, but no prior context on this specific feature.

**Goal:** wire up the two things needed to run the already-built PAN-persistence/CAS-file-storage feature and the Postmark email provider for real in AWS staging: a private S3 bucket for retained CAS files, and Secrets Manager entries for the PAN encryption keys and the Postmark API token — reusing the KMS key and IAM patterns already staged in this repo's Terraform, not inventing new ones.

**Correction (2026-09-19, re-verified against real AWS, not assumed from the repo alone):** the original framing below — "no `.tfstate` exists, Phase 0/1 has never been run" — was true when this section was first drafted but is stale. Phase 0-3 Terraform (networking, security, database, ECR, backend) was applied on 2026-09-09 and is live in `ap-south-1` today: a real VPC, RDS instance, ECS cluster/service, and ALB are serving traffic. **Nothing in this plan's own additions (the storage/security/backend/scheduler changes below) has been applied yet** — confirmed this session via a read-only `terraform plan` against the real remote state, and by checking Secrets Manager/S3 directly (neither the new `pan-keys`/`postmark-api-token` secrets nor the `cas-files` bucket exist yet). This plan's changes land as an **incremental apply on top of the already-live environment**, not a from-scratch bootstrap — see Part D for the exact expected diff.

**A correction worth knowing before you start:** the original framing of this work was "fix a KMS gap" on the ECS task's ability to decrypt secrets. On close inspection of the actual staged Terraform (`infra/modules/backend/main.tf`), that's only half true — the request-serving task's *execution role* (`aws_iam_role.ecs_task_execution`) already has `kms:Decrypt`/`kms:DescribeKey` on the shared KMS key (added for the RDS password), it's just scoped to reading the *RDS secret specifically*, not the two new secrets this plan adds. The real, more interesting gap is that the task's *runtime role* (`aws_iam_role.backend_task` — the one the app's own AWS SDK calls run as) currently has **zero** S3 or KMS permissions at all; it's only ever been granted `ecs:RunTask` for the analytics dispatcher. That's the role that needs new access, for a different reason (writing/reading S3 objects encrypted with the shared key), not the reason originally assumed.

---

## Prerequisites

- AWS CLI configured with credentials for the target account, region `ap-south-1`.
- Terraform installed, matching whatever version `infra/envs/staging/versions.tf` pins.
- Access to the Postmark account that will send OTP emails, and to the mailbox that will be the `POSTMARK_FROM_EMAIL` sender.
- Nothing about the marketing site, mail (MX/SPF/DMARC), or the existing Route 53 zone is touched by this plan.

---

## Part A — Terraform changes

### A1. New module: `infra/modules/storage/` (the CAS-files S3 bucket)

Create `infra/modules/storage/main.tf`:

```hcl
resource "aws_s3_bucket" "cas_files" {
  bucket = "${var.project}-${var.environment}-cas-files-${var.account_id}"
}

resource "aws_s3_bucket_public_access_block" "cas_files" {
  bucket = aws_s3_bucket.cas_files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "cas_files" {
  bucket = aws_s3_bucket.cas_files.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cas_files" {
  bucket = aws_s3_bucket.cas_files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

# 30-day retention matches CAS_FILE_RETENTION_DAYS in
# backend/app/services/import_/file_storage.py. This is a backstop, not the
# primary deletion mechanism -- the app's own expire_stored_files() sweep
# (via backend/app/scripts/expire_cas_files.py) already deletes objects and
# nulls the DB row at 30 days; this Lifecycle rule only catches anything that
# sweep misses (e.g. a row whose Import was deleted without deleting its file).
resource "aws_s3_bucket_lifecycle_configuration" "cas_files" {
  bucket = aws_s3_bucket.cas_files.id

  rule {
    id     = "expire-cas-files"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
  }
}
```

Create `infra/modules/storage/variables.tf`:

```hcl
variable "environment" {
  description = "Deployment environment name used for resource names."
  type        = string
}

variable "project" {
  description = "Project name used for resource names."
  type        = string
}

variable "account_id" {
  description = "AWS account ID, used to make the bucket name globally unique."
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the customer-managed KMS key used for SSE-KMS bucket encryption."
  type        = string
}
```

Create `infra/modules/storage/outputs.tf`:

```hcl
output "bucket_name" {
  description = "Name of the private S3 bucket holding retained CAS files."
  value       = aws_s3_bucket.cas_files.id
}

output "bucket_arn" {
  description = "ARN of the private S3 bucket holding retained CAS files."
  value       = aws_s3_bucket.cas_files.arn
}
```

### A2. New Secrets Manager resources, in `infra/modules/security/main.tf`

Add to the end of the existing file (after the `aws_kms_alias` resource):

```hcl
# Populated out-of-band via TF_VAR_pan_encryption_key / TF_VAR_pan_lookup_pepper
# at `terraform apply` time -- never written to any .tfvars file or committed.
# See Part D of the infra plan for how to generate these.
resource "aws_secretsmanager_secret" "pan_keys" {
  name       = "unifolio-${var.environment}-pan-keys"
  kms_key_id = aws_kms_key.rds_and_secrets.arn

  tags = merge(local.common_tags, {
    Name = "${var.environment}-pan-keys"
  })
}

resource "aws_secretsmanager_secret_version" "pan_keys" {
  secret_id = aws_secretsmanager_secret.pan_keys.id
  secret_string = jsonencode({
    PAN_ENCRYPTION_KEY = var.pan_encryption_key
    PAN_LOOKUP_PEPPER  = var.pan_lookup_pepper
  })
}

# Populated out-of-band via TF_VAR_postmark_api_token at apply time.
resource "aws_secretsmanager_secret" "postmark_api_token" {
  name       = "unifolio-${var.environment}-postmark-api-token"
  kms_key_id = aws_kms_key.rds_and_secrets.arn

  tags = merge(local.common_tags, {
    Name = "${var.environment}-postmark-api-token"
  })
}

resource "aws_secretsmanager_secret_version" "postmark_api_token" {
  secret_id     = aws_secretsmanager_secret.postmark_api_token.id
  secret_string = var.postmark_api_token
}
```

Add to `infra/modules/security/variables.tf`:

```hcl
variable "pan_encryption_key" {
  description = "Base64-encoded 32-byte PAN encryption key. Supply via TF_VAR_pan_encryption_key, never in a file."
  type        = string
  sensitive   = true
}

variable "pan_lookup_pepper" {
  description = "Base64-encoded 32-byte PAN lookup-hash pepper. Supply via TF_VAR_pan_lookup_pepper, never in a file."
  type        = string
  sensitive   = true
}

variable "postmark_api_token" {
  description = "Postmark server API token. Supply via TF_VAR_postmark_api_token, never in a file."
  type        = string
  sensitive   = true
}
```

Add to `infra/modules/security/outputs.tf`:

```hcl
output "pan_keys_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the PAN encryption key + lookup pepper (JSON)."
  value       = aws_secretsmanager_secret.pan_keys.arn
}

output "postmark_api_token_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the Postmark API token."
  value       = aws_secretsmanager_secret.postmark_api_token.arn
}
```

Now resolve the stale comment this plan makes obsolete. In `infra/modules/security/main.tf`, replace:

```hcl
  # Phase 3 must grant the ECS task execution role kms:Decrypt,
  # kms:GenerateDataKey, and kms:DescribeKey on this key ARN.
```

with:

```hcl
  # Phase 3 granted the ECS task execution role kms:Decrypt, kms:GenerateDataKey,
  # and kms:DescribeKey on this key ARN via
  # infra/modules/backend's aws_iam_role_policy.ecs_secrets_read (renamed from
  # rds_master_secret_read once its scope grew to cover the pan_keys and
  # postmark_api_token secrets below, not just the RDS master secret).
```

### A3. New variables on `infra/modules/backend/variables.tf`

Add:

```hcl
variable "pan_keys_secret_arn" {
  description = "ARN of the Secrets Manager secret holding PAN_ENCRYPTION_KEY/PAN_LOOKUP_PEPPER."
  type        = string
}

variable "postmark_api_token_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the Postmark API token."
  type        = string
}

variable "cas_files_bucket_name" {
  description = "Name of the S3 bucket storing CAS PDF files (infra/modules/storage)."
  type        = string
}

variable "cas_files_bucket_arn" {
  description = "ARN of the S3 bucket storing CAS PDF files (infra/modules/storage)."
  type        = string
}

variable "otp_delivery_mode" {
  description = "OTP delivery mode. Stays \"stub\" until the Postmark Sender Signature is confirmed (Part C), then flips to \"postmark\" via this var -- no code/image change needed for that cutover."
  type        = string
  default     = "stub"
}

variable "email_delivery_mode" {
  description = "General email delivery mode (app/services/auth/email_provider.py). Same stub-until-Sender-Signature-confirmed cutover as otp_delivery_mode."
  type        = string
  default     = "stub"
}

variable "postmark_from_email" {
  description = "Verified Postmark Sender Signature address emails are sent from. Must match the address confirmed in Part C before flipping *_delivery_mode to \"postmark\"."
  type        = string
  default     = ""
}
```

**Deviation from the original plan, worth flagging explicitly:** the plan as first written hardcoded `EMAIL_DELIVERY_MODE = "postmark"` directly in A4c below (i.e. assumed Postmark would already be live by apply time) and never touched the pre-existing `OTP_DELIVERY_MODE` at all. The actual implementation instead makes **both** modes Terraform variables — this is still the right call even now that Postmark is confirmed working (2026-09-19: real test sends succeeded), because it means the cutover from `"stub"` to `"postmark"` never requires a code or image change, only a var value, regardless of when the Sender Signature happens to get (re)confirmed in the future. **Since the Sender Signature is already confirmed as of this update, there's no reason to default to `"stub"` and do a second follow-up apply** — Part D's Step 1 now exports `TF_VAR_otp_delivery_mode=postmark` / `TF_VAR_email_delivery_mode=postmark` directly, so the one apply in Step 5 goes live with real Postmark delivery immediately. The vars still default to `"stub"` in code (so a future re-apply without those exports set fails safe, not silently-live), but this run's actual values are `"postmark"`.

### A4. IAM + ECS task definition changes in `infra/modules/backend/main.tf`

**A4a. Extend the execution role's Secrets Manager read access** (it can already decrypt with the KMS key; it just can't call `GetSecretValue` on these two new secrets yet). Add a new statement to the existing `rds_master_secret_read` policy document — rename it in place since it now covers more than just the RDS secret:

Replace the `data "aws_iam_policy_document" "rds_master_secret_read"` block with:

```hcl
data "aws_iam_policy_document" "ecs_secrets_read" {
  statement {
    sid       = "ReadRDSMasterSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.master_user_secret_arn]
  }

  statement {
    sid       = "ReadAppSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.pan_keys_secret_arn, var.postmark_api_token_secret_arn]
  }

  statement {
    sid       = "DecryptSecretsWithSharedKey"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
  }
}
```

And rename the two places that reference the old name:

```hcl
resource "aws_iam_role_policy" "ecs_secrets_read" {
  name   = "ecs-secrets-read"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_secrets_read.json
}
```

(This is a rename, not a new resource — Terraform will show it as one delete + one create for the `aws_iam_role_policy`, which is safe since it's an inline policy being replaced, not the role itself.) Update both `depends_on` blocks (on `aws_ecs_task_definition.analytics_recompute` and `aws_ecs_task_definition.this`) from `aws_iam_role_policy.rds_master_secret_read` to `aws_iam_role_policy.ecs_secrets_read`.

**A4b. Grant `backend_task` (the runtime role) S3 + KMS access** — this is the actually-new grant. Add after the existing `backend_task` policy document:

```hcl
data "aws_iam_policy_document" "backend_task_cas_files" {
  statement {
    sid       = "ReadWriteCasFiles"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.cas_files_bucket_arn}/*"]
  }

  statement {
    sid       = "ListCasFilesBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.cas_files_bucket_arn]
  }

  statement {
    sid       = "UseSharedKeyForCasFiles"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "backend_task_cas_files" {
  name   = "backend-task-cas-files"
  role   = aws_iam_role.backend_task.id
  policy = data.aws_iam_policy_document.backend_task_cas_files.json
}
```

**A4c. Add the new env vars + secrets to the request-serving task definition** — `aws_ecs_task_definition.this` only (not `analytics_recompute`, which never touches imports or sends email). In its `environment` list, add (also changing the pre-existing `OTP_DELIVERY_MODE` entry from a hardcoded `"stub"` literal to `var.otp_delivery_mode`, for the same var-based-cutover reason as `EMAIL_DELIVERY_MODE` — see the deviation note in A3):

```hcl
        { name = "OTP_DELIVERY_MODE", value = var.otp_delivery_mode },
        { name = "EMAIL_DELIVERY_MODE", value = var.email_delivery_mode },
        { name = "POSTMARK_FROM_EMAIL", value = var.postmark_from_email },
        { name = "CAS_FILE_STORAGE_BACKEND", value = "s3" },
        { name = "CAS_FILES_BUCKET_NAME", value = var.cas_files_bucket_name },
```

In its `secrets` list, alongside the existing `DB_PASSWORD` entry, add:

```hcl
        {
          name      = "PAN_ENCRYPTION_KEY"
          valueFrom = "${var.pan_keys_secret_arn}:PAN_ENCRYPTION_KEY::"
        },
        {
          name      = "PAN_LOOKUP_PEPPER"
          valueFrom = "${var.pan_keys_secret_arn}:PAN_LOOKUP_PEPPER::"
        },
        {
          name      = "POSTMARK_API_TOKEN"
          valueFrom = var.postmark_api_token_secret_arn
        }
```

(The `:key::` suffix pulls one field out of a JSON secret, same syntax already used for `:password::` on the RDS secret. `POSTMARK_API_TOKEN`'s secret is a plain string, not JSON, so it has no suffix.)

Update this task definition's `depends_on` to also include `aws_iam_role_policy.backend_task_cas_files`.

### A5. Wire it together in `infra/envs/staging/main.tf`

Add a new module block (after `module "database"`, before `module "backend"`):

```hcl
module "storage" {
  source = "../../modules/storage"

  environment = var.environment
  project     = var.project
  account_id  = data.aws_caller_identity.current.account_id
  kms_key_arn = module.security.kms_key_arn
}
```

(`data "aws_caller_identity" "current"` already exists further down this file, at line 81, and is reused as-is — Terraform resolves references via its dependency graph, not textual file order, so nothing needs to move for this to work, even though the data source is declared after this new module block.)

Update the `module "security"` block to pass the three new sensitive variables:

```hcl
module "security" {
  source = "../../modules/security"

  environment = var.environment
  project     = var.project

  pan_encryption_key = var.pan_encryption_key
  pan_lookup_pepper  = var.pan_lookup_pepper
  postmark_api_token = var.postmark_api_token
}
```

Add matching pass-through variables to `infra/envs/staging/variables.tf`:

```hcl
variable "pan_encryption_key" {
  description = "Base64-encoded 32-byte AES key for PAN envelope encryption. Supply via TF_VAR_pan_encryption_key -- never commit to a .tfvars file."
  type        = string
  sensitive   = true
}

variable "pan_lookup_pepper" {
  description = "Base64-encoded 32-byte pepper for the PAN lookup-hash HMAC. Supply via TF_VAR_pan_lookup_pepper -- never commit to a .tfvars file."
  type        = string
  sensitive   = true
}

variable "postmark_api_token" {
  description = "Postmark server API token for outbound OTP email. Supply via TF_VAR_postmark_api_token -- never commit to a .tfvars file."
  type        = string
  sensitive   = true
}

variable "otp_delivery_mode" {
  type    = string
  default = "stub"
}

variable "email_delivery_mode" {
  type    = string
  default = "stub"
}

variable "postmark_from_email" {
  type    = string
  default = ""
}
```

Update the `module "backend"` block to pass the new variables:

```hcl
  cas_files_bucket_name         = module.storage.bucket_name
  cas_files_bucket_arn          = module.storage.bucket_arn
  pan_keys_secret_arn           = module.security.pan_keys_secret_arn
  postmark_api_token_secret_arn = module.security.postmark_api_token_secret_arn
  otp_delivery_mode             = var.otp_delivery_mode
  email_delivery_mode           = var.email_delivery_mode
  postmark_from_email           = var.postmark_from_email
```

Update the `module "scheduler"` block to pass through the two new variables it needs for the CAS-file expiry job (see gap #3 below):

```hcl
  backend_task_role_arn = module.backend.backend_task_role_arn
  cas_files_bucket_name = module.storage.bucket_name
```

This requires a new `backend_task_role_arn` output on `infra/modules/backend/outputs.tf`:

```hcl
output "backend_task_role_arn" {
  description = "ARN of the backend task role -- reused by the scheduled CAS-file expiry job so it can delete S3 objects without a second S3/KMS policy."
  value       = aws_iam_role.backend_task.arn
}
```

### A6. Schedule the CAS-file expiry sweep — `infra/modules/scheduler/`

**This section did not exist in the original plan** — the 2026-09-18 PAN/CAS design explicitly deferred wiring `app/scripts/expire_cas_files.py` to a real scheduler ("out of scope for that pass"). Left undone, the S3 bucket's 30-day lifecycle rule (A1) would eventually delete objects, but the matching `imports.file_reference`/`file_expires_at` DB rows would never get cleaned up — a silent, permanent drift between Postgres and S3. Fixing that gap here.

Add a new job to the `local.jobs` map in `infra/modules/scheduler/main.tf`:

```hcl
cas_file_expiry_daily = {
  slug                = "cas-file-expiry-daily"
  command             = ["python", "-m", "app.scripts.expire_cas_files"]
  schedule_expression = "cron(0 19 * * ? *)"
  task_role_arn       = var.backend_task_role_arn
}
```

This is the first scheduled job that needs a `task_role_arn` at all (every existing job — `nav_daily`, `benchmark_daily`, `ter_monthly`, `aaum_quarterly`, `analytics_recompute_daily`, `account_deletion_daily` — only ever needed the shared execution role, since none of them make runtime AWS SDK calls). `expire_stored_files()` calls `S3FileStorage.delete()`, which needs real S3 permissions, so every job entry in the map now carries an explicit `task_role_arn` field (`null` for the six pre-existing jobs, `var.backend_task_role_arn` for this one) — reusing `backend_task`'s existing role rather than minting a new one, since it's already scoped to exactly the S3 + KMS actions this job needs (A4b).

Because only one job sets a non-null `task_role_arn`, the scheduler's own IAM role needs an extra grant to be allowed to pass that role to ECS:

```hcl
  statement {
    sid       = "PassCasFileExpiryTaskRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.backend_task_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
```

Add `backend_task_role_arn` and `cas_files_bucket_name` to `infra/modules/scheduler/variables.tf` (plain `string`, no default), thread `task_role_arn = each.value.task_role_arn` onto `aws_ecs_task_definition.jobs`, and add `{ name = "CAS_FILE_STORAGE_BACKEND", value = "s3" }` / `{ name = "CAS_FILES_BUCKET_NAME", value = var.cas_files_bucket_name }` to every job's shared `environment` block (a harmless no-op for the jobs that don't touch S3). This env-var change is why the plan in Part D below shows **all six pre-existing job task definitions being replaced**, not just a new seventh one added — every job's container definition changes, forcing a new revision, even though only `cas_file_expiry_daily` actually uses the new values.

**Also confirm the invocation matches**: `backend/app/scripts/expire_cas_files.py` already exists (written when the PAN/CAS design was implemented, just never scheduled) and is invoked as `python -m app.scripts.expire_cas_files` — matching the `command` above exactly, since the Dockerfile's `WORKDIR /app` + `COPY app ./app` makes `app` a top-level importable package inside the container.

---

## Part B — Application code changes

**Only one new class is needed.** PAN keys and the Postmark token need *zero* code changes — `EnvVarKeyProvider` (`backend/app/services/import_/crypto.py`) already reads `PAN_ENCRYPTION_KEY`/`PAN_LOOKUP_PEPPER` from environment variables, and `postmark_api_token`/`postmark_from_email` (`backend/app/config.py`) already read from env too. ECS's `secrets` block (Part A4c) makes a Secrets-Manager-sourced value appear as a plain environment variable to the running container — indistinguishable from a local `.env` file to the Python code reading it. The only thing that genuinely can't work through an env var alone is "write these bytes to S3," which needs real API calls.

### B1. `backend/app/config.py` — two new settings

Add alongside the existing `cas_file_storage_dir` setting:

```python
    cas_file_storage_backend: str = "local"  # "local" | "s3"
    cas_files_bucket_name: str = ""
```

### B2. `backend/app/services/import_/file_storage.py` — add `S3FileStorage`

Add after the `LocalFileStorage` class:

```python
class S3FileStorage:
    def __init__(self, bucket_name: str | None = None):
        import boto3

        self._bucket_name = bucket_name if bucket_name is not None else settings.cas_files_bucket_name
        self._client = boto3.client("s3")

    def save(self, key: str, data: bytes) -> str:
        self._client.put_object(Bucket=self._bucket_name, Key=key, Body=data)
        return key

    def read(self, reference: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket_name, Key=reference)
        return response["Body"].read()

    def delete(self, reference: str) -> None:
        self._client.delete_object(Bucket=self._bucket_name, Key=reference)
```

Replace the single line `default_file_storage = LocalFileStorage()` with a small factory, so the choice is made once at import time based on the deployed environment's settings, exactly like every other environment-driven singleton in this codebase:

```python
def _build_default_file_storage() -> FileStorage:
    if settings.cas_file_storage_backend == "s3":
        return S3FileStorage()
    return LocalFileStorage()


default_file_storage = _build_default_file_storage()
```

`boto3` is already a backend dependency (used by `app/services/analytics/dispatch.py` for ECS `RunTask`) — no new dependency to add.

### B3. Tests — `backend/tests/services/import_/test_file_storage.py`

Add, mocking `boto3` rather than hitting real AWS:

```python
from unittest.mock import MagicMock, patch

from app.services.import_.file_storage import S3FileStorage


def test_s3_file_storage_save_calls_put_object():
    with patch("boto3.client") as mock_client_factory:
        mock_client = MagicMock()
        mock_client_factory.return_value = mock_client
        storage = S3FileStorage(bucket_name="test-bucket")

        result = storage.save("user1/import1.pdf", b"pdf-bytes")

        mock_client.put_object.assert_called_once_with(
            Bucket="test-bucket", Key="user1/import1.pdf", Body=b"pdf-bytes"
        )
        assert result == "user1/import1.pdf"


def test_s3_file_storage_read_returns_body_bytes():
    with patch("boto3.client") as mock_client_factory:
        mock_client = MagicMock()
        mock_body = MagicMock()
        mock_body.read.return_value = b"pdf-bytes"
        mock_client.get_object.return_value = {"Body": mock_body}
        mock_client_factory.return_value = mock_client
        storage = S3FileStorage(bucket_name="test-bucket")

        result = storage.read("user1/import1.pdf")

        mock_client.get_object.assert_called_once_with(Bucket="test-bucket", Key="user1/import1.pdf")
        assert result == b"pdf-bytes"


def test_s3_file_storage_delete_calls_delete_object():
    with patch("boto3.client") as mock_client_factory:
        mock_client = MagicMock()
        mock_client_factory.return_value = mock_client
        storage = S3FileStorage(bucket_name="test-bucket")

        storage.delete("user1/import1.pdf")

        mock_client.delete_object.assert_called_once_with(Bucket="test-bucket", Key="user1/import1.pdf")
```

Run: `cd backend && pytest tests/services/import_/test_file_storage.py -v` — all tests (existing + these 3 new) should pass without any AWS credentials configured, since `boto3.client` is mocked.

---

## Part C — The one manual, non-Terraform step

Confirm Postmark's Sender Signature for the address that will be `postmark_from_email` (the `TF_VAR_postmark_from_email` value in Part D):

1. Log into `account.postmarkapp.com`.
2. **Sender Signatures** → **Add Sender Signature** → enter the exact address and a display name.
3. Postmark emails a confirmation link to that address (it lands in the existing Microsoft 365 mailbox — no DNS/Route 53 change needed).
4. Whoever owns that mailbox clicks the link. Signature shows "Confirmed."

**2026-09-19 update: done — two separate steps happened, not one.**

**Step 1 (single Sender Signature):** confirmed `aditi.shanbhag@unifolio.in` via Postmark's email-click flow (`signatures.postmarkapp.com/confirm/success-first`) — this alone would only authorize that one address.

**Step 2 (Domain Signature, done afterward):** added two DNS records to Route 53, verified via direct DNS lookup (not just trusting the Postmark dashboard):
- DKIM TXT record: `20260917063050pm._domainkey.unifolio.in`
- Return-Path CNAME: `pm-bounces.unifolio.in` → `pm.mtasv.net`

Postmark's `account.postmarkapp.com/signature_domains/8114367` → DNS Settings page shows both as **Verified**, and — decisively — a third status card titled **"Send from any address," status Active**, reading: *"Excellent, your domain is verified! We enabled the ability to send from any email address on this domain when you added and verified a DKIM DNS record."* That card is Postmark's own statement that the grant is domain-wide, not address-locked; the `._domainkey` hostname itself is a domain-level DKIM key, not tied to one mailbox.

Practical effect: `postmark_from_email` can be **any** address `@unifolio.in`.

```
TF_VAR_postmark_from_email="aditi.shanbhag@unifolio.in"
```

This deployment uses `aditi.shanbhag@unifolio.in` specifically (a real inbox someone owns), but that's a choice, not a constraint — any other `@unifolio.in` address works too, per Postmark's own "send from any address" confirmation. Part D's apply goes live with real Postmark delivery directly — no separate flip-and-reapply step (see the A3 deviation note above).

---

## Part D — Runbook

**Current real state, confirmed this session (not assumed):** Phase 0-3 Terraform (networking, security, database, ECR, backend) is already applied and live in `ap-south-1` — a real VPC, RDS instance, ECS cluster/service, and ALB exist, serving traffic today. This plan's changes are an **incremental apply on top of that live state**, not a from-scratch bootstrap. `terraform plan` (run read-only this session, not applied) against the real remote state shows **21 to add, 8 to change, 8 to destroy** — the 8 destroys are all old ECS task-definition revisions and one renamed IAM inline policy being replaced, never the RDS instance, VPC, or ECS cluster/service themselves. The backend's ECR `:latest` tag currently points at commit `b972e65` (pushed 2026-09-11) — 8 days and the entire PAN/CAS/Postmark/Fund-Score body of work stale relative to this branch's current `HEAD`, so a fresh image build/push is a real, necessary step here (gap #2), not a formality. Secrets Manager and S3 currently have none of this plan's new resources (`pan-keys`, `postmark-api-token` secrets, the `cas-files` bucket) — confirming Part A hasn't been applied yet.

Six ordered steps, each with a reason it has to be in this position relative to the others:

**D1. Generate the PAN key values and gather the other secrets, before touching Terraform.**

```bash
python3 -c "import base64, os; print(base64.b64encode(os.urandom(32)).decode())"
python3 -c "import base64, os; print(base64.b64encode(os.urandom(32)).decode())"
```

Run it twice — the two outputs must differ (one is `PAN_ENCRYPTION_KEY`, one is `PAN_LOOKUP_PEPPER`; reusing one value for both defeats the point of keeping them separate). Then, in the shell that will run every command below — **never write any of these to a `.tfvars` file**:

```bash
export TF_VAR_pan_encryption_key="<first value above>"
export TF_VAR_pan_lookup_pepper="<second value above>"
export TF_VAR_postmark_api_token="<the real Postmark server API token>"
export TF_VAR_postmark_from_email="aditi.shanbhag@unifolio.in"
export TF_VAR_otp_delivery_mode="postmark"
export TF_VAR_email_delivery_mode="postmark"
```

Per the 2026-09-19 update to Part C, Postmark is going live in this apply, not a follow-up one — hence both delivery-mode vars are set to `"postmark"` here instead of left at their `"stub"` default.

**D2. Run migrations `0012`→`0015` against the real RDS instance, before any new code that assumes the new schema goes live.** The real instance is currently at `0011` (confirmed `alembic current` during the 2026-09-09 apply session; nothing has migrated it since). Via the SSM bastion tunnel, the same pattern already used for the initial schema migration:

```bash
aws ssm start-session \
  --target i-0b67d40d9b58b7814 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["staging-rds.ctu88scmut9m.ap-south-1.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["5433"]}'
```

In a second terminal, fetch the master password from Secrets Manager (route it through `os.environ`, never a literal string — the real password contains `$` characters that bash will silently mangle inside a double-quoted literal):

```bash
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'rds!db-')].Name" --output text)" \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")

cd backend
DATABASE_URL="postgresql://unifolio:${PGPASSWORD}@localhost:5433/unifolio" .venv/bin/alembic upgrade head
DATABASE_URL="postgresql://unifolio:${PGPASSWORD}@localhost:5433/unifolio" .venv/bin/alembic current   # confirm 0015 (head)
```

**D3. Build and push the current codebase's image to ECR, so the `:latest` tag stops pointing at 8-day-old code before anything redeploys against it.**

```bash
cd backend
docker build -t unifolio-staging-backend .
# If the build fails with "error from sender: failed to xattr .pytest_tmp: permission denied",
# a stale backend/.pytest_tmp dir with broken 9p permissions is the cause even though
# it's .dockerignore'd (BuildKit still stats every path during its context walk):
#   sudo rm -rf .pytest_tmp
# then re-run the build.

aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin 811364789032.dkr.ecr.ap-south-1.amazonaws.com

docker tag unifolio-staging-backend:latest \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
docker push 811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```

Pushing doesn't redeploy anything by itself — the running ECS task keeps serving on the old image until D5 below.

**D4. Apply the Terraform.**

```bash
cd infra/envs/staging
terraform init      # only needed the first time, or after adding the new storage module
terraform plan
```

Read the plan output. Expect (confirmed by an actual read-only `terraform plan` against the live remote state this session): **21 to add** (the new `module.storage` bucket + its 4 sub-resources, `module.security`'s 2 new secrets + 2 versions, the new `backend_task_cas_files` IAM policy, the new `cas_file_expiry_daily` scheduler job's log group/task def/schedule, the new `PassCasFileExpiryTaskRole` statement), **8 to change** (the ECS service's in-place update, the scheduler's own IAM role policy, and the 6 pre-existing schedule resources picking up their new task-def ARN), **8 to destroy** (the old `ecs_secrets_read`-renamed-from-`rds_master_secret_read` policy, the backend's old task-def revision, and 6 old scheduler-job task-def revisions — all replaced, not deleted-and-gone; ECS keeps every revision's history). **If the plan shows anything touching the RDS instance, VPC, ECS cluster, or ECS *service* resource being destroyed (as opposed to updated in-place) — stop and don't apply**, that's not this plan's doing.

```bash
terraform apply
```

Applying updates `aws_ecs_service.this` to reference the new task-definition revision, which — combined with the fresh image pushed in D3 — triggers ECS to start rolling out the new deployment immediately. This is also true for all 6 pre-existing scheduler jobs (their task defs pick up the new `CAS_FILE_STORAGE_BACKEND`/`CAS_FILES_BUCKET_NAME` env vars — harmless for jobs that don't touch S3 — so every one of them gets a new revision even though only `cas_file_expiry_daily` needed the change; they only actually run at their next scheduled fire time, no immediate action).

**D5. Watch the deployment live — this is the mitigation for the real risk in this apply, not an optional nicety.** `aws_ecs_service.this` runs with `deployment_minimum_healthy_percent = 0` / `deployment_maximum_percent = 100` (a deliberate, pre-existing tradeoff — `AWS Readiness/aws-golive-launch-blockers.md` requires stop-then-start deploys while the app relies on single-process in-memory state), which means the **old task is stopped before the new one is confirmed healthy** — there is a window with zero running tasks even on a normal deploy. Combine that with this plan's new PAN-key startup dependency: if `PAN_ENCRYPTION_KEY`/`PAN_LOOKUP_PEPPER` are wrong, missing, or the execution role can't read the new secrets (a typo in `TF_VAR_pan_encryption_key`, an IAM policy that didn't attach correctly), the new task can crash-loop on boot, and — because the old task is already gone — that's a full outage, not a degraded one, until someone notices and rolls back. So, immediately after `terraform apply` returns:

```bash
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount,deployments:deployments[].{status:status,rolloutState:rolloutState}}"'
```

and in another terminal:

```bash
aws logs tail /ecs/staging-backend --follow
curl -s https://staging-api.unifolio.in/health
```

Don't move on until `runningCount == desiredCount`, `rolloutState: COMPLETED`, and the logs show clean startup with no repeated crash/restart cycles. **If it's crash-looping:** roll back by re-pointing the service at the previous known-good task-definition revision (`aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend --task-definition unifolio-staging-backend:2` — revision `2` is the one confirmed healthy as of this session; check the actual previous revision number if more applies have landed since), then diagnose the secret/IAM issue with Terraform still applied (rolling back the service doesn't require `terraform destroy`).

**D6. One-off job run, then full smoke tests.**

Run the new expiry job once manually rather than waiting for its first 19:00 IST cron fire, to confirm it works before trusting it unattended:

```bash
aws ecs run-task --cluster unifolio-staging \
  --task-definition unifolio-staging-job-cas-file-expiry-daily \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<private-app-subnet-ids>],securityGroups=[<ecs-security-group-id>],assignPublicIp=DISABLED}"
```

(`terraform output` on `infra/envs/staging`'s `networking` output block has the exact subnet/security-group IDs.) Then:

1. `terraform output cas_files_bucket_name` → `aws s3 ls s3://<that name>/` (empty right after creation).
2. Do a real CAS import against `https://staging.unifolio.in`, then `aws s3 ls s3://<cas-files-bucket-name>/ --recursive` — confirm a `<user_id>/<import_id>.pdf` object exists.
3. Exercise a real PAN encrypt/decrypt round-trip (an import containing a PAN; confirm the household-member record's PAN displays correctly after retrieval — proves the Secrets-Manager-sourced `PAN_ENCRYPTION_KEY`/`PAN_LOOKUP_PEPPER` are actually being read, not just present in the task def).
4. Exercise the cross-account-PAN-block and override-mismatch paths live (the feature this whole plan exists to support in the first place — commits `6de6ea7`/`7e1e400`), not just in the test suite.
5. OTP/email: `otp_delivery_mode`/`email_delivery_mode` are `"postmark"` from this apply (per D1's exports), so trigger a real sign-up directly and confirm the OTP email actually arrives, sent from `aditi.shanbhag@unifolio.in`. No separate flip-and-reapply step needed.
6. Fund Score card and the NAV-date fix: open a portfolio with holdings, confirm the redesigned card renders (tier progress bar, inline verdict, factor groups) and dates show `DD-MM-YYYY`. This only proves anything if **D7 below actually ran** first — these are frontend changes; rebuilding the backend image (D3) does not ship them.

**D7. Rebuild and deploy the frontend — a step this plan's earlier draft never covered.** Everything above (D1-D6) only rebuilds and redeploys the **backend**. `module.frontend`'s S3 bucket + CloudFront distribution are already live (confirmed this session), but nothing in D1-D6 pushes a new frontend build into that bucket — without this step, `staging.unifolio.in` keeps serving whatever static build was uploaded in the last manual deploy, regardless of what's on `HEAD` now (the Fund Score redesign, the NAV-date fix, and everything else merged into this branch since then). This is the same gap the 2026-09-11 prerequisites doc had as its own "Step 6" — this plan is folding it in properly this time.

```bash
cd "$REPO_ROOT/frontend"
VITE_API_BASE_URL=https://staging-api.unifolio.in npm run build
aws s3 sync dist/ "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw cloudfront_distribution_id)" \
  --paths "/*"
```

No `VITE_GOOGLE_OAUTH_CLIENT_ID` — deliberately left unset for staging, a pre-existing 2026-09-11 scope decision, unrelated to this push. CloudFront invalidation takes a couple of minutes to propagate; a hard-refresh (or wait) before checking item 6 above if the old build still appears to be serving.

**If something's wrong:** this apply doesn't touch or replace the RDS instance, VPC, or ECS cluster, so a bad apply here is recoverable by fixing the Terraform and re-applying, or `terraform destroy -target=module.storage` to remove just the new bucket if it needs to be redone. Don't run a bare `terraform destroy` — that would tear down the entire live staging environment, not just this plan's additions.
