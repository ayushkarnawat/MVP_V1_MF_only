locals {
  jobs = {
    nav_daily = {
      slug                = "nav-daily"
      command             = ["python", "scripts/jobs/refresh_nav_daily.py"]
      schedule_expression = "cron(0 6 * * ? *)"
      task_role_arn       = null
    }
    scheme_master_daily = {
      slug                = "scheme-master-daily"
      command             = ["python", "scripts/jobs/refresh_scheme_master_daily.py"]
      schedule_expression = "cron(15 6 * * ? *)"
      task_role_arn       = null
    }
    benchmark_daily = {
      slug                = "benchmark-daily"
      command             = ["python", "scripts/jobs/refresh_benchmark_daily.py"]
      schedule_expression = "cron(0 6 * * ? *)"
      task_role_arn       = null
    }
    ter_monthly = {
      slug                = "ter-monthly"
      command             = ["python", "scripts/jobs/refresh_ter_monthly.py"]
      schedule_expression = "cron(0 6 1 * ? *)"
      task_role_arn       = null
    }
    aaum_quarterly = {
      slug                = "aaum-quarterly"
      command             = ["python", "scripts/jobs/refresh_aaum_quarterly.py"]
      schedule_expression = "cron(0 6 1 1,4,7,10 ? *)"
      task_role_arn       = null
    }
    # Design doc's "Daily EventBridge Scheduler backstop" (analytics-precompute
    # spec) -- loops every household in one process run so NAV/market drift
    # with no user activity still refreshes. Scheduled after nav_daily (0 6)
    # so it picks up the day's freshly warmed NAV rows rather than racing them.
    # A dedicated task def (not the on-demand one dispatch.py RunTask's) because
    # EventBridge Scheduler's ecs_parameters has no containerOverrides support --
    # unlike a direct boto3 RunTask call, it can only launch a task's fixed
    # default command.
    analytics_recompute_daily = {
      slug                = "analytics-recompute-daily"
      command             = ["python", "scripts/run_analytics_recompute.py", "--all"]
      schedule_expression = "cron(30 6 * * ? *)"
      task_role_arn       = null
    }
    # Runs at 08:00 IST, clear of the 06:00 IST NAV/benchmark jobs and the
    # 06:30 IST analytics recompute backstop.
    account_deletion_daily = {
      slug                = "account-deletion-daily"
      command             = ["python", "scripts/jobs/delete_expired_accounts_daily.py"]
      schedule_expression = "cron(0 8 * * ? *)"
      task_role_arn       = null
    }
    # DB-row cleanup (imports.file_reference/file_expires_at) to match S3's
    # own 30-day lifecycle expiration (infra/modules/storage) -- was
    # explicitly out of scope in the 2026-09-18 PAN/CAS design, addressed
    # here (Docs/2026-09-19-cas-s3-postmark-secrets-infra.md gap #3). Needs
    # backend_task's role, not just the execution role, because
    # expire_stored_files() calls S3FileStorage.delete() at runtime.
    cas_file_expiry_daily = {
      slug                = "cas-file-expiry-daily"
      command             = ["python", "-m", "app.scripts.expire_cas_files"]
      schedule_expression = "cron(0 19 * * ? *)"
      task_role_arn       = var.backend_task_role_arn
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
  task_role_arn            = each.value.task_role_arn

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
        { name = "DB_NAME", value = var.db_name },
        { name = "CAS_FILE_STORAGE_BACKEND", value = "s3" },
        { name = "CAS_FILES_BUCKET_NAME", value = var.cas_files_bucket_name }
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

  # cas_file_expiry_daily is the only job with a task_role_arn set -- ECS
  # needs the scheduler role to be able to pass that role too, not just the
  # shared execution role above.
  statement {
    sid       = "PassCasFileExpiryTaskRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.backend_task_role_arn]

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

# Scenario A night-stop automation (9PM-5AM IST, Docs/2026-09-29-aws-staging-
# cost-analysis-and-reduction-plan.md §4/§7). Dependency-ordered: backend
# depends on both RDS and fck-nat, so it stops first/starts last. 6 plain
# EventBridge Scheduler rules via AWS-SDK "universal targets" -- no Lambda,
# since each step is a single fixed API call with no branching logic needed.
locals {
  night_stop_jobs = {
    stop_backend = {
      schedule_expression = "cron(0 21 * * ? *)" # 9:00 PM IST
      target_arn          = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
      input = jsonencode({
        Cluster      = var.ecs_cluster_name
        Service      = var.ecs_service_name
        DesiredCount = 0
      })
    }
    stop_rds = {
      schedule_expression = "cron(5 21 * * ? *)" # 9:05 PM IST
      target_arn          = "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance"
      input = jsonencode({
        DbInstanceIdentifier = var.db_instance_id
      })
    }
    stop_fck_nat = {
      schedule_expression = "cron(10 21 * * ? *)" # 9:10 PM IST
      target_arn          = "arn:aws:scheduler:::aws-sdk:ec2:stopInstances"
      input = jsonencode({
        InstanceIds = [var.fck_nat_instance_id]
      })
    }
    start_rds = {
      schedule_expression = "cron(45 4 * * ? *)" # 4:45 AM IST
      target_arn          = "arn:aws:scheduler:::aws-sdk:rds:startDBInstance"
      input = jsonencode({
        DbInstanceIdentifier = var.db_instance_id
      })
    }
    start_fck_nat = {
      schedule_expression = "cron(50 4 * * ? *)" # 4:50 AM IST
      target_arn          = "arn:aws:scheduler:::aws-sdk:ec2:startInstances"
      input = jsonencode({
        InstanceIds = [var.fck_nat_instance_id]
      })
    }
    start_backend = {
      schedule_expression = "cron(58 4 * * ? *)" # 4:58 AM IST -- after RDS/fck-nat have had ~8-13 min to come up
      target_arn          = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
      input = jsonencode({
        Cluster      = var.ecs_cluster_name
        Service      = var.ecs_service_name
        DesiredCount = 1
      })
    }
  }
}

data "aws_iam_policy_document" "night_stop_scheduler" {
  statement {
    sid       = "StopStartBackendService"
    effect    = "Allow"
    actions   = ["ecs:UpdateService"]
    resources = [var.ecs_service_arn]
  }

  statement {
    sid       = "StopStartRds"
    effect    = "Allow"
    actions   = ["rds:StopDBInstance", "rds:StartDBInstance"]
    resources = [var.db_instance_arn]
  }

  statement {
    sid       = "StopStartFckNat"
    effect    = "Allow"
    actions   = ["ec2:StopInstances", "ec2:StartInstances"]
    resources = ["arn:aws:ec2:${var.aws_region}:${var.account_id}:instance/${var.fck_nat_instance_id}"]
  }
}

resource "aws_iam_role_policy" "night_stop_scheduler" {
  name   = "night-stop-start"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.night_stop_scheduler.json
}

resource "aws_scheduler_schedule" "night_stop" {
  for_each = local.night_stop_jobs

  name                         = "${var.project}-${var.environment}-night-${each.key}"
  schedule_expression          = each.value.schedule_expression
  schedule_expression_timezone = "Asia/Kolkata"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = each.value.target_arn
    role_arn = aws_iam_role.scheduler.arn
    input    = each.value.input
  }

  depends_on = [aws_iam_role_policy.night_stop_scheduler]
}

# RDS-availability safety net (plan doc §7.1 note): the originally proposed
# "CloudWatch alarm on DBInstanceStatus" doesn't actually exist as a
# CloudWatch metric -- RDS publishes CPUUtilization/connections/storage/etc,
# not instance status, to CloudWatch. The correct native (zero-Lambda)
# primitive for "tell me if the night-stop RDS restart is slow or fails" is
# an RDS event subscription: it fires on real state transitions (including
# a late "available" event if boot overruns the 4:45-4:58 AM window, and any
# start failure), which is a stronger real-world signal than a fixed-deadline
# poll would have been anyway.
resource "aws_sns_topic" "ops_alerts" {
  name = "${var.project}-${var.environment}-ops-alerts"
}

resource "aws_sns_topic_subscription" "ops_alerts_email" {
  for_each = toset(var.alert_emails)

  topic_arn = aws_sns_topic.ops_alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_db_event_subscription" "rds_availability" {
  name      = "${var.project}-${var.environment}-rds-availability"
  sns_topic = aws_sns_topic.ops_alerts.arn

  source_type = "db-instance"
  source_ids  = [var.db_instance_id]

  event_categories = ["availability", "failure"]
}
