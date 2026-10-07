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

variable "backend_task_role_arn" {
  description = "ARN of the backend task role, reused by cas_file_expiry_daily so it can delete S3 objects."
  type        = string
}

variable "cas_files_bucket_name" {
  description = "Name of the S3 bucket storing CAS PDF files (infra/modules/storage)."
  type        = string
}

# Night-stop automation (Scenario A, 9PM-5AM IST) -- not part of the existing
# local.jobs RunTask pattern above, since these call ecs:UpdateService /
# rds:Stop-StartDBInstance / ec2:Stop-StartInstances directly via EventBridge
# Scheduler "universal targets" rather than launching a task.
variable "ecs_cluster_name" {
  description = "Name of the ECS cluster running the staging backend (for ecs:UpdateService calls)."
  type        = string
}

variable "ecs_service_name" {
  description = "Name of the ECS service running the staging backend (for ecs:UpdateService calls)."
  type        = string
}

variable "ecs_service_arn" {
  description = "ARN of the ECS service running the staging backend, for scoping the scheduler IAM policy."
  type        = string
}

variable "db_instance_id" {
  description = "RDS instance identifier (staging-rds), for rds:Stop/StartDBInstance calls."
  type        = string
}

variable "db_instance_arn" {
  description = "ARN of the RDS instance, for scoping the scheduler IAM policy."
  type        = string
}

variable "fck_nat_instance_id" {
  description = "EC2 instance ID of the fck-nat appliance, for ec2:Stop/StartInstances calls."
  type        = string
}

variable "bastion_instance_id" {
  description = "EC2 instance ID of the SSM-only bastion, for the 9PM stop-only safety net (no auto-start -- on-demand access only)."
  type        = string
}

variable "account_id" {
  description = "AWS account ID, for constructing the fck-nat EC2 instance ARN."
  type        = string
}

variable "alert_emails" {
  description = "Email addresses subscribed to the RDS-availability SNS topic."
  type        = list(string)
}
