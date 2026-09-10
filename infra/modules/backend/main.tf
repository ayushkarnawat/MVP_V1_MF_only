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

# Distinct task definition for the analytics-recompute dispatcher
# (backend/app/services/analytics/dispatch.py) to RunTask per household --
# never inline on the request-serving replica. Shares the backend image and
# execution role; the container's default command is a placeholder because
# dispatch.py always supplies the real "--household <id>" command via
# RunTask containerOverrides.
resource "aws_cloudwatch_log_group" "analytics_recompute" {
  name              = "/ecs/${var.environment}-analytics-recompute"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "analytics_recompute" {
  family                   = "${local.name}-analytics-recompute"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name      = "${var.environment}-analytics-recompute"
      image     = "${var.repository_url}:${var.image_tag}"
      essential = true
      command   = ["python", "scripts/run_analytics_recompute.py"]

      environment = [
        { name = "ENVIRONMENT", value = "staging" },
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
          awslogs-group         = aws_cloudwatch_log_group.analytics_recompute.name
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

# Task role (distinct from the execution role) for the backend service
# itself -- boto3 inside the request-serving container assumes this role to
# call ecs:RunTask against the analytics-recompute task definition above.
data "aws_iam_policy_document" "backend_task_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend_task" {
  name               = "${local.name}-task-role"
  assume_role_policy = data.aws_iam_policy_document.backend_task_assume_role.json
}

data "aws_iam_policy_document" "backend_task" {
  statement {
    sid       = "DispatchAnalyticsRecompute"
    effect    = "Allow"
    actions   = ["ecs:RunTask"]
    resources = [aws_ecs_task_definition.analytics_recompute.arn]
  }

  statement {
    sid       = "PassAnalyticsRecomputeExecutionRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.ecs_task_execution.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "backend_task" {
  name   = "dispatch-analytics-recompute"
  role   = aws_iam_role.backend_task.id
  policy = data.aws_iam_policy_document.backend_task.json
}

resource "aws_ecs_task_definition" "this" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.backend_task.arn

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
        { name = "DB_NAME", value = var.db_name },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "ECS_CLUSTER_ARN", value = aws_ecs_cluster.this.arn },
        { name = "ECS_TASK_DEFINITION_ARN", value = aws_ecs_task_definition.analytics_recompute.arn },
        { name = "ECS_CONTAINER_NAME", value = "${var.environment}-analytics-recompute" },
        { name = "ECS_SUBNET_IDS", value = join(",", var.private_app_subnet_ids) },
        { name = "ECS_SECURITY_GROUP_IDS", value = var.ecs_security_group_id }
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
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.acm_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

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
