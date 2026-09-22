data "aws_caller_identity" "current" {}

data "aws_route53_zone" "primary" {
  name         = "unifolio.in."
  private_zone = false
}

# ACM certificate covering both the apex domain and www, as two SANs on one
# cert — lets a single CloudFront distribution serve both aliases.
resource "aws_acm_certificate" "marketing" {
  provider = aws.us_east_1

  domain_name               = "unifolio.in"
  subject_alternative_names = ["www.unifolio.in"]
  validation_method         = "DNS"
}

resource "aws_route53_record" "marketing_certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.marketing.domain_validation_options : option.domain_name => {
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

resource "aws_acm_certificate_validation" "marketing" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.marketing.arn
  validation_record_fqdns = [for record in aws_route53_record.marketing_certificate_validation : record.fqdn]
}

module "frontend" {
  source = "../../modules/frontend"

  environment = var.environment
  project     = var.project
  account_id  = data.aws_caller_identity.current.account_id
  domain_name = "unifolio.in"

  additional_aliases  = ["www.unifolio.in"]
  acm_certificate_arn = aws_acm_certificate_validation.marketing.certificate_arn
}

resource "aws_route53_record" "marketing_apex" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "unifolio.in"
  type    = "A"

  alias {
    name                   = module.frontend.cloudfront_domain_name
    zone_id                = module.frontend.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "marketing_www" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "www.unifolio.in"
  type    = "A"

  alias {
    name                   = module.frontend.cloudfront_domain_name
    zone_id                = module.frontend.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}
