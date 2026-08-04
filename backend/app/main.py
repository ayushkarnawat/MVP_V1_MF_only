from fastapi import FastAPI

from app.api import analytics, auth, dashboard, imports

app = FastAPI(title="Unifolio API")

app.include_router(auth.router)
app.include_router(imports.router)
app.include_router(dashboard.router)
app.include_router(analytics.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
