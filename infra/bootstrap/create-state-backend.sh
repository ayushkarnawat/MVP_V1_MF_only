#!/usr/bin/env bash
set -euo pipefail

readonly REGION="ap-south-1"
readonly LOCK_TABLE="unifolio-tfstate-lock-staging"

if [[ $# -ne 1 || ! "$1" =~ ^[0-9]{12}$ ]]; then
  echo "Usage: $0 <12-digit-aws-account-id>" >&2
  exit 1
fi

readonly ACCOUNT_ID="$1"
readonly STATE_BUCKET="unifolio-tfstate-staging-${ACCOUNT_ID}"

echo "Creating Terraform state bucket: ${STATE_BUCKET}"
aws s3api create-bucket \
  --bucket "${STATE_BUCKET}" \
  --region "${REGION}" \
  --create-bucket-configuration "LocationConstraint=${REGION}"

aws s3api put-public-access-block \
  --bucket "${STATE_BUCKET}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

aws s3api put-bucket-versioning \
  --bucket "${STATE_BUCKET}" \
  --versioning-configuration "Status=Enabled"

aws s3api put-bucket-encryption \
  --bucket "${STATE_BUCKET}" \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-bucket-tagging \
  --bucket "${STATE_BUCKET}" \
  --tagging 'TagSet=[{Key=Environment,Value=staging},{Key=Project,Value=unifolio}]'

echo "Creating Terraform lock table: ${LOCK_TABLE}"
aws dynamodb create-table \
  --table-name "${LOCK_TABLE}" \
  --region "${REGION}" \
  --attribute-definitions "AttributeName=LockID,AttributeType=S" \
  --key-schema "AttributeName=LockID,KeyType=HASH" \
  --billing-mode "PAY_PER_REQUEST" \
  --tags "Key=Environment,Value=staging" "Key=Project,Value=unifolio"

aws dynamodb wait table-exists \
  --table-name "${LOCK_TABLE}" \
  --region "${REGION}"

printf '\nState backend created.\nBucket: %s\nLock table: %s\nRegion: %s\n' \
  "${STATE_BUCKET}" "${LOCK_TABLE}" "${REGION}"
echo "Update infra/envs/staging/backend.tf with the bucket name above before terraform init."
