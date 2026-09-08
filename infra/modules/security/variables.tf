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
