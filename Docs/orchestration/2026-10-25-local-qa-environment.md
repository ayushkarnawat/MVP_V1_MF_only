# Local QA environment (backend, frontend, seeded synthetic household)

Built and used 25 Oct 2026 for the S2.5 manual check of the shell; reuse it for the visual-parity step that ends every page (handoff step 5b), the S2.7 final gate and any later "look at the running app" step. Everything lives on WSL's own disk (`~/s25`, `~/fe-speed`); the repo's `.env`, `backend/unifolio_dev.db` (stale, migration 0017) and tracked files are never touched. All data is synthetic (statement password `MF@123`).

**How to run it.** Save the blocks below into one folder whose path has **no spaces** (for example `C:\Users\<you>\s25-scripts\`) under the file names shown, then call them from PowerShell as `wsl.exe -d Ubuntu -- bash /mnt/c/Users/<you>/s25-scripts/<file>.sh` (inline paths with spaces break the quoting). Order: `s25-setup.sh` once; then `s25-serve.sh` (long-running, run it in the background) and `s25-vite.sh` (same); then `s25_seed1.py`, `s25_seed2.py`, `s25_seed3.py` (see the call line under them); then open `http://localhost:5173`, set the printed session token as `localStorage.unifolio_session_token` and reload. Stop everything with `s25-stop.sh`. It needs `fast-fe.sh` from the return handoff (section 1, "Fast path") in the same folder, and the one-time `~/fe-speed` copy described there.

**Gotchas that cost time (so they are not paid again):**
1. `PAN_ENCRYPTION_KEY` and `PAN_LOOKUP_PEPPER` must each be base64 of exactly **32 bytes**; a shorter pepper fails the first sign-up request with a 500.
2. The backend starts headless Chromium (PDF export) in its lifespan and fails without the Playwright browser. `s25_run.py` skips it, so no browser download is needed; PDF export just does not work in this environment.
3. Sign-up needs `flow: "signup"` plus the current Terms and Privacy versions (`accepted_documents`) on both OTP calls; with a phone it then continues through an **email** step (`/auth/email-otp/request` then `/verify` with the `pending_token`). The stub OTP is returned in the API response.
4. A fresh account is not "onboarded": the seed sets `users.onboarding_completed_at` directly in the local database. The self member is created as plain `ROHAN VIJAY KULKARNI`, so Profile shows its "Account holder" fallback (the profile name is derived from a member name ending in "(Me)", same as the old code).
5. Import goes through the real `/imports/parse` and `/imports/confirm`; the scheme master comes from the saved AMFI feed (`Docs/CAS Files/synthetic/navall_2026-10-06.txt`). NAV history may call `api.mfapi.in` (network); the couple's statement imported 651 transactions with both members showing holdings.
6. Screenshots right after a navigation often catch the page mid-load or mid-fade; wait a few seconds before judging. Use the browser's `resize_window` preset `desktop` when done.
7. The browser tab's `sessionStorage` carries the shell's Back memory (`unifolio.shell.back`) and scope (`unifolio.shell.scope`) between reloads; clear it to test a truly fresh tab.

## `s25-env.sh`

```bash
#!/usr/bin/env bash
# Sourced by the s25-* scripts. Local dev environment for the S2.5 manual check. Nothing here touches the
# repo's .env or unifolio_dev.db; the database and CAS files live on WSL's own disk.
export S25="$HOME/s25"
mkdir -p "$S25"
export DATABASE_URL="sqlite:///$S25/s25.db"
export CAS_FILE_STORAGE_DIR="$S25/cas_files"
export OTP_DELIVERY_MODE=stub EMAIL_DELIVERY_MODE=stub ENVIRONMENT=development
# Both keys must be base64 of exactly 32 bytes. Throwaway local values, never reused anywhere else.
[ -f "$S25/keys.env" ] || printf 'PAN_ENCRYPTION_KEY=%s\nPAN_LOOKUP_PEPPER=%s\n' "$(head -c 32 /dev/urandom | base64)" "$(head -c 32 /dev/urandom | base64)" > "$S25/keys.env"
set -a; . "$S25/keys.env"; set +a
BE="/mnt/d/Unifolio code/backend"
PY="$BE/.venv/bin/python"
```

## `s25-setup.sh`

```bash
#!/usr/bin/env bash
. "$(dirname "$0")/s25-env.sh"
cd "$BE" || exit 1
rm -f "$S25/s25.db"
echo "== alembic upgrade head"
"$PY" -m alembic upgrade head 2>&1 | tail -5
echo "== seed scheme master"
"$PY" - <<'EOF' 2>&1 | tail -5
import asyncio
from pathlib import Path
from app.db.session import SessionLocal
from app.services.analytics.scheme_master import refresh_scheme_master
text = Path("/mnt/d/Unifolio code/Docs/CAS Files/synthetic/navall_2026-10-06.txt").read_text(encoding="utf-8")
db = SessionLocal()
print(asyncio.run(refresh_scheme_master(db, text)))
from app.models.reference import Scheme
print("schemes:", db.query(Scheme).count())
EOF
```

## `s25_run.py`

```python
"""Local server for the S2.5 manual check. Skips the Playwright browser startup (PDF export only), so no
browser download is needed. Run from backend/ with the s25 environment (see s25-env.sh)."""
import app.services.analytics.pdf_export as pdf_export


async def _skip() -> None:
    return None


pdf_export.start_browser = _skip
pdf_export.stop_browser = _skip

import uvicorn  # noqa: E402

uvicorn.run("app.main:app", host="0.0.0.0", port=8000)
```

## `s25-serve.sh`

```bash
#!/usr/bin/env bash
. "$(dirname "$0")/s25-env.sh"
cd "$BE" || exit 1
export PYTHONPATH="$BE"
exec "$PY" "$(dirname "$0")/s25_run.py" > "$S25/uvicorn.log" 2>&1
```

## `s25-vite.sh`

```bash
#!/usr/bin/env bash
bash "$(dirname "$0")/fast-fe.sh" sync
cd "$HOME/fe-speed" || exit 1
exec npx vite --host 0.0.0.0 --port 5173 > "$HOME/s25/vite.log" 2>&1
```

## `s25_seed1.py`

```python
import json
import httpx
from app.models.enums import ConsentDocumentType
from app.services.legal.registry import current_document

B = "http://localhost:8000"
PHONE = "+919811122200"
EMAIL = "rohan.kulkarni@example.test"
docs = [{"document_type": t.value, "document_version": current_document(t).version}
        for t in (ConsentDocumentType.TERMS_OF_SERVICE, ConsentDocumentType.PRIVACY_POLICY)]
c = httpx.Client(base_url=B, timeout=60)


def show(label, r):
    print(label, r.status_code, r.text[:300])
    return r


r = show("otp/request", c.post("/auth/otp/request", json={"phone_number": PHONE, "flow": "signup", "accepted_documents": docs}))
v = show("otp/verify", c.post("/auth/otp/verify", json={"phone_number": PHONE, "otp": r.json()["otp"], "flow": "signup", "accepted_documents": docs}))
pending = v.json()["email_required"]["token"]
e = show("email-otp/request", c.post("/auth/email-otp/request", json={"email": EMAIL, "pending_token": pending}))
ev = show("email-otp/verify", c.post("/auth/email-otp/verify", json={"email": EMAIL, "otp": e.json()["otp"], "pending_token": pending}))
tok = ev.json().get("session_token")
h = {"Authorization": f"Bearer {tok}"}
me = c.get("/auth/me", headers=h)
print("me", me.status_code, json.dumps(me.json())[:700])
open("/tmp/s25_token.txt", "w").write(tok or "")
```

## `s25_seed2.py`

```python
import json, os, sqlite3, sys, time
from collections import defaultdict
from pathlib import Path
import httpx
from app.models.enums import ConsentDocumentType
from app.services.legal.registry import current_document

B = "http://localhost:8000"
FN = sys.argv[1] if len(sys.argv) > 1 else "r2_couple_rohan_priya_10yr.pdf"
ROOT = Path("/mnt/d/Unifolio code/Docs/CAS Files/synthetic")
truth = json.loads((ROOT / "truth.json").read_text(encoding="utf-8"))
investor = truth[FN]["investor"]
pdf = next(ROOT.glob(f"pdfs/*/{FN}"))
tok = open("/tmp/s25_token.txt").read().strip()
h = {"Authorization": f"Bearer {tok}"}
c = httpx.Client(base_url=B, timeout=300)
pan_v = current_document(ConsentDocumentType.PAN_DISCLAIMER).version

members = c.get("/household-members", headers=h).json()
print("members before:", [(m["name"], m["relationship"]) for m in members])
if not members:
    r = c.post("/household-members", json={"name": investor, "relationship": "self"}, headers=h)
    print("create self", r.status_code, r.text[:200])
    members = c.get("/household-members", headers=h).json()
mid = members[0]["id"]
print("investor:", investor, "file:", pdf.name)

t0 = time.time()
r = c.post("/imports/parse", files={"file": (FN, pdf.read_bytes(), "application/pdf")},
           data={"password": "MF@123", "household_member_id": mid, "pan_disclaimer_version": pan_v}, headers=h)
print("parse", r.status_code, round(time.time() - t0, 1), "s")
if r.status_code == 409 and (r.json().get("detail") or {}).get("code") == "member_not_in_file":
    sid = r.json()["detail"]["session_id"]
    r = c.post(f"/imports/sessions/{sid}/acknowledge", json={"code": "member_not_in_file"}, headers=h)
    print("acknowledge", r.status_code)
if r.status_code != 200:
    print(r.text[:600]); sys.exit(1)
p = r.json()
print("people:", [(x["name"], x["status"], x["fund_count"], bool(x.get("needs_name"))) for x in p["people"]])
by = defaultdict(list)
for s in p["schemes"]:
    if s["match_status"] != "confirmed" and s["suggested_amfi_code"]:
        by[s.get("person_key")].append({"temp_id": s["temp_id"], "amfi_code": s["suggested_amfi_code"]})
if p["people"]:
    body = {"session_id": p["session_id"], "people": [
        {"person_key": x["person_key"], "scheme_confirmations": by.get(x["person_key"], []),
         **({"name": "Typed Name"} if x.get("needs_name") else {})} for x in p["people"]]}
else:
    body = {"session_id": p["session_id"], "household_member_id": mid, "scheme_confirmations": by.get(None, [])}
t0 = time.time()
r = c.post("/imports/confirm", json=body, headers=h)
print("confirm", r.status_code, round(time.time() - t0, 1), "s", r.text[:300])
members = c.get("/household-members", headers=h).json()
print("members after:", [(m["name"], m["relationship"], m["origin"]) for m in members])
```

## `s25_seed3.py`

```python
import os, sqlite3, httpx
db = sqlite3.connect(os.path.expanduser("~/s25/s25.db"))
db.execute("update users set onboarding_completed_at = datetime('now'), onboarding_step = NULL")
db.commit()
tok = open("/tmp/s25_token.txt").read().strip()
h = {"Authorization": f"Bearer {tok}"}
c = httpx.Client(base_url="http://localhost:8000", timeout=60)
print("me:", c.get("/auth/me", headers=h).json())
ms = c.get("/household-members", headers=h).json()
for m in ms:
    hold = c.get(f"/household-members/{m['id']}/holdings", headers=h)
    print(m["name"], "holdings:", hold.status_code, len(hold.json()) if hold.status_code == 200 else hold.text[:150])
print("token:", tok)
```

## `s25-stop.sh`

```bash
#!/usr/bin/env bash
# stop servers started for the S2.5 check (backend launcher and the vite dev server)
pkill -f s25_run.py && echo "backend stopped" || echo "backend not running"
pkill -f "vite" && echo "vite stopped" || echo "vite not running"
exit 0
```

## Seed call lines

The seed scripts import backend code, so run them from `backend/` with `PYTHONPATH=.` and the backend venv, after the server is up:

```powershell
wsl.exe -d Ubuntu -- bash -c "cd '/mnt/d/Unifolio code/backend' && PYTHONPATH=. .venv/bin/python /mnt/c/Users/<you>/s25-scripts/s25_seed1.py"   # sign-up, prints /auth/me, writes /tmp/s25_token.txt
wsl.exe -d Ubuntu -- bash -c "cd '/mnt/d/Unifolio code/backend' && PYTHONPATH=. .venv/bin/python /mnt/c/Users/<you>/s25-scripts/s25_seed2.py"   # self member + import r2 couple
wsl.exe -d Ubuntu -- bash -c "cd '/mnt/d/Unifolio code/backend' && PYTHONPATH=. .venv/bin/python /mnt/c/Users/<you>/s25-scripts/s25_seed3.py"   # marks onboarding complete, prints holdings counts and the session token
```