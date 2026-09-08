resource "aws_security_group" "alb" {
  name        = "${var.environment}-alb-sg"
  description = "Public ingress to the application load balancer"
  vpc_id      = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-alb-sg"
  })
}

resource "aws_security_group" "ecs" {
  name        = "${var.environment}-ecs-sg"
  description = "Traffic accepted by ECS application tasks"
  vpc_id      = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-ecs-sg"
  })
}

resource "aws_security_group" "rds" {
  name        = "${var.environment}-rds-sg"
  description = "PostgreSQL access from ECS and the SSM bastion"
  vpc_id      = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-rds-sg"
  })
}

resource "aws_security_group" "bastion" {
  name        = "${var.environment}-bastion-sg"
  description = "SSM-only bastion with no inbound access"
  vpc_id      = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-bastion-sg"
  })
}

resource "aws_security_group" "fck_nat" {
  name        = "${var.environment}-fck-nat-sg"
  description = "Forward traffic from private application subnets"
  vpc_id      = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-fck-nat-sg"
  })
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "Public HTTP for future redirect to HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-alb-http-ingress"
  })
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "Public HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-alb-https-ingress"
  })
}

resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward application traffic to ECS"
  referenced_security_group_id = aws_security_group.ecs.id
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-alb-to-ecs-egress"
  })
}

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "Application traffic from the ALB"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-ecs-from-alb-ingress"
  })
}

# Deliberate 2026-09-08 staging decision; see readiness report section 11.
resource "aws_vpc_security_group_egress_rule" "ecs_all" {
  security_group_id = aws_security_group.ecs.id
  description       = "Unrestricted staging egress for AWS services and external APIs"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-ecs-all-egress"
  })
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from ECS tasks"
  referenced_security_group_id = aws_security_group.ecs.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-rds-from-ecs-ingress"
  })
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_bastion" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from the SSM bastion"
  referenced_security_group_id = aws_security_group.bastion.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-rds-from-bastion-ingress"
  })
}

# Deliberate 2026-09-08 staging decision; see readiness report section 11.
resource "aws_vpc_security_group_egress_rule" "bastion_all" {
  security_group_id = aws_security_group.bastion.id
  description       = "Unrestricted staging egress for SSM and database administration"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-bastion-all-egress"
  })
}

resource "aws_vpc_security_group_ingress_rule" "fck_nat_from_vpc" {
  security_group_id = aws_security_group.fck_nat.id
  description       = "Forward traffic originating inside the VPC"
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "-1"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-fck-nat-from-vpc-ingress"
  })
}

resource "aws_vpc_security_group_egress_rule" "fck_nat_all" {
  security_group_id = aws_security_group.fck_nat.id
  description       = "Forward private application traffic to the internet"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-fck-nat-all-egress"
  })
}
