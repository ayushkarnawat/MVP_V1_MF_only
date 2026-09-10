locals {
  jobs = {
    nav_daily = {
      slug                = "nav-daily"
      command             = ["python", "scripts/jobs/refresh_nav_daily.py"]
      schedule_expression = "cron(0 6 * * ? *)"
    }
    benchmark_daily = {
      slug                = "benchmark-daily"
      command             = ["python", "scripts/jobs/refresh_benchmark_daily.py"]
      schedule_expression = "cron(0 6 * * ? *)"
    }
    ter_monthly = {
      slug                = "ter-monthly"
      command             = ["python", "scripts/jobs/refresh_ter_monthly.py"]
      schedule_expression = "cron(0 6 1 * ? *)"
    }
    aaum_quarterly = {
      slug                = "aaum-quarterly"
      command             = ["python", "scripts/jobs/refresh_aaum_quarterly.py"]
      schedule_expression = "cron(0 6 1 1,4,7,10 ? *)"
    }
  }
}

resource "aws_cloudwatch_log_group" "jobs" {
  for_each = local.jobs

  name              = "/ecs/${var.environment}-job-${each.value.slug}"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "jobs" {
  for_each = local.jobs

  family                   = "${var.project}-${var.environment}-job-${each.value.slug}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = var.ecs_task_execution_role_arn

  container_definitions = jsonencode([
    {
      name      = "${var.environment}-job-${each.value.slug}"
      image     = "${var.repository_url}:${var.image_tag}"
      essential = true
      command   = each.value.command

      environment = [
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
          awslogs-group         = aws_cloudwatch_log_group.jobs[each.key].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.project}-${var.environment}-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "RunScheduledJobTasks"
    effect    = "Allow"
    actions   = ["ecs:RunTask"]
    resources = [for task in aws_ecs_task_definition.jobs : task.arn]
  }

  statement {
    sid       = "PassTaskExecutionRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.ecs_task_execution_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "run-scheduled-ecs-tasks"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

resource "aws_scheduler_schedule" "jobs" {
  for_each = local.jobs

  name                         = "${var.project}-${var.environment}-job-${each.value.slug}"
  schedule_expression          = each.value.schedule_expression
  schedule_expression_timezone = "Asia/Kolkata"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.ecs_cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.jobs[each.key].arn
      launch_type         = "FARGATE"
      task_count          = 1

      network_configuration {
        subnets          = var.private_app_subnet_ids
        security_groups  = [var.ecs_security_group_id]
        assign_public_ip = false
      }
    }
  }

  depends_on = [aws_iam_role_policy.scheduler]
}
