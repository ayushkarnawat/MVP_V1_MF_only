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

# Renamed from rds_master_secret_read (Docs/2026-09-19-cas-s3-postmark-secrets-infra.md
# Part A4a): this policy started out reading only the RDS master secret, but
# now also covers the pan_keys secret below, so the
# old RDS-specific name no longer describes its scope.
data "aws_iam_policy_document" "ecs_secrets_read" {
  statement {
    sid       = "ReadRDSMasterSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.master_user_secret_arn]
  }

  statement {
    sid       = "ReadAppSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.pan_keys_secret_arn]
  }

  statement {
    sid       = "DecryptSecretsWithSharedKey"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "ecs_secrets_read" {
  name   = "ecs-secrets-read"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_secrets_read.json
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
    aws_iam_role_policy.ecs_secrets_read,
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

# S3FileStorage (backend/app/services/import_/file_storage.py) runs inside
# the request-serving container under this same task role -- CAS PDFs are
# uploaded/read/deleted directly against the bucket, not through the
# execution role (which only ECS itself uses to pull secrets/images).
data "aws_iam_policy_document" "backend_task_cas_files" {
  statement {
    sid       = "ReadWriteCasFiles"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.cas_files_bucket_arn}/*"]
  }

  statement {
    sid       = "ListCasFilesBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.cas_files_bucket_arn]
  }

  statement {
    sid       = "UseSharedKeyForCasFiles"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "backend_task_cas_files" {
  name   = "backend-task-cas-files"
  role   = aws_iam_role.backend_task.id
  policy = data.aws_iam_policy_document.backend_task_cas_files.json
}

# SesEmailProvider (backend/app/services/auth/email_provider.py) sends via the
# SES API using this same task role -- no static AWS credentials, same pattern
# as the S3/KMS access above. count=0 until ses_identity_arn is actually set,
# so this module stays apply-safe before the SES domain identity exists
# (Part 1 of the SES migration plan).
data "aws_iam_policy_document" "backend_task_ses" {
  count = var.ses_identity_arn == "" ? 0 : 1

  statement {
    sid       = "SendEmailViaSes"
    effect    = "Allow"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [var.ses_identity_arn]
  }
}

resource "aws_iam_role_policy" "backend_task_ses" {
  count  = var.ses_identity_arn == "" ? 0 : 1
  name   = "backend-task-ses-send"
  role   = aws_iam_role.backend_task.id
  policy = data.aws_iam_policy_document.backend_task_ses[0].json
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
        { name = "OTP_DELIVERY_MODE", value = var.otp_delivery_mode },
        { name = "EMAIL_DELIVERY_MODE", value = var.email_delivery_mode },
        { name = "SES_FROM_EMAIL", value = var.ses_from_email },
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
        { name = "ECS_SECURITY_GROUP_IDS", value = var.ecs_security_group_id },
        { name = "CAS_FILE_STORAGE_BACKEND", value = "s3" },
        { name = "CAS_FILES_BUCKET_NAME", value = var.cas_files_bucket_name }
      ]

      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = "${var.master_user_secret_arn}:password::"
        },
        {
          name      = "PAN_ENCRYPTION_KEY"
          valueFrom = "${var.pan_keys_secret_arn}:PAN_ENCRYPTION_KEY::"
        },
        {
          name      = "PAN_LOOKUP_PEPPER"
          valueFrom = "${var.pan_keys_secret_arn}:PAN_LOOKUP_PEPPER::"
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
    aws_iam_role_policy.ecs_secrets_read,
    aws_iam_role_policy.backend_task_cas_files,
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
