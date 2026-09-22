provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project
    }
  }
}

# CloudFront + ACM require the certificate to be issued in us-east-1 regardless
# of the distribution's own region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project
    }
  }
}
