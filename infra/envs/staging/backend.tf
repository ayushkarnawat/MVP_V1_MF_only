terraform {
  backend "s3" {
    # Replace this placeholder with the exact bucket printed by create-state-backend.sh.
    bucket         = "unifolio-tfstate-staging-REPLACE_WITH_ACCOUNT_ID"
    key            = "envs/staging/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "unifolio-tfstate-lock-staging"
    encrypt        = true
  }
}
