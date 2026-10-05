import sys, importlib.util
B="/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only/backend"
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
