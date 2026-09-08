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
