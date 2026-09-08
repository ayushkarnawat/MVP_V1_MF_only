output "db_endpoint" {
  description = "RDS endpoint including host and port."
  value       = aws_db_instance.this.endpoint
}

output "db_address" {
  description = "RDS endpoint hostname without the port."
  value       = aws_db_instance.this.address
}

output "db_port" {
  description = "Port on which PostgreSQL accepts connections."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Name of the PostgreSQL database created on the RDS instance."
  value       = aws_db_instance.this.db_name
}

output "master_user_secret_arn" {
  description = "ARN of the RDS-managed Secrets Manager secret for the master user."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}
