from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./unifolio_dev.db"
    test_database_url: str | None = None
    otp_delivery_mode: str = "stub"
    email_delivery_mode: str = "stub"
    postmark_api_token: str = ""
    postmark_from_email: str = ""
    environment: str = "development"
    frontend_base_url: str = "http://localhost:5173"
    google_oauth_client_id: str = ""
    allowed_origins: str = ""

    # PAN encryption (ADR-004 reopened 2026-09-18). Dev/demo key source —
    # production maps this to a Secrets Manager secret encrypted by the
    # already-staged KMS key (infra/modules/security), injected the same
    # way the RDS password already is. See
    # Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md.
    pan_encryption_key: str = ""
    pan_lookup_pepper: str = ""
    cas_file_storage_dir: str = "var/cas_files"

    # CAS file storage backend. "local" (default) writes to cas_file_storage_dir
    # on disk -- fine for dev, but ephemeral on Fargate. Staging/prod set this
    # to "s3" (infra/modules/storage) via CAS_FILE_STORAGE_BACKEND/
    # CAS_FILES_BUCKET_NAME, injected the same way the other task-def env vars are.
    cas_file_storage_backend: str = "local"
    cas_files_bucket_name: str = ""

    # ECS Fargate RunTask invocation for the analytics recompute dispatcher
    # (see Docs/superpowers/specs/2026-09-02-analytics-precompute-architecture-design.md).
    # Empty defaults are deliberate for local dev. In staging these are
    # injected as real values by infra/modules/backend (task def + task role
    # authored 2026-09-10, pending `terraform apply`). EcsRunTaskDispatcher
    # degrades to a logged no-op when any required value is unset.
    aws_region: str = ""
    ecs_cluster_arn: str = ""
    ecs_task_definition_arn: str = ""
    ecs_container_name: str = ""
    ecs_subnet_ids: str = ""  # comma-separated subnet ids
    ecs_security_group_ids: str = ""  # comma-separated security group ids


settings = Settings()
