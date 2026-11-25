"""Times the PDF export step by step on the staging VM (QA item D-10: measure first, change nothing).

    python scripts/measure_export_staging.py --mint-session-for <user-uuid> [--scope family] [--idle-wait 130]
    python scripts/measure_export_staging.py --token-env EXPORT_CHECK_TOKEN --quick

Run it INSIDE the backend container on the staging VM, for a household that has real statements, and keep
`docker compose logs backend -f` open in a second terminal so the server's own "export finished: ..." lines
(total time, two-pass yes/no, blocked requests) can be pasted back with this output.

What it does (it changes no app code and no stored data except what an export always creates):
  * Sends real exports through the real API (POST /export/report, then polls GET /export/report/<id> every
    0.5 s) and records WHEN each stage change is first seen, in milliseconds from the moment the request went
    out. The job record only has three stages (collecting, building, finishing), so the phases measured are:
      queued    = request sent until "collecting"   (waiting for a browser slot, starting the browser)
      collecting = "collecting" until "building"      (opening the print page)
      building  = "building" until "finishing"        (every section loading its own data, up to 90 s)
      finishing = "finishing" until "ready"           (print pass 1, the contents page-number pass 2, saving)
      download  = fetching the finished file
  * Samples, once a second while a run is in progress: the container's memory, how many Chromium processes
    exist and how much memory they hold, and the container's CPU use over that second.
  * Runs these cases (use --quick to skip the two that need the browser to be idle first):
      1. full, cold   = all 24 sections, cover on, after an idle wait (the browser closes after 120 s idle)
      2. full, warm   = the same again straight after
      3. small, warm  = 2 sections, cover off
      4. small, cold  = 2 sections, cover off, after another idle wait
    It waits 20 s between runs because the server allows one export per user every 15 s.

Needs a session (only for the API calls):
  --token-env NAME     read a session token from that environment variable (preferred; never printed).
  --mint-session-for   opt in: inserts ONE row in `sessions` for that user and deletes it again at the end
                       (even if the run fails). The only database write this script makes.
ROUND 2 (25 Nov; asks WHY the full report prints for about 200 s). Pick one part per command with --part:
  idle      wait for the browser to close, then count Chromium processes and memory with nothing exporting.
  nocover   the full 24-section report with the cover OFF, cold, then again straight away. (No cover means no second
            print. If the second run is no longer slower than the first, the timed-out second print was the cause.)
  sections  one section at a time (cover off, 30 s apart), for --from-section N to --to-section M (1 to 24). Prints the
            print cost of each section and a list sorted by cost.
  probe     one full report with the cover ON, then watches the container's CPU for 5 minutes after the job says
            "ready" (idle CPU should drop to near zero; if it stays busy, leftover work is still running).
  all       every part in that order (about 50 minutes).
Session without a token in any transcript: --mint-session-for-email <the owner's account email> looks the user up
(prints only found yes/no) and mints ONE temporary session row, deleted again at the end. Run through the entrypoint:
  docker compose exec -T -e PYTHONPATH=/app backend /app/docker-entrypoint.sh python /tmp/measure_export_staging.py ...
Prints only counts, milliseconds, megabytes and yes/no flags: never names, tokens, folios, amounts or addresses.
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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

ALL_SECTIONS = [
    "overview-value-over-time", "overview-sips", "overview-mutual-funds", "overview-amc-allocation",
    "overview-family-members", "overview-quick-insights",
    "performance-returns", "performance-portfolio-history", "performance-benchmark-comparison",
    "allocation-asset-class", "allocation-market-cap", "allocation-category-amc", "allocation-fund-manager",
    "holdings-top-by-fund", "holdings-all-stocks",
    "transactions-cash-flow", "transactions-ledger",
    "overlap-common-holdings", "overlap-heatmap", "overlap-top-pairs", "overlap-impact",
    "analytics-cost", "analytics-category", "analytics-ranking",
]
SMALL_SECTIONS = ["overview-mutual-funds", "performance-returns"]

PHASES = [("queued", "collecting"), ("collecting", "building"), ("building", "finishing"), ("finishing", "ready")]
TERMINAL = ("ready", "failed", "cancelled")


def transition_key(job: dict) -> str:
    """One label per observed state: 'preparing/building', 'ready', 'failed' ..."""
    status = job.get("status") or "unknown"
    stage = job.get("stage")
    return f"{status}/{stage}" if status == "preparing" and stage else status


def phase_times(transitions: list[tuple[str, int]]) -> dict[str, int | None]:
    """transitions: [(label, ms_since_request)] in the order first seen. Returns the length of each phase in ms.

    A phase is None when its end was never seen (for example the run failed first). The fast stages can be
    shorter than the 0.5 s polling step, so a very short phase can read 0 or be merged into its neighbour."""
    at: dict[str, int] = {"queued": 0}
    for label, ms in transitions:
        name = label.split("/", 1)[1] if "/" in label else label
        at.setdefault(name, ms)
    out: dict[str, int | None] = {}
    for start, end in PHASES:
        out[f"{start}_to_{end}_ms"] = at[end] - at[start] if start in at and end in at else None
    return out


def summarise(values: list[float]) -> dict:
    if not values:
        return {"n": 0}
    return {"n": len(values), "median": round(statistics.median(values)), "max": round(max(values))}


class Http:
    """The three calls the run needs. Injected so the logic can be tested without a server."""

    def __init__(self, api_base: str, token: str, save_pdf: Path | None = None):
        self.api_base, self.token = api_base.rstrip("/"), token
        self.save_pdf = save_pdf
        if save_pdf is not None:
            if save_pdf.exists():
                raise FileExistsError("refusing to overwrite an existing PDF")
            if not save_pdf.parent.is_dir():
                raise FileNotFoundError("the PDF parent directory must exist")

    def _call(self, method: str, path: str, body: dict | None = None, timeout: float = 60):
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Authorization": f"Bearer {self.token}"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.api_base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()
        except OSError:
            return None, b""

    def post_report(self, options: dict) -> tuple[int | None, dict]:
        status, raw = self._call("POST", "/export/report", options)
        return status, _json(raw)

    def get_job(self, job_id: str) -> tuple[int | None, dict]:
        status, raw = self._call("GET", f"/export/report/{job_id}")
        return status, _json(raw)

    def get_file(self, job_id: str) -> tuple[int | None, int]:
        status, raw = self._call("GET", f"/export/report/{job_id}/file", timeout=120)
        if status == 200 and self.save_pdf is not None:
            try:
                with self.save_pdf.open("xb") as output:
                    output.write(raw)
            except FileExistsError:
                raise FileExistsError("refusing to overwrite an existing PDF") from None
            print(f"saved_pdf: {len(raw)} bytes to {self.save_pdf}")
            self.save_pdf = None  # One capture per invocation; subsequent runs download and discard.
        return status, len(raw)


def _json(raw: bytes) -> dict:
    try:
        value = json.loads(raw.decode() or "{}")
        return value if isinstance(value, dict) else {}
    except (ValueError, UnicodeDecodeError):
        return {}


def run_one(http, options: dict, *, poll_s: float = 0.5, timeout_s: float = 300,
            clock=time.perf_counter, sleep=time.sleep, sampler=None, retries: int = 3) -> dict:
    """One export from request to finished file. Never raises for a server-side failure; reports it."""
    started = clock()
    status, body = None, {}
    for attempt in range(retries + 1):
        started = clock()
        status, body = http.post_report(options)
        code = body.get("code")
        if status in (409, 429) and attempt < retries:  # one already running, or the 15 s cooldown: wait and retry
            sleep(20 if code == "export_cooldown" else 5)
            continue
        break
    if status != 200 or not body.get("job_id"):
        return {"ok": False, "post_status": status, "post_code": body.get("code")}
    job_id = body["job_id"]
    transitions: list[tuple[str, int]] = []
    last = None
    job: dict = {}
    while True:
        _, job = http.get_job(job_id)
        key = transition_key(job)
        if key != last and job:
            transitions.append((key, round((clock() - started) * 1000)))
            last = key
        if sampler is not None:
            sampler()
        if job.get("status") in TERMINAL:
            break
        if clock() - started > timeout_s:
            break
        sleep(poll_s)
    total_ms = round((clock() - started) * 1000)
    result = {
        "ok": job.get("status") == "ready",
        "final_status": job.get("status"),
        "error_code": job.get("error_code"),
        "total_ms_to_ready": total_ms,
        "pdf_bytes": job.get("pdf_bytes"),
        "transitions": transitions,
        **phase_times(transitions),
    }
    if result["ok"]:
        t = clock()
        file_status, size = http.get_file(job_id)
        result["download_ms"] = round((clock() - t) * 1000)
        result["download_status"] = file_status
        result["download_bytes"] = size
    return result


# ---- container samples (Linux cgroup v2; every read is allowed to fail quietly) ----

def _read_int(path: str) -> int | None:
    try:
        text = Path(path).read_text().strip()
        return None if text == "max" else int(text)
    except (OSError, ValueError):
        return None


def cpu_usage_usec() -> int | None:
    try:
        for line in Path("/sys/fs/cgroup/cpu.stat").read_text().splitlines():
            if line.startswith("usage_usec"):
                return int(line.split()[1])
    except (OSError, ValueError, IndexError):
        pass
    return None


def chromium_snapshot() -> tuple[int, float]:
    """(Chromium process count, their resident memory in MB)."""
    count, total = 0, 0.0
    try:
        entries = list(Path("/proc").iterdir())
    except OSError:
        return 0, 0.0
    for entry in entries:
        if not entry.name.isdigit():
            continue
        try:
            cmd = (entry / "cmdline").read_text().split("\0")[0].lower()
            if "chrom" not in cmd:
                continue
            for line in (entry / "status").read_text().splitlines():
                if line.startswith("VmRSS:"):
                    parts = line.split()
                    total += int(parts[1]) / 1024 if len(parts) > 1 and parts[1].isdigit() else 0
            count += 1
        except OSError:
            continue
    return count, total


class Sampler:
    """Called on every poll; keeps the peaks. CPU is the container's use between two samples, as a percent of one core."""

    def __init__(self, clock=time.perf_counter):
        self.clock = clock
        self.mem_peak = 0.0
        self.chromium_peak_count = 0
        self.chromium_peak_mb = 0.0
        self.cpu_peak = 0.0
        self._last_cpu = (None, None)

    def __call__(self) -> None:
        mem = _read_int("/sys/fs/cgroup/memory.current")
        if mem is not None:
            self.mem_peak = max(self.mem_peak, mem / 1024 / 1024)
        count, mb = chromium_snapshot()
        self.chromium_peak_count = max(self.chromium_peak_count, count)
        self.chromium_peak_mb = max(self.chromium_peak_mb, mb)
        usage, at = cpu_usage_usec(), self.clock()
        prev_usage, prev_at = self._last_cpu
        if usage is not None and prev_usage is not None and at > prev_at:
            self.cpu_peak = max(self.cpu_peak, (usage - prev_usage) / 1e6 / (at - prev_at) * 100)
        self._last_cpu = (usage, at)

    def report(self) -> dict:
        return {
            "container_memory_peak_mb": round(self.mem_peak) if self.mem_peak else None,
            "chromium_processes_peak": self.chromium_peak_count,
            "chromium_memory_peak_mb": round(self.chromium_peak_mb),
            "container_cpu_peak_percent_of_one_core": round(self.cpu_peak) if self.cpu_peak else None,
        }


