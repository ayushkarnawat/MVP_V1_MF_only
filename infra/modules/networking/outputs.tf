output "vpc_id" {
  description = "ID of the staging VPC."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs in availability_zones order."
  value       = [for availability_zone in var.availability_zones : aws_subnet.public[availability_zone].id]
}

output "private_app_subnet_ids" {
  description = "Private application subnet IDs in availability_zones order."
  value       = [for availability_zone in var.availability_zones : aws_subnet.private_app[availability_zone].id]
}

output "private_data_subnet_ids" {
  description = "Private data subnet IDs in availability_zones order."
  value       = [for availability_zone in var.availability_zones : aws_subnet.private_data[availability_zone].id]
}

output "alb_security_group_id" {
  description = "Security group ID for the future application load balancer."
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "Security group ID for future ECS tasks."
  value       = aws_security_group.ecs.id
}

output "rds_security_group_id" {
  description = "Security group ID for the future RDS instance."
  value       = aws_security_group.rds.id
}

output "bastion_security_group_id" {
  description = "Security group ID for the SSM-only bastion."
  value       = aws_security_group.bastion.id
}

output "fck_nat_security_group_id" {
  description = "Security group ID for the fck-nat appliance."
  value       = aws_security_group.fck_nat.id
}

output "fck_nat_instance_id" {
  description = "EC2 instance ID of the fck-nat appliance."
  value       = aws_instance.fck_nat.id
}

output "fck_nat_network_interface_id" {
  description = "Network interface ID used as the private application default-route target."
  value       = aws_network_interface.fck_nat.id
}

output "bastion_instance_id" {
  description = "EC2 instance ID of the SSM-only bastion."
  value       = aws_instance.bastion.id
}
