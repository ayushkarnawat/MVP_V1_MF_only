variable "environment" {
  description = "Deployment environment name used for resource names."
  type        = string
}

variable "project" {
  description = "Project name used for resource names."
  type        = string
}

variable "aws_region" {
  description = "AWS region used by the ECS awslogs configuration."
  type        = string
}

variable "vpc_id" {
  description = "VPC in which the ALB target group is created."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the internet-facing ALB."
  type        = list(string)
}

variable "private_app_subnet_ids" {
  description = "Private application subnet IDs for the Fargate service."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group ID for the ALB."
  type        = string
}

variable "ecs_security_group_id" {
  description = "Security group ID for the Fargate tasks."
  type        = string
}

variable "repository_url" {
  description = "ECR repository URL containing the backend image."
  type        = string
}

variable "image_tag" {
  description = "Backend image tag. The latest default is temporary until Phase 7 CI/CD supplies immutable tags."
  type        = string
  default     = "latest"
}

variable "master_user_secret_arn" {
  description = "ARN of the RDS-managed master-user secret."
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the customer-managed KMS key encrypting the RDS-managed secret."
  type        = string
}

variable "db_address" {
  description = "RDS endpoint hostname without the port."
  type        = string
}

variable "db_port" {
  description = "Port on which PostgreSQL accepts connections."
  type        = number
}

variable "db_name" {
  description = "PostgreSQL database name."
  type        = string
}

variable "google_oauth_client_id" {
  description = "Optional Google OAuth client ID for staging."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of the validated ACM certificate attached to the ALB HTTPS listener."
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

variable "pan_keys_secret_arn" {
  description = "ARN of the Secrets Manager secret holding PAN_ENCRYPTION_KEY/PAN_LOOKUP_PEPPER."
  type        = string
}

variable "otp_delivery_mode" {
  description = "Phone/SMS OTP delivery mode. Stays \"stub\" until a real SMS provider is chosen and wired in."
  type        = string
  default     = "stub"
}

variable "email_delivery_mode" {
  description = "General email delivery mode (app/services/auth/email_provider.py). \"stub\" or \"ses\"."
  type        = string
  default     = "stub"
}

variable "ses_from_email" {
  description = "Verified SES identity address emails are sent from once EMAIL_DELIVERY_MODE is set to \"ses\". Must belong to a domain verified in SES (see Docs/superpowers/plans/2026-09-21-ses-email-provider-migration.md Part 1)."
  type        = string
  default     = ""
}

variable "ses_identity_arn" {
  description = "ARN of the verified SES domain identity the backend task role is allowed to send from, e.g. arn:aws:ses:<region>:<account_id>:identity/unifolio.in. Empty disables the backend task's SES IAM permission entirely (see Part 1 of the SES migration plan)."
  type        = string
  default     = ""
}
