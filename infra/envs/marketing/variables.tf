variable "aws_region" {
  description = "Primary AWS region for the marketing stack."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment name used for resource names."
  type        = string
  default     = "marketing"
}

variable "project" {
  description = "Project name used for resource tags."
  type        = string
  default     = "unifolio"
}
