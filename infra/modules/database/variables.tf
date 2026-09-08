variable "environment" {
  description = "Deployment environment name used for resource names."
  type        = string
}

variable "project" {
  description = "Project name used for resource descriptions."
  type        = string
}

variable "private_data_subnet_ids" {
  description = "Private data subnet IDs used by the RDS subnet group."
  type        = list(string)
}

variable "rds_security_group_id" {
  description = "Security group ID that controls access to the RDS instance."
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the customer-managed KMS key used to encrypt RDS storage and its managed master secret."
  type        = string
}
