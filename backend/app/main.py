import asyncio
import logging
import sys
from contextlib import asynccontextmanager

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analytics, auth, cas_imports, dashboard, imports
from app.config import settings
from app.services.analytics.pdf_export import start_browser, stop_browser
from app.services.import_.crypto import decode_key
from app.services.import_.file_storage import LocalFileStorage, default_file_storage

# INFO-level so the timing logs in nav.py/category_ranking.py/scorer.py
# (added 2026-08-20 to root-cause a reported post-fix load-time regression)
# actually reach the console — root logger defaults to WARNING otherwise.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s")

DEFAULT_LOCAL_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


def _allowed_cors_origins(configured_origins: str) -> list[str]:
    origins = [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
    return origins or DEFAULT_LOCAL_CORS_ORIGINS.copy()


def _assert_pan_keys_configured() -> None:
    """Fail fast at boot, not per-request, when PAN_ENCRYPTION_KEY/
    PAN_LOOKUP_PEPPER are missing or malformed outside development.
    Without this, a container deployed with these secrets unset starts
    cleanly and only surfaces the problem as an uncaught 500 on the first
    import that parses a PAN (crypto.py's _decode_key raises RuntimeError
    deep in the request path) -- see Fix 2 of the 2026-09-18 whole-branch
    review. Reuses crypto.py's own decode_key rather than duplicating the
    base64/32-byte-length check here."""
    try:
        decode_key(settings.pan_encryption_key, "PAN_ENCRYPTION_KEY")
        decode_key(settings.pan_lookup_pepper, "PAN_LOOKUP_PEPPER")
    except RuntimeError as exc:
        raise RuntimeError(
            f"Refusing to start in environment={settings.environment!r}: {exc} "
            "Both must be set to a base64-encoded 32-byte key before serving traffic."
        ) from exc


def _warn_if_local_file_storage_in_non_dev() -> None:
    """Non-blocking warning (not a startup failure): outside development, the
    30-day CAS file retention should be backed by durable storage (S3 +
    Lifecycle rule per the design spec's "Production mapping"), not
    LocalFileStorage's ephemeral container disk, which loses every retained
    file on redeploy/restart. The S3-backed backend isn't built in this pass
    (see Fix 2's task description), so this only logs -- it must not block
    startup the way _assert_pan_keys_configured does."""
    if isinstance(default_file_storage, LocalFileStorage):
        logging.getLogger(__name__).warning(
            "CAS file storage is LocalFileStorage (ephemeral local disk) while "
            "environment=%r. Retained files will not survive a redeploy/restart. "
            "An S3-backed FileStorage implementation is not yet built.",
            settings.environment,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment != "development":
        _assert_pan_keys_configured()
        _warn_if_local_file_storage_in_non_dev()
    await start_browser()
    yield
    await stop_browser()


app = FastAPI(title="Unifolio API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_cors_origins(settings.allowed_origins),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(imports.router)
app.include_router(cas_imports.router)
app.include_router(dashboard.router)
app.include_router(analytics.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
