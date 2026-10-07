"""Cost model for production: CPU seconds, DB round-trips and peak memory of
parse / confirm / holdings / snapshots for one file."""
import sys
import json, os, resource, time
from sqlalchemy import event
from api.import_helpers import _authed_headers_and_member, PAN_DISCLAIMER_VERSION

from pathlib import Path
_HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_HERE))
from pdf_dir import pdf_dir  # noqa: E402  PDFs live outside the repo
SYN = str(pdf_dir()) + "/"
FN = os.environ["FN"]; OUT = os.environ["OUT"]
TRUTH = json.load(open(_HERE / "truth.json"))


def rss_mb():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def test_perf(client):
    from app.db.session import get_db
    from app.main import app
    engine = next(app.dependency_overrides[get_db]()).get_bind()
    q = {"n": 0}
    event.listen(engine, "before_cursor_execute", lambda *a, **k: q.__setitem__("n", q["n"] + 1))
    headers, mid = _authed_headers_and_member(client, "+919811100001", name=TRUTH[FN]["investor"])
    res = {"file": FN, "rss_start_mb": round(rss_mb())}

    def step(name, fn):
        q["n"] = 0; c0 = time.process_time(); w0 = time.time()
        r = fn()
        res[name] = {"wall_s": round(time.time() - w0, 2), "cpu_s": round(time.process_time() - c0, 2),
                     "db_queries": q["n"], "status": r.status_code, "rss_peak_mb": round(rss_mb())}
        return r

    p = step("parse", lambda: client.post("/imports/parse", files={"file": (FN, open(SYN + FN, "rb").read(), "application/pdf")},
             data={"password": "MF@123", "household_member_id": mid, "pan_disclaimer_version": PAN_DISCLAIMER_VERSION}, headers=headers)).json()
    confs = [{"temp_id": s["temp_id"], "amfi_code": s["suggested_amfi_code"]} for s in p["schemes"]
             if s["match_status"] != "confirmed" and s["suggested_amfi_code"]]
    step("confirm", lambda: client.post("/imports/confirm", json={"session_id": p["session_id"], "household_member_id": mid,
                                                                   "scheme_confirmations": confs}, headers=headers))
    step("holdings_first", lambda: client.get(f"/household-members/{mid}/holdings", headers=headers))
    step("holdings_cached", lambda: client.get(f"/household-members/{mid}/holdings", headers=headers))
    step("snapshots_first", lambda: client.get(f"/household-members/{mid}/snapshots", headers=headers))
    step("snapshots_cached", lambda: client.get(f"/household-members/{mid}/snapshots", headers=headers))
    step("sips", lambda: client.get(f"/household-members/{mid}/sips", headers=headers))
    step("cash_flow", lambda: client.get(f"/household-members/{mid}/cash-flow", headers=headers))
    json.dump(res, open(OUT, "w"), indent=1)
