variable "aws_region" {
  description = "Primary AWS region for the staging stack."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "staging"
}

variable "project" {
  description = "Project name used for resource tags."
  type        = string
  default     = "unifolio"
}

variable "google_oauth_client_id" {
  description = "Optional Google OAuth client ID for staging."
  type        = string
  default     = ""
}

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
  description = "OTP delivery mode passed to the backend task def. Stays \"stub\" until the Postmark Sender Signature is confirmed."
  type        = string
  default     = "stub"
}

variable "email_delivery_mode" {
  description = "General email delivery mode passed to the backend task def. Stays \"stub\" until the Postmark Sender Signature is confirmed."
  type        = string
  default     = "stub"
}

variable "postmark_from_email" {
  description = "Verified Postmark Sender Signature address. Set once Part C's confirmation is done."
  type        = string
  default     = ""
}

variable "ses_from_email" {
  description = "Verified SES identity address for the \"ses\" email delivery mode. Empty until Part 1 of the SES migration plan is done."
  type        = string
  default     = ""
}

variable "ses_identity_arn" {
  description = "ARN of the SES domain identity for unifolio.in, once verified (Part 1 of the SES migration plan). Empty disables the backend task's SES IAM permission entirely."
  type        = string
  default     = ""
}
