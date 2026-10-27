from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Release gate: enable only after review of the 45 hypothetical assumptions.
    scenario_hypotheticals_enabled: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./unifolio_dev.db"
    test_database_url: str | None = None
    otp_delivery_mode: str = "stub"
    email_delivery_mode: str = "stub"
    ses_from_email: str = ""
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

    # /auth/otp/verify with no `flow` and no pending_token used to create a
    # phone-only account on the spot, with no consent and no email step. Every
    # deployed client sends `flow`, so this stays False everywhere real; the
    # test suite flips it on (conftest autouse) only so fixtures can keep
    # minting sessions with a bare phone verify.
    legacy_unflowed_phone_signup: bool = False

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

    # LeapSwitch/CloudPe staging (2026-10-15, Docs/orchestration/leapswitch-staging-plan.html
    # D2/D4). Every value below defaults to off/empty so AWS staging and
    # production are byte-for-byte unaffected; these only take effect via the
    # CloudPe VM's own .env (deploy/leapswitch/.env.example).

    # D2: which RecomputeDispatcher dispatch.py builds. "ecs" (default) keeps
    # today's AWS behavior everywhere except the LeapSwitch VM.
    analytics_dispatch_mode: str = "ecs"
    worker_container_url: str = ""  # e.g. http://worker:8008 -- LeapSwitch only

    # S3-compatible object storage (CAS files, disclosure archive). Empty
    # endpoint_url means real AWS S3 via boto3's default credential chain --
    # unchanged from before these settings existed. A non-empty endpoint_url
    # (LeapSwitch) switches to CloudPe's object storage, which needs its own
    # credentials, kept separate from the AWS_* ones SES uses on the same VM
    # (email stays on real AWS regardless of host -- D4 note above), and
    # usually path-style addressing.
    object_storage_endpoint_url: str = ""
    object_storage_region: str = ""
    object_storage_access_key: str = ""
    object_storage_secret_key: str = ""
    object_storage_force_path_style: bool = False

    # Home News backend (D2, ui-redesign NB1-NB3). Kill switch: off everywhere
    # until the VM .env sets NEWS_ENABLED=true at T9 (N5 B — live from day
    # one on that host, kept behind this switch). Comma-separated domains in
    # news_disabled_sources apply at both ingest and request time.
    news_enabled: bool = False
    news_disabled_sources: str = ""
    healthcheck_news_url: str = ""

    # L17: one-off/idempotent fill of stock_master.nse_symbol from the public NSE
    # equity list. Off by default; the VM .env sets NSE_SYMBOL_FILL_ENABLED=true.
    nse_symbol_fill_enabled: bool = False
    nse_symbol_fill_url: str = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"


settings = Settings()
