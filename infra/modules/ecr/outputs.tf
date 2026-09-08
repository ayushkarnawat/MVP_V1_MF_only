output "repository_url" {
  description = "URL of the staging backend ECR repository."
  value       = aws_ecr_repository.this.repository_url
}

output "repository_arn" {
  description = "ARN of the staging backend ECR repository."
  value       = aws_ecr_repository.this.arn
}
