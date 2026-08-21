import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analytics, auth, cas_imports, dashboard, imports
from app.services.analytics.pdf_export import start_browser, stop_browser

# INFO-level so the timing logs in nav.py/category_ranking.py/scorer.py
# (added 2026-08-20 to root-cause a reported post-fix load-time regression)
# actually reach the console — root logger defaults to WARNING otherwise.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await start_browser()
    yield
    await stop_browser()


app = FastAPI(title="Unifolio API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
