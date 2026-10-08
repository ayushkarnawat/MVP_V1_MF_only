import time, sys, functools
STATE = {"on": False}
TOT = {}
def _add(k, dt):
    c, t = TOT.get(k, (0, 0.0)); TOT[k] = (c + 1, t + dt)
def _wrap_async(mod, name, key):
    f = getattr(mod, name)
    @functools.wraps(f)
    async def w(*a, **k):
        t = time.perf_counter()
        try: return await f(*a, **k)
        finally:
            if STATE["on"]: _add(key, time.perf_counter() - t)
    setattr(mod, name, w)
def pytest_configure(config):
    from app.services.analytics import recompute, benchmark, nse_indices_client, scheme_universe, category_ranking
    from app.services.dashboard import nav
    _wrap_async(benchmark, "ensure_index_history_fresh", "NSE index top-up (benchmark)")
    _wrap_async(scheme_universe.SchemeUniverseClient, "_fetch_nav_all_text", "AMFI fund-list download")
    _wrap_async(nav, "_fetch_nav_history_uncached", "mfapi NAV download (any fund)")
    _wrap_async(category_ranking, "warm_nav_history", "peer NAV warm-up (category ranking)")
    f = recompute.recompute_household_analytics
    async def rec(db, uid):
        STATE["on"] = True; t = time.perf_counter()
        try: return await f(db, uid)
        finally:
            STATE["on"] = False
            print(f"NET whole Analytics run {time.perf_counter()-t:.1f}s", file=sys.stderr, flush=True)
            for k, (c, s) in TOT.items(): print(f"NET {k}: calls={c} total={s:.1f}s", file=sys.stderr, flush=True)
    recompute.recompute_household_analytics = rec

def _late():
    from app.services.dashboard import holdings
    _wrap_async(holdings, "get_navs_on_or_before", "held funds NAV lookup (holdings, per section)")
_late_done = False
_orig = pytest_configure
def pytest_configure(config):
    _orig(config); _late()
