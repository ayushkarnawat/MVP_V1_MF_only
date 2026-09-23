data "aws_caller_identity" "current" {}

locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project
  }
}

data "aws_iam_policy_document" "kms" {
  statement {
    sid    = "EnableAccountIAMDelegation"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    actions   = ["kms:*"]
    resources = ["*"]
  }
}

resource "aws_kms_key" "rds_and_secrets" {
  description             = "Unifolio ${var.environment} - RDS and Secrets Manager encryption-at-rest"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms.json

  # Phase 3 granted the ECS task execution role kms:Decrypt, kms:GenerateDataKey,
  # and kms:DescribeKey on this key ARN via
  # infra/modules/backend's aws_iam_role_policy.ecs_secrets_read (renamed from
  # rds_master_secret_read once its scope grew to cover the pan_keys
  # secret below, not just the RDS master secret).
  tags = merge(local.common_tags, {
    Name = "${var.environment}-rds-secrets-cmk"
  })
}

resource "aws_kms_alias" "rds_and_secrets" {
  name          = "alias/unifolio-${var.environment}-cmk"
  target_key_id = aws_kms_key.rds_and_secrets.key_id
}

# PAN envelope-encryption keys (ADR-004 reopened 2026-09-18). Both values are
# generated locally (see runbook) and passed in as TF_VAR_* env vars, never
# written to a .tfvars file -- see Docs/2026-09-19-cas-s3-postmark-secrets-infra.md Part D.
resource "aws_secretsmanager_secret" "pan_keys" {
  name       = "${var.project}-${var.environment}-pan-keys"
  kms_key_id = aws_kms_key.rds_and_secrets.arn
  tags       = local.common_tags
}

resource "aws_secretsmanager_secret_version" "pan_keys" {
  secret_id = aws_secretsmanager_secret.pan_keys.id
  secret_string = jsonencode({
    PAN_ENCRYPTION_KEY = var.pan_encryption_key
    PAN_LOOKUP_PEPPER  = var.pan_lookup_pepper
  })
}
