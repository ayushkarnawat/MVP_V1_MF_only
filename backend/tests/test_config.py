from app.config import Settings


def test_deployment_settings_have_safe_local_defaults():
    configured = Settings(_env_file=None)

    assert configured.allowed_origins == ""
    assert configured.environment == "development"


def test_deployment_settings_are_read_from_environment(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://staging.unifolio.example")
    monkeypatch.setenv("ENVIRONMENT", "staging")

    configured = Settings(_env_file=None)

    assert configured.allowed_origins == "https://staging.unifolio.example"
    assert configured.environment == "staging"
