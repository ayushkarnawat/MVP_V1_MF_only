# Standalone knowledge-graph dashboard viewer for stakeholders/interns, on its own
# subdomain (docs.unifolio.in) — fully separate from staging.unifolio.in and its ALB/
# ECS resources so it can't interfere with, or be affected by, staging app deploys.
# Static-only: no source-file drill-down is shipped, so there's no server-side logic
# needed beyond an edge token check, keeping this near-zero-cost (S3 + CloudFront only).

resource "random_id" "docs_viewer_token" {
  byte_length = 24
}

resource "aws_acm_certificate" "docs_viewer" {
  provider          = aws.us_east_1
  domain_name       = "docs.unifolio.in"
  validation_method = "DNS"
}

resource "aws_route53_record" "docs_viewer_certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.docs_viewer.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.primary.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "docs_viewer" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.docs_viewer.arn
  validation_record_fqdns = [for record in aws_route53_record.docs_viewer_certificate_validation : record.fqdn]
}

resource "aws_cloudfront_function" "docs_viewer_token_check" {
  name    = "${var.project}-docs-viewer-token-check"
  runtime = "cloudfront-js-2.0"
  comment = "Gates *.json data requests behind an access token for the docs viewer"
  publish = true
  code = templatefile("${path.module}/docs-token-check.js.tpl", {
    token = random_id.docs_viewer_token.hex
  })
}

module "docs_viewer" {
  source = "../../modules/frontend"

  environment = "docs"
  project     = var.project
  account_id  = data.aws_caller_identity.current.account_id
  domain_name = "docs.unifolio.in"

  acm_certificate_arn     = aws_acm_certificate_validation.docs_viewer.certificate_arn
  cloudfront_function_arn = aws_cloudfront_function.docs_viewer_token_check.arn
}

resource "aws_route53_record" "docs_viewer" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "docs.unifolio.in"
  type    = "A"

  alias {
    name                   = module.docs_viewer.cloudfront_domain_name
    zone_id                = module.docs_viewer.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

output "docs_viewer_s3_bucket_name" {
  description = "Name of the private S3 bucket containing the built docs-viewer dashboard assets."
  value       = module.docs_viewer.s3_bucket_name
}

output "docs_viewer_cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution serving docs.unifolio.in."
  value       = module.docs_viewer.cloudfront_distribution_id
}

output "docs_viewer_access_token" {
  description = "Access token required as ?token=... to view docs.unifolio.in's knowledge graph data."
  value       = random_id.docs_viewer_token.hex
  sensitive   = true
}
