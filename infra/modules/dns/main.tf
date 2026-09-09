terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

resource "aws_acm_certificate" "frontend" {
  provider = aws.us_east_1

  domain_name       = var.frontend_domain_name
  validation_method = "DNS"
}

resource "aws_route53_record" "frontend_certificate_validation" {
  provider = aws

  for_each = {
    for option in aws_acm_certificate.frontend.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id = var.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "frontend" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for record in aws_route53_record.frontend_certificate_validation : record.fqdn]
}

resource "aws_acm_certificate" "backend" {
  domain_name       = var.backend_domain_name
  validation_method = "DNS"
}

resource "aws_route53_record" "backend_certificate_validation" {
  provider = aws

  for_each = {
    for option in aws_acm_certificate.backend.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id = var.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "backend" {
  certificate_arn         = aws_acm_certificate.backend.arn
  validation_record_fqdns = [for record in aws_route53_record.backend_certificate_validation : record.fqdn]
}

resource "aws_route53_record" "frontend" {
  zone_id = var.zone_id
  name    = var.frontend_domain_name
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "backend" {
  zone_id = var.zone_id
  name    = var.backend_domain_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
