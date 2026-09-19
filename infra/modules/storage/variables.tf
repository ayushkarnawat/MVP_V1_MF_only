variable "environment" {
  description = "Deployment environment name used for resource names."
  type        = string
}

variable "project" {
  description = "Project name used for resource names."
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the customer-managed KMS key used for the bucket's default SSE-KMS encryption."
  type        = string
}

variable "account_id" {
  description = "AWS account ID, appended to the bucket name -- S3 bucket names are unique across all of AWS, not just this account/region."
  type        = string
}