def cases(scope: str, quick: bool, idle_wait: int) -> list[dict]:
    full = {"scope": scope, "section_ids": ALL_SECTIONS, "cover": True, "data_dates": True, "show_folios": "masked"}
    small = {"scope": scope, "section_ids": SMALL_SECTIONS, "cover": False, "data_dates": True, "show_folios": "masked"}
    plan = []
    if not quick:
        plan.append({"name": "full_cold", "wait": idle_wait, "options": full})
    plan.append({"name": "full_warm" if not quick else "full", "wait": 0, "options": full})
    plan.append({"name": "small_warm" if not quick else "small", "wait": 0, "options": small})
    if not quick:
        plan.append({"name": "small_cold", "wait": idle_wait, "options": small})
    return plan


def mint_session(user_id: uuid.UUID):
    from app.db.session import SessionLocal
    from app.models.enums import AuthIdentityProvider
    from app.services.auth.session import create_session

    db = SessionLocal()
    session, raw = create_session(db, user_id, AuthIdentityProvider.EMAIL_OTP, device_info="export-timing")
    return db, session.id, raw


def remove_minted_session(db, session_id) -> None:
    from app.models.auth import Session as SessionModel

    db.query(SessionModel).filter(SessionModel.id == session_id).delete()
    db.commit()
    db.close()


