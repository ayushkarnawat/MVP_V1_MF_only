variable "project" {
  description = "Project name used for resource names."
  type        = string
}

variable "environment" {
  description = "Deployment environment name used for resource names."
  type        = string
}

variable "aws_region" {
  description = "AWS region used by the ECS awslogs configuration."
  type        = string
}

variable "ecs_cluster_arn" {
  description = "ARN of the ECS cluster where scheduled tasks run."
  type        = string
}

variable "repository_url" {
  description = "ECR repository URL containing the backend image."
  type        = string
}

variable "image_tag" {
  description = "Backend image tag used by the scheduled job tasks."
  type        = string
}

variable "ecs_task_execution_role_arn" {
  description = "ARN of the existing ECS task execution role reused by scheduled jobs."
  type        = string
}

variable "master_user_secret_arn" {
  description = "ARN of the RDS-managed master-user secret."
  type        = string
}

variable "db_address" {
  description = "RDS endpoint hostname without the port."
  type        = string
}

variable "db_port" {
  description = "Port on which PostgreSQL accepts connections."
  type        = number
}

variable "db_name" {
  description = "PostgreSQL database name."
  type        = string
}

variable "private_app_subnet_ids" {
  description = "Private application subnet IDs for the scheduled Fargate tasks."
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID for the scheduled Fargate tasks."
  type        = string
}
