# CAS-file S3 storage (Docs/2026-09-19-cas-s3-postmark-secrets-infra.md Part A1).
# Files are dispute/re-parse evidence, not the source of truth (parsed
# transactions already live in Postgres) -- 30-day lifecycle expiration here
# is the S3-side backstop; app/scripts/expire_cas_files.py (scheduled via
# infra/modules/scheduler) does the matching DB-row cleanup so
# imports.file_reference doesn't outlive the object it points to.

resource "aws_s3_bucket" "cas_files" {
  bucket = "${var.project}-${var.environment}-cas-files-${var.account_id}"
}

resource "aws_s3_bucket_versioning" "cas_files" {
  bucket = aws_s3_bucket.cas_files.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_public_access_block" "cas_files" {
  bucket = aws_s3_bucket.cas_files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
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
