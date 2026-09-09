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

variable "domain_name" {
  description = "Custom domain name served by the CloudFront distribution."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of the validated us-east-1 ACM certificate attached to CloudFront."
  type        = string
}
