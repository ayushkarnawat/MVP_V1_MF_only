output "alb_dns_name" {
  description = "DNS name of the staging backend Application Load Balancer."
  value       = aws_lb.this.dns_name
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster running the staging backend."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "Name of the ECS service running the staging backend."
  value       = aws_ecs_service.this.name
}
