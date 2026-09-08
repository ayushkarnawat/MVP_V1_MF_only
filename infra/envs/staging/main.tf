module "networking" {
  source = "../../modules/networking"

  environment = var.environment
  project     = var.project

  vpc_cidr                  = "10.0.0.0/16"
  availability_zones        = ["ap-south-1a", "ap-south-1b"]
  public_subnet_cidrs       = ["10.0.0.0/24", "10.0.1.0/24"]
  private_app_subnet_cidrs  = ["10.0.10.0/24", "10.0.11.0/24"]
  private_data_subnet_cidrs = ["10.0.20.0/24", "10.0.21.0/24"]
}

module "security" {
  source = "../../modules/security"

  environment = var.environment
  project     = var.project
}

module "database" {
  source = "../../modules/database"

  environment             = var.environment
  project                 = var.project
  private_data_subnet_ids = module.networking.private_data_subnet_ids
  rds_security_group_id   = module.networking.rds_security_group_id
  kms_key_arn             = module.security.kms_key_arn
}

module "ecr" {
  source = "../../modules/ecr"
}

module "backend" {
  source = "../../modules/backend"

  environment = var.environment
  project     = var.project
  aws_region  = var.aws_region

  vpc_id                 = module.networking.vpc_id
  public_subnet_ids      = module.networking.public_subnet_ids
  private_app_subnet_ids = module.networking.private_app_subnet_ids
  alb_security_group_id  = module.networking.alb_security_group_id
  ecs_security_group_id  = module.networking.ecs_security_group_id
  repository_url         = module.ecr.repository_url
  master_user_secret_arn = module.database.master_user_secret_arn
  kms_key_arn            = module.security.kms_key_arn
  db_address             = module.database.db_address
  db_port                = module.database.db_port
  db_name                = module.database.db_name
  google_oauth_client_id = var.google_oauth_client_id
}

output "networking" {
  description = "Phase 1 networking outputs consumed by later phases."
  value = {
    vpc_id                       = module.networking.vpc_id
    public_subnet_ids            = module.networking.public_subnet_ids
    private_app_subnet_ids       = module.networking.private_app_subnet_ids
    private_data_subnet_ids      = module.networking.private_data_subnet_ids
    alb_security_group_id        = module.networking.alb_security_group_id
    ecs_security_group_id        = module.networking.ecs_security_group_id
    rds_security_group_id        = module.networking.rds_security_group_id
    bastion_security_group_id    = module.networking.bastion_security_group_id
    fck_nat_security_group_id    = module.networking.fck_nat_security_group_id
    fck_nat_instance_id          = module.networking.fck_nat_instance_id
    fck_nat_network_interface_id = module.networking.fck_nat_network_interface_id
    bastion_instance_id          = module.networking.bastion_instance_id
  }
}

output "kms_key_arn" {
  description = "KMS key ARN for Phase 2 RDS and Phase 3 Secrets Manager resources."
  value       = module.security.kms_key_arn
}

output "kms_key_id" {
  description = "KMS key ID for Phase 2 RDS and Phase 3 Secrets Manager resources."
  value       = module.security.kms_key_id
}

output "db_endpoint" {
  description = "RDS endpoint including host and port."
  value       = module.database.db_endpoint
}

output "db_address" {
  description = "RDS endpoint hostname without the port."
  value       = module.database.db_address
}

output "db_port" {
  description = "Port on which PostgreSQL accepts connections."
  value       = module.database.db_port
}

output "db_name" {
  description = "Name of the staging PostgreSQL database."
  value       = module.database.db_name
}

output "master_user_secret_arn" {
  description = "ARN of the RDS-managed Secrets Manager secret for the master user."
  value       = module.database.master_user_secret_arn
}

output "alb_dns_name" {
  description = "DNS name of the staging backend Application Load Balancer."
  value       = module.backend.alb_dns_name
}

output "ecs_cluster_name" {
  description = "Name of the staging backend ECS cluster."
  value       = module.backend.ecs_cluster_name
}

output "ecs_service_name" {
  description = "Name of the staging backend ECS service."
  value       = module.backend.ecs_service_name
}
