output "bucket_name" {
  description = "Name of the S3 bucket storing CAS PDF files."
  value       = aws_s3_bucket.cas_files.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket storing CAS PDF files."
  value       = aws_s3_bucket.cas_files.arn
}
