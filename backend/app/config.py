from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./unifolio_dev.db"
    test_database_url: str | None = None
    otp_delivery_mode: str = "stub"
    environment: str = "development"
    frontend_base_url: str = "http://localhost:5173"
    google_oauth_client_id: str = ""
    allowed_origins: str = ""

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
