import sys, importlib.util
from pathlib import Path
B = str(Path(__file__).resolve().parents[4] / "backend")
sys.path.insert(0, B); sys.path.insert(0, B+"/tests")
spec=importlib.util.spec_from_file_location("backend_conftest", B+"/tests/conftest.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
globals().update({k:v for k,v in vars(m).items() if not k.startswith("__")})

import httpx as _httpx, pytest as _pytest
@_pytest.fixture(autouse=True)
def _fresh_http_client(monkeypatch):
    # TestClient runs each request on a new event loop; the app caches one
    # AsyncClient globally (enrich._get_http_client), which then dies with the
    # first loop. Test-harness only: hand out a fresh client per call.
    import app.services.import_.enrich as enrich
    async def fresh():
        return _httpx.AsyncClient(timeout=30)
    monkeypatch.setattr(enrich, "_get_http_client", fresh)

@_pytest.fixture(autouse=True)
def _fresh_nav_client(monkeypatch):
    import app.services.dashboard.nav as nav
    monkeypatch.setattr(nav, "_get_nav_http_client", lambda: _httpx.AsyncClient(timeout=30))

@_pytest.fixture(autouse=True)
def _mfapi_outage(monkeypatch):
    # MFAPI_BLOCKED=1: every api.mfapi.in request fails as in an outage, so a
    # scenario shows what the import does on the scheme master and cached data
    # alone (Phase 5 checkpoint; repeated at the Phase 7 gate).
    import os
    if os.environ.get("MFAPI_BLOCKED") != "1":
        return
    real_send = _httpx.AsyncClient.send
    async def send(self, request, *a, **k):
        if request.url.host == "api.mfapi.in":
            raise _httpx.ConnectError("mfapi.in blocked by harness", request=request)
        return await real_send(self, request, *a, **k)
    monkeypatch.setattr(_httpx.AsyncClient, "send", send)
