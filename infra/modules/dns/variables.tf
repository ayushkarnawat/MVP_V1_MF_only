variable "zone_id" {
  description = "ID of the public Route 53 hosted zone containing the staging records."
  type        = string
}

variable "frontend_domain_name" {
  description = "Staging frontend domain name served by CloudFront."
  type        = string
}

variable "backend_domain_name" {
  description = "Staging backend domain name served by the Application Load Balancer."
  type        = string
}

variable "cloudfront_domain_name" {
  description = "CloudFront distribution domain name targeted by the frontend alias record."
  type        = string
}

variable "cloudfront_hosted_zone_id" {
  description = "CloudFront distribution hosted zone ID targeted by the frontend alias record."
  type        = string
}

variable "alb_dns_name" {
  description = "Application Load Balancer DNS name targeted by the backend alias record."
  type        = string
}

variable "alb_zone_id" {
  description = "Application Load Balancer hosted zone ID targeted by the backend alias record."
  type        = string
}
