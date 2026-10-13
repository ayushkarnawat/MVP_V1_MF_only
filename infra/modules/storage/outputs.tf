output "bucket_name" {
  description = "Name of the S3 bucket storing CAS PDF files."
  value       = aws_s3_bucket.cas_files.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket storing CAS PDF files."
  value       = aws_s3_bucket.cas_files.arn
}

output "portfolio_disclosure_archive_bucket_name" {
  description = "Name of the private failed portfolio-disclosure archive bucket."
  value       = aws_s3_bucket.portfolio_disclosure_failed.id
}

output "portfolio_disclosure_archive_bucket_arn" {
  description = "ARN of the private failed portfolio-disclosure archive bucket."
  value       = aws_s3_bucket.portfolio_disclosure_failed.arn
}
