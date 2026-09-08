data "aws_rds_engine_version" "postgresql_16" {
  engine  = "postgres"
  version = "16"
  latest  = true
}

resource "aws_db_subnet_group" "this" {
  name        = "${var.environment}-rds-subnet-group"
  description = "Private data subnets for ${var.project} ${var.environment} RDS"
  subnet_ids  = var.private_data_subnet_ids
}

resource "aws_db_instance" "this" {
  identifier = "${var.environment}-rds"

  engine         = "postgres"
  engine_version = data.aws_rds_engine_version.postgresql_16.version_actual
  instance_class = "db.t4g.small"
  multi_az       = false

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_name                       = "unifolio"
  username                      = "unifolio"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = var.kms_key_arn

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.rds_security_group_id]
  publicly_accessible    = false

  backup_retention_period = 3
  backup_window           = "02:00-02:30"
  maintenance_window      = "sun:03:00-sun:04:00"

  apply_immediately   = true
  deletion_protection = false
  skip_final_snapshot = true
}
