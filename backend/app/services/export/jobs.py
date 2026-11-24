import hashlib
import json
import os
import re
import uuid
from contextlib import contextmanager, suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, Literal, TypedDict

from app.config import settings

RETENTION_SECONDS = 600


class Job(TypedDict):
    job_id: str
    user_hash: str
    status: Literal["preparing", "ready", "failed", "cancelled"]
    stage: Literal["collecting", "building", "finishing"]
    sections_total: int
    scope_kind: Literal["family", "member"]
    created_at: str
    updated_at: str
    error_code: str | None
    pdf_bytes: int | None
    cancel: bool


def user_hash(user_id: uuid.UUID) -> str:
    return hashlib.sha256(user_id.bytes).hexdigest()[:16]


def _validate(job_id: str) -> None:
    if not isinstance(job_id, str) or not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise ValueError("Invalid job id.")


def _directory() -> Path:
    return Path(settings.export_job_dir) if settings.export_job_dir else Path(settings.export_lock_dir) / "jobs"


def _path(job_id: str, suffix: str) -> Path:
    _validate(job_id)
    return _directory() / (job_id + suffix)


@contextmanager
def _lock(name: str) -> Iterator[None]:
    root = Path(settings.export_lock_dir)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    fd = os.open(root / name, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        if os.name == "nt":
            import msvcrt
            if os.fstat(fd).st_size == 0:
                os.write(fd, b"0")
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


@contextmanager
def user_creation_lock(user_id: uuid.UUID) -> Iterator[None]:
    with _lock("export-create-" + user_hash(user_id) + ".lock"):
        yield


def _write(path: Path, data: bytes) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    temporary = path.with_name(path.stem + "." + uuid.uuid4().hex + ".tmp")
    try:
        descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        with suppress(FileNotFoundError):
            temporary.unlink()


def _write_job(job: Job) -> None:
    _write(_path(job["job_id"], ".json"), json.dumps(job, separators=(",", ":")).encode("utf-8"))


def read_job(job_id: str) -> Job | None:
    path = _path(job_id, ".json")
    try:
        return json.loads(path.read_bytes())
    except FileNotFoundError:
        return None


def create_job(user_id: uuid.UUID, scope_kind: Literal["family", "member"], sections_total: int) -> str:
    sweep(datetime.now(timezone.utc))
    job_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc).isoformat()
    job: Job = {"job_id": job_id, "user_hash": user_hash(user_id), "status": "preparing",
                "stage": "collecting", "sections_total": sections_total, "scope_kind": scope_kind,
                "created_at": now, "updated_at": now, "error_code": None, "pdf_bytes": None, "cancel": False}
    with _lock("export-jobs.lock"):
        _write_job(job)
    return job_id


def update_job(job_id: str, **fields: object) -> None:
    _validate(job_id)
    if set(fields) - (set(Job.__annotations__) - {"job_id", "user_hash"}):
        raise ValueError("Invalid job fields.")
    if fields.get("error_code") not in (None, "busy", "timeout", "print_error", "too_large", "internal"):
        raise ValueError("Invalid error code.")
    with _lock("export-jobs.lock"):
        job = read_job(job_id)
        if job is None:
            return
        if job["cancel"] or job["status"] in ("cancelled", "failed"):
            return
        job.update(fields)
        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        _write_job(job)


def job_belongs_to(job: Job, user_id: uuid.UUID) -> bool:
    return job["user_hash"] == user_hash(user_id)


def request_cancel(job_id: str) -> None:
    _validate(job_id)
    with _lock("export-jobs.lock"):
        job = read_job(job_id)
        if job is None:
            return
        job.update(cancel=True, status="cancelled", updated_at=datetime.now(timezone.utc).isoformat())
        _write_job(job)
        with suppress(FileNotFoundError):
            _path(job_id, ".pdf").unlink()


def store_pdf(job_id: str, data: bytes) -> None:
    _validate(job_id)
    with _lock("export-jobs.lock"):
        job = read_job(job_id)
        if job is not None and job["status"] == "preparing" and not job["cancel"]:
            _write(_path(job_id, ".pdf"), data)


def open_pdf_once(job_id: str) -> bytes | None:
    source = _path(job_id, ".pdf")
    taken = _path(job_id, "." + uuid.uuid4().hex + ".tmp")
    try:
        os.replace(source, taken)
    except FileNotFoundError:
        return None
    try:
        return taken.read_bytes()
    finally:
        with suppress(FileNotFoundError):
            taken.unlink()


def sweep(now: datetime) -> None:
    directory = _directory()
    if not directory.exists():
        return
    cutoff = now - timedelta(seconds=RETENTION_SECONDS)
    with _lock("export-jobs.lock"):
        for path in directory.iterdir():
            if not re.fullmatch(r"[0-9a-f]{32}(?:\.[0-9a-f]{32})?\.(?:json|pdf|tmp)", path.name):
                continue
            try:
                if path.suffix == ".json":
                    job = read_job(path.stem)
                    if job and job["status"] == "preparing" and datetime.fromisoformat(job["created_at"]) < cutoff:
                        job.update(status="failed", error_code="timeout", updated_at=now.isoformat())
                        _write_job(job)
                        with suppress(FileNotFoundError):
                            _path(job["job_id"], ".pdf").unlink()
                        continue
                if datetime.fromtimestamp(path.stat().st_mtime, timezone.utc) < cutoff:
                    path.unlink()
            except FileNotFoundError:
                continue


def active_job_for_user(user_id: uuid.UUID) -> str | None:
    if not _directory().exists():
        return None
    for path in sorted(_directory().glob("*.json")):
        if re.fullmatch(r"[0-9a-f]{32}", path.stem):
            job = read_job(path.stem)
            if job and job["status"] == "preparing" and job_belongs_to(job, user_id):
                return job["job_id"]
    return None
