variable "environment" {
  description = "Deployment environment name used for resource names."
  type        = string
}

variable "project" {
  description = "Project name used for resource names."
  type        = string
}

variable "account_id" {
  description = "AWS account ID used to make the frontend S3 bucket name globally unique."
  type        = string
}
