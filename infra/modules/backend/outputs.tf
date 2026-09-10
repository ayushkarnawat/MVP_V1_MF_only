output "alb_dns_name" {
  description = "DNS name of the staging backend Application Load Balancer."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the staging backend Application Load Balancer."
  value       = aws_lb.this.zone_id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster running the staging backend."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "Name of the ECS service running the staging backend."
  value       = aws_ecs_service.this.name
}

output "ecs_task_execution_role_arn" {
  description = "ARN of the IAM execution role used by the backend ECS task."
  value       = aws_iam_role.ecs_task_execution.arn
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster running the staging backend."
  value       = aws_ecs_cluster.this.arn
}