def print_run(name: str, result: dict, samples: dict) -> None:
    print(f"== {name}")
    for key in ("ok", "post_status", "post_code", "final_status", "error_code", "total_ms_to_ready", "pdf_bytes"):
        if key in result:
            print(f"{key}: {result[key]}")
    for start, end in PHASES:
        key = f"{start}_to_{end}_ms"
        if key in result:
            print(f"{start} -> {end}: {result[key]} ms")
    for key in ("download_ms", "download_bytes"):
        if key in result:
            print(f"{key}: {result[key]}")
    print("stage_changes_seen: " + ", ".join(f"{label}@{ms}ms" for label, ms in result.get("transitions", [])))
    for key, value in samples.items():
        print(f"{key}: {value}")



# ---- round 2 -------------------------------------------------------------------------------------------------------

def options_for(scope: str, sections: list[str], cover: bool) -> dict:
    return {"scope": scope, "section_ids": sections, "cover": cover, "data_dates": True, "show_folios": "masked"}


def select_sections(first: int, last: int) -> list[str]:
    """1-based, inclusive. Raises ValueError for an empty or out-of-range selection."""
    if not (1 <= first <= last <= len(ALL_SECTIONS)):
        raise ValueError("--from-section and --to-section must satisfy 1 <= from <= to <= %d" % len(ALL_SECTIONS))
    return ALL_SECTIONS[first - 1:last]


