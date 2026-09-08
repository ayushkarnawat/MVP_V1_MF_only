locals {
  name           = "${var.project}-${var.environment}-backend"
  container_name = "${var.environment}-backend"
}

resource "aws_ecs_cluster" "this" {
  name = "${var.project}-${var.environment}"
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.environment}-backend"
  retention_in_days = 7
}

data "aws_iam_policy_document" "ecs_task_execution_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${local.name}-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "rds_master_secret_read" {
  statement {
    sid       = "ReadRDSMasterSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.master_user_secret_arn]
  }

  statement {
    sid       = "DecryptRDSMasterSecret"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "rds_master_secret_read" {
  name   = "rds-master-secret-read"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.rds_master_secret_read.json
}

resource "aws_ecs_task_definition" "this" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name      = local.container_name
      image     = "${var.repository_url}:${var.image_tag}" # Phase 7 CI/CD will replace this placeholder tag with immutable image tags.
      essential = true

      portMappings = [
        {
          containerPort = 8000
          hostPort      = 8000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "ENVIRONMENT", value = "staging" },
        { name = "ALLOWED_ORIGINS", value = "https://staging.unifolio.in" },
        { name = "FRONTEND_BASE_URL", value = "https://staging.unifolio.in" },
        { name = "OTP_DELIVERY_MODE", value = "stub" },
        { name = "GOOGLE_OAUTH_CLIENT_ID", value = var.google_oauth_client_id },
        { name = "DB_USERNAME", value = "unifolio" },
        { name = "DB_HOST", value = var.db_address },
        { name = "DB_PORT", value = tostring(var.db_port) },
        { name = "DB_NAME", value = var.db_name }
      ]

      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = "${var.master_user_secret_arn}:password::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  depends_on = [
    aws_iam_role_policy_attachment.ecs_task_execution,
    aws_iam_role_policy.rds_master_secret_read,
  ]
}

resource "aws_lb" "this" {
  name               = "${var.project}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "this" {
  name        = "${var.project}-${var.environment}-backend"
  port        = 8000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

resource "aws_ecs_service" "this" {
  name            = local.name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this.arn
  launch_type     = "FARGATE"
  desired_count   = 1

  health_check_grace_period_seconds = 60

  # AWS Readiness/aws-golive-launch-blockers.md requires stop-then-start deploys while the app relies on single-process state.
  deployment_maximum_percent         = 100
  deployment_minimum_healthy_percent = 0

  network_configuration {
    subnets          = var.private_app_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = local.container_name
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http]
}
