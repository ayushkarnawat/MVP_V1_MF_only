"""Read-only check of the PDF export pipeline as it stands (Batch I, task I-2).

    python scripts/diagnose_export_pipeline.py --expect-host ls-redesign.unifolio.in
    python scripts/diagnose_export_pipeline.py --expect-host ls-redesign.unifolio.in --token-env EXPORT_CHECK_TOKEN --runs 12
    python scripts/diagnose_export_pipeline.py --expect-host ls-redesign.unifolio.in --mint-session-for <user-uuid> --runs 12

Run it INSIDE the backend container on the staging VM (it reads that container's settings and memory).
It answers four questions about today's pipeline, which keeps its one-time token in a plain dict inside
ONE worker process while the VM runs THREE:

  1. Where would the browser come back to? FRONTEND_BASE_URL, and whether it is the staging host.
  2. Does the print page load from here (a plain GET, no sign-in)?
  3. What do three idle headless Chromium processes cost in memory (the container has one shared ceiling)?
  4. With a session (only if you pass one): does POST /analytics/export/pdf work, how often does it fail
     across the three workers, and how long does it take? The payload is invented (an empty family, no
     names, no money). The first request is reported separately because it is the one that may start the browser.

Steps 1 to 3 need no sign-in and change nothing. Step 4 needs a session and is the only step that talks to
the API:
  --token-env NAME     read a session token from that environment variable (preferred; never printed).
  --mint-session-for   opt in: inserts ONE row in `sessions` for that user and deletes it again at the end
                       (even if the run fails). This is the only write this script can make, and it never
                       touches any other row. Use it only when the owner has said yes.
Without either flag step 4 is skipped and the report says so.

Prints only counts, milliseconds, megabytes and yes/no flags: never names, tokens, amounts or addresses.
"""
import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# The smallest payload the print page accepts (the same shape the front end's own print test uses): an empty
# family, nothing personal. Every optional section is absent, so only the pipeline is measured.
INVENTED_PAYLOAD = {
    "scopeName": "Pipeline check",
    "allocation": {"by_category": [], "by_amc": [], "total_value": "0"},
    "ter": None,
    "terComparison": None,
    "ranking": None,
    "fundManager": None,
    "scoreSummary": None,
    "portfolioBenchmark": None,
    "fundBenchmark": None,
}


def host_matches(base_url: str, expected_host: str) -> bool:
    """True when the configured front-end address is exactly the expected host (https or http, any port)."""
    return (urlparse(base_url).hostname or "").lower() == expected_host.strip().lower()


def rss_mb_of(proc_status_text: str) -> float:
    """VmRSS from the text of /proc/<pid>/status, in megabytes (0 when the line is absent)."""
    for line in proc_status_text.splitlines():
        if line.startswith("VmRSS:"):
            parts = line.split()
            return int(parts[1]) / 1024 if len(parts) >= 2 and parts[1].isdigit() else 0.0
    return 0.0


def summarise_runs(runs: list[dict]) -> dict:
    """runs: [{ok: bool, status: int|None, ms: float, bytes: int}]. The first run is kept apart (it may start the browser)."""
    if not runs:
        return {"runs": 0}
    ok = [r for r in runs if r["ok"]]
    rest = runs[1:]
    times = [r["ms"] for r in ok]
    codes: dict[str, int] = {}
    for r in runs:
        key = str(r["status"]) if r["status"] is not None else "no-answer"
        codes[key] = codes.get(key, 0) + 1
    return {
        "runs": len(runs),
        "ok": len(ok),
        "failed": len(runs) - len(ok),
        "failure_rate_percent": round(100 * (len(runs) - len(ok)) / len(runs)),
        "status_codes": dict(sorted(codes.items())),
        "first_run_ms": round(runs[0]["ms"]),
        "first_run_ok": runs[0]["ok"],
        "later_runs_failed": sum(1 for r in rest if not r["ok"]),
        "ok_median_ms": round(statistics.median(times)) if times else None,
        "ok_max_ms": round(max(times)) if times else None,
        "pdf_bytes_median": round(statistics.median([r["bytes"] for r in ok])) if ok else None,
    }


def cgroup_memory_mb() -> tuple[float | None, float | None]:
    """(current, ceiling) of this container's memory, in MB, from cgroup v2 (None when unreadable)."""
    def read(path: str) -> float | None:
        try:
            text = Path(path).read_text().strip()
            return None if text == "max" else int(text) / 1024 / 1024
        except (OSError, ValueError):
            return None
    return read("/sys/fs/cgroup/memory.current"), read("/sys/fs/cgroup/memory.max")


def _proc_entries() -> list[Path]:
    try:
        return list(Path("/proc").iterdir())
    except OSError:  # not Linux: nothing to read
        return []


def process_count(needle: str) -> int:
    """How many processes in this container have `needle` in their command line."""
    count = 0
    for entry in _proc_entries():
        if not entry.name.isdigit():
            continue
        try:
            if needle in (entry / "cmdline").read_text().replace("\0", " "):
                count += 1
        except OSError:
            continue
    return count