def watch_idle(seconds: float, interval: float, clock=time.perf_counter, sleep=time.sleep) -> list[tuple]:
    """Samples the container every `interval` s for `seconds` s. Each row: (seconds_since_start, cpu_percent_of_one_core,
    chromium_processes, chromium_mb, container_mb). cpu is None when the container's CPU counter cannot be read."""
    series = []
    last_usage, last_at = cpu_usage_usec(), clock()
    start = last_at
    while clock() - start < seconds:
        sleep(interval)
        usage, at = cpu_usage_usec(), clock()
        cpu = None
        if usage is not None and last_usage is not None and at > last_at:
            cpu = round((usage - last_usage) / 1e6 / (at - last_at) * 100)
        count, mb = chromium_snapshot()
        mem = _read_int("/sys/fs/cgroup/memory.current")
        series.append((round(at - start), cpu, count, round(mb), None if mem is None else round(mem / 1048576)))
        last_usage, last_at = usage, at
    return series


def settle_time(series: list[tuple], threshold: int = 25) -> int | None:
    """Seconds (since the watch began) from which every later sample is below `threshold` percent of one core.
    None when the CPU never settled (or could not be read)."""
    settled = None
    for row in reversed(series):
        cpu = row[1]
        if cpu is None or cpu >= threshold:
            break
        settled = row[0]
    return settled


def print_series(name: str, series: list[tuple]) -> None:
    print(f"== {name}: CPU and processes after the job (seconds, cpu % of one core, chromium processes, chromium MB, container MB)")
    for index, row in enumerate(series):
        if index < 12 or index % 6 == 0 or index == len(series) - 1:
            print("  " + ", ".join(str(v) for v in row))
    cpus = [r[1] for r in series if r[1] is not None]
    if cpus:
        print(f"cpu_max_percent: {max(cpus)}  cpu_average_percent: {round(sum(cpus) / len(cpus))}")
    print(f"cpu_settled_below_25_percent_from_second: {settle_time(series)}")
    if series:
        print(f"chromium_processes_at_end: {series[-1][2]}  container_mb_at_end: {series[-1][4]}")


def snapshot_now(label: str) -> None:
    count, mb = chromium_snapshot()
    mem = _read_int("/sys/fs/cgroup/memory.current")
    print(f"{label}: chromium_processes={count} chromium_mb={round(mb)} container_mb={None if mem is None else round(mem / 1048576)}")


def part_idle(idle_wait: int) -> None:
    snapshot_now("before_waiting")
    print(f"-- waiting {idle_wait} s so the export browser closes (it closes after 120 s idle)", flush=True)
    time.sleep(idle_wait)
    snapshot_now("idle_with_nothing_exporting")
    print_series("idle", watch_idle(20, 5))


def part_nocover(http, scope: str, idle_wait: int) -> list[tuple[str, dict]]:
    out = []
    for name, wait in (("full_nocover_cold", idle_wait), ("full_nocover_warm", 20)):
        print(f"-- waiting {wait} s before {name}", flush=True)
        time.sleep(wait)
        sampler = Sampler()
        sampler()
        result = run_one(http, options_for(scope, ALL_SECTIONS, False), sampler=sampler)
        print_run(name, result, sampler.report())
        out.append((name, result))
    return out


def part_sections(http, scope: str, first: int, last: int, gap: int) -> list[tuple[str, dict]]:
    out = []
    for offset, section in enumerate(select_sections(first, last)):
        number = first + offset
        time.sleep(gap if (offset or first > 1) else 0)
        result = run_one(http, options_for(scope, [section], False))
        finishing = result.get("finishing_to_ready_ms")
        print(f"section {number:2d} {section}: ok={result.get('ok')} total_ms={result.get('total_ms_to_ready')} "
              f"building_ms={result.get('building_to_finishing_ms')} finishing_ms={finishing} pdf_bytes={result.get('pdf_bytes')}", flush=True)
        out.append((section, result))
    ranked = sorted(out, key=lambda row: row[1].get("finishing_to_ready_ms") or -1, reverse=True)
    print("== sections ranked by printing cost (finishing stage, ms)")
    for section, result in ranked:
        print(f"{result.get('finishing_to_ready_ms')}  {section}")
    return out


