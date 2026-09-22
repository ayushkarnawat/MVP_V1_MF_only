terraform {
  backend "s3" {
    # Same state bucket + lock table staging already created (create-state-backend.sh),
    # just a different key — a fully separate state file from staging/docs, so a mistake
    # in the staging env can never touch the live marketing site's resources.
    bucket         = "unifolio-tfstate-staging-811364789032"
    key            = "envs/marketing/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "unifolio-tfstate-lock-staging"
    encrypt        = true
  }
}
