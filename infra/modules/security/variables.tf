variable "environment" {
  description = "Deployment environment name used for resource names and tags."
  type        = string
  default     = "staging"
}

variable "project" {
  description = "Project name used for resource tags."
  type        = string
  default     = "unifolio"
}

variable "deletion_window_in_days" {
  description = "Waiting period before a scheduled KMS key deletion."
  type        = number
  default     = 30
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
