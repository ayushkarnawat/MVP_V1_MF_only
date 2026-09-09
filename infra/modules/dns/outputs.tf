output "frontend_acm_certificate_arn" {
  description = "ARN of the validated us-east-1 ACM certificate for the staging frontend."
  value       = aws_acm_certificate_validation.frontend.certificate_arn
}

output "backend_acm_certificate_arn" {
  description = "ARN of the validated primary-region ACM certificate for the staging backend."
  value       = aws_acm_certificate_validation.backend.certificate_arn
}
