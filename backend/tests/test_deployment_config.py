from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_runtime_requirements_are_fully_pinned_and_drop_dead_password_hashing_dependencies():
    requirement_lines = [
        line.strip()
        for line in (BACKEND_ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert requirement_lines
    assert all("==" in line for line in requirement_lines)
    assert not any(line.lower().startswith("passlib") for line in requirement_lines)
    assert not any(line.lower().startswith("bcrypt") for line in requirement_lines)


def test_dockerfile_installs_chromium_and_delegates_startup_to_the_entrypoint_script():
    dockerfile = (BACKEND_ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert dockerfile.startswith("FROM python:3.12-")
    assert "pip install --no-cache-dir -r requirements.txt" in dockerfile
    assert "playwright install --with-deps chromium" in dockerfile
    assert "EXPOSE 8000" in dockerfile
    assert 'ENTRYPOINT ["/app/docker-entrypoint.sh"]' in dockerfile

    # The entrypoint script (not the Dockerfile) resolves DATABASE_URL from
    # discrete env vars at container start, then binds uvicorn to all
    # interfaces when no command override is passed.
    entrypoint = (BACKEND_ROOT / "docker-entrypoint.sh").read_text(encoding="utf-8")
    assert "exec uvicorn app.main:app --host 0.0.0.0 --port 8000" in entrypoint