def chromium_rss_mb() -> tuple[int, float]:
    """(number of chromium processes, their total resident memory in MB)."""
    n, total = 0, 0.0
    for entry in _proc_entries():
        if not entry.name.isdigit():
            continue
        try:
            cmd = (entry / "cmdline").read_text()
            if "chrom" not in cmd.split("\0")[0].lower():
                continue
            total += rss_mb_of((entry / "status").read_text())
            n += 1
        except OSError:
            continue
    return n, total


def get_status(url: str, timeout: float = 15) -> int | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except OSError:
        return None


def post_export(api_base: str, token: str, timeout: float = 60) -> dict:
    body = json.dumps({"scope": "aggregate", "member_id": None, "payload": INVENTED_PAYLOAD}).encode()
    req = urllib.request.Request(
        f"{api_base}/analytics/export/pdf",
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            return {"ok": resp.status == 200 and data[:4] == b"%PDF", "status": resp.status,
                    "ms": (time.perf_counter() - t0) * 1000, "bytes": len(data)}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "ms": (time.perf_counter() - t0) * 1000, "bytes": 0}
    except OSError:
        return {"ok": False, "status": None, "ms": (time.perf_counter() - t0) * 1000, "bytes": 0}


async def three_idle_browsers() -> dict:
    """Start three headless Chromium and report what they hold, then close them."""
    from playwright.async_api import async_playwright

    before_cg, ceiling = cgroup_memory_mb()
    pw = await async_playwright().start()
    browsers = []
    try:
        for _ in range(3):
            browsers.append(await pw.chromium.launch())
        pages = [await b.new_page() for b in browsers]
        for p in pages:
            await p.goto("about:blank")
        n, rss = chromium_rss_mb()
        after_cg, _ = cgroup_memory_mb()
        return {
            "chromium_processes": n,
            "chromium_rss_mb": round(rss),
            "container_mb_before": None if before_cg is None else round(before_cg),
            "container_mb_with_three": None if after_cg is None else round(after_cg),
            "container_ceiling_mb": None if ceiling is None else round(ceiling),
        }
    finally:
        for b in browsers:
            await b.close()
        await pw.stop()


def mint_session(user_id: uuid.UUID, db=None):
    from app.db.session import SessionLocal
    from app.models.enums import AuthIdentityProvider
    from app.services.auth.session import create_session

    db = db or SessionLocal()
    session, raw = create_session(db, user_id, AuthIdentityProvider.EMAIL_OTP, device_info="pipeline-check")
    return db, session.id, raw


def remove_minted_session(db, session_id) -> None:
    from app.models.auth import Session as SessionModel

    db.query(SessionModel).filter(SessionModel.id == session_id).delete()
    db.commit()
    db.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--expect-host", required=True, help="the host FRONTEND_BASE_URL should name, e.g. ls-redesign.unifolio.in")
    ap.add_argument("--api-base", default="http://127.0.0.1:8000")
    ap.add_argument("--runs", type=int, default=12)
    ap.add_argument("--token-env", help="name of an environment variable holding a session token")
    ap.add_argument("--mint-session-for", type=uuid.UUID, help="opt in: one session row is inserted and deleted again")
    ap.add_argument("--skip-browsers", action="store_true")
    args = ap.parse_args()

    from app.config import settings

    print("== 1. Configuration")
    print(f"frontend_base_url_is_expected_host: {'yes' if host_matches(settings.frontend_base_url, args.expect_host) else 'NO'}")
    print(f"uvicorn_processes_seen: {process_count('uvicorn')}")
    cur, ceiling = cgroup_memory_mb()
    print(f"container_memory_mb_now: {None if cur is None else round(cur)}  ceiling_mb: {None if ceiling is None else round(ceiling)}")

    print("== 2. Print page reachable from here")
    status = get_status(f"{settings.frontend_base_url.rstrip('/')}/print/analytics")
    print(f"print_page_http_status: {status}")

    print("== 3. Three idle browsers")
    if args.skip_browsers:
        print("skipped (--skip-browsers)")
    else:
        import asyncio
        try:
            for key, value in asyncio.run(three_idle_browsers()).items():
                print(f"{key}: {value}")
        except Exception as exc:  # report the kind of failure, never its text (it can hold paths)
            print(f"browsers_could_not_start: {type(exc).__name__}")

    print("== 4. Export route across the workers")
    token = os.environ.get(args.token_env, "") if args.token_env else ""
    minted = None
    if not token and args.mint_session_for:
        minted = mint_session(args.mint_session_for)
        token = minted[2]
        print("minted_one_temporary_session: yes (deleted at the end)")
    if not token:
        print("skipped: no session given (pass --token-env or --mint-session-for)")
        return 0
    try:
        runs = [post_export(args.api_base, token) for _ in range(args.runs)]
        for key, value in summarise_runs(runs).items():
            print(f"{key}: {value}")
    finally:
        if minted is not None:
            remove_minted_session(minted[0], minted[1])
            print("temporary_session_deleted: yes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
