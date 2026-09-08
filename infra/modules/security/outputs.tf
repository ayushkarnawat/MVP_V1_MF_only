output "kms_key_arn" {
  description = "ARN of the KMS key shared by RDS and Secrets Manager."
  value       = aws_kms_key.rds_and_secrets.arn
}

output "kms_key_id" {
  description = "ID of the KMS key shared by RDS and Secrets Manager."
  value       = aws_kms_key.rds_and_secrets.key_id
}