def part_probe(http, scope: str, idle_wait: int) -> None:
    print(f"-- waiting {idle_wait} s before the probe run", flush=True)
    time.sleep(idle_wait)
    sampler = Sampler()
    sampler()
    result = run_one(http, options_for(scope, ALL_SECTIONS, True), sampler=sampler)
    print_run("probe_full_cover_on", result, sampler.report())
    snapshot_now("right_after_ready")
    print_series("probe", watch_idle(300, 5))


def resolve_user(email: str):
    from sqlalchemy import func

    from app.db.session import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        rows = db.query(User.id).filter(func.lower(User.email) == email.strip().lower()).all()
    finally:
        db.close()
    return [r[0] for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api-base", default="http://127.0.0.1:8000")
    ap.add_argument("--scope", default="family", help="'family' or one member's uuid")
    ap.add_argument("--idle-wait", type=int, default=130, help="seconds to leave the browser idle before a cold run")
    ap.add_argument("--quick", action="store_true", help="round 1 only: skip the two cold runs")
    ap.add_argument("--part", choices=["round1", "idle", "nocover", "sections", "probe", "all"], default="round1")
    ap.add_argument("--from-section", type=int, default=1)
    ap.add_argument("--to-section", type=int, default=len(ALL_SECTIONS))
    ap.add_argument("--gap", type=int, default=30, help="seconds between single-section runs")
    ap.add_argument("--token-env", help="name of an environment variable holding a session token")
    ap.add_argument("--mint-session-for", type=uuid.UUID, help="opt in: one session row is inserted and deleted again")
    ap.add_argument("--mint-session-for-email", help="opt in: look the user up by email (prints only found yes/no), then mint one session")
    ap.add_argument("--save-pdf", type=Path, help="save the first successful download here; parent must exist; never overwrite")
    args = ap.parse_args()
    try:
        http = Http(args.api_base, "", save_pdf=args.save_pdf)
    except OSError as exc:
        print(f"stopped: {exc}")
        return 2

    if args.part in ("sections", "all"):
        try:
            select_sections(args.from_section, args.to_section)
        except ValueError as exc:
            print(f"stopped: {exc}")
            return 2

    token = os.environ.get(args.token_env, "") if args.token_env else ""
    minted = None
    if not token:
        user_id = args.mint_session_for
        if user_id is None and args.mint_session_for_email:
            found = resolve_user(args.mint_session_for_email)
            print(f"user_found_for_email: {'yes' if len(found) == 1 else 'NO'} (matches: {len(found)})")
            if len(found) != 1:
                print("stopped: the email must match exactly one user")
                return 2
            user_id = found[0]
        if user_id is not None:
            minted = mint_session(user_id)
            token = minted[2]
            print("minted_one_temporary_session: yes (deleted at the end)")
    if not token:
        print("stopped: no session given (pass --token-env, --mint-session-for or --mint-session-for-email)")
        return 2
    http.token = token
    results: list[tuple[str, dict]] = []
    try:
        if args.part == "round1":
            for index, case in enumerate(cases(args.scope, args.quick, args.idle_wait)):
                wait = case["wait"] or (20 if index else 0)
                if wait:
                    print(f"-- waiting {wait} s before {case['name']}", flush=True)
                    time.sleep(wait)
                sampler = Sampler()
                sampler()
                result = run_one(http, case["options"], sampler=sampler)
                print_run(case["name"], result, sampler.report())
                results.append((case["name"], result))
        if args.part in ("idle", "all"):
            part_idle(args.idle_wait)
        if args.part in ("nocover", "all"):
            results += part_nocover(http, args.scope, args.idle_wait)
        if args.part in ("sections", "all"):
            results += part_sections(http, args.scope, args.from_section, args.to_section, args.gap)
        if args.part in ("probe", "all"):
            part_probe(http, args.scope, args.idle_wait)
    finally:
        if minted is not None:
            remove_minted_session(minted[0], minted[1])
            print("temporary_session_deleted: yes")
    print("== summary (total ms to ready)")
    for name, result in results:
        print(f"{name}: {result.get('total_ms_to_ready')}  ok={result.get('ok')}")
    return 0 if all(r.get("ok") for _, r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
