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


settings = Settings()
