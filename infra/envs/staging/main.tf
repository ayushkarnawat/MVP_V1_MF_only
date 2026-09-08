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
