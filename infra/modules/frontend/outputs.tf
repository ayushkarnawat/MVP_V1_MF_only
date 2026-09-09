output "s3_bucket_name" {
  description = "Name of the private S3 bucket containing the built frontend assets."
  value       = aws_s3_bucket.this.bucket
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution serving the frontend."
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name serving the staging frontend."
  value       = aws_cloudfront_distribution.this.domain_name
}
