resource "aws_ecr_repository" "this" {
  name                 = var.repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 14 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 14
        }
        action = {
          type = "expire"
        }
      },
      {
        # No-op today (only ~5 static milestone tags exist). Becomes load-bearing
        # once CI/CD (task #20) starts tagging per-commit and tag count grows
        # unboundedly -- this rule only applies to tagStatus=tagged (see 14-day
        # rule above for untagged cleanup, which already bounds the real driver
        # of growth: duplicate manifests from repeated pushes to "latest").
        rulePriority = 2
        description  = "Keep only the 10 most recently pushed tagged images"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["*"]
          countType      = "imageCountMoreThan"
          countNumber    = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
