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

  # Phase 3 must grant the ECS task execution role kms:Decrypt,
  # kms:GenerateDataKey, and kms:DescribeKey on this key ARN.
  tags = merge(local.common_tags, {
    Name = "${var.environment}-rds-secrets-cmk"
  })
}

resource "aws_kms_alias" "rds_and_secrets" {
  name          = "alias/unifolio-${var.environment}-cmk"
  target_key_id = aws_kms_key.rds_and_secrets.key_id
}
