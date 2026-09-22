output "s3_bucket_name" {
  description = "Name of the private S3 bucket to sync the marketing site's static export into."
  value       = module.frontend.s3_bucket_name
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution to invalidate after each deploy."
  value       = module.frontend.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name serving the marketing site."
  value       = module.frontend.cloudfront_domain_name
}
