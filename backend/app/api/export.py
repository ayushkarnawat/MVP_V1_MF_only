import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.services.auth.session import get_data_user
from app.services.dashboard.member_details import require_member
from app.services.export import jobs
from app.services.export.browser_pool import FlockSlotBackend, USER_COOLDOWN_SECONDS
from app.services.export.render import ExportOptions, PrintMember, PrintMeta, build_print_meta, run_export


class _PrivateValidationRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        async def private_handler(request):
            try:
                return await handler(request)
            except RequestValidationError:
                return JSONResponse(status_code=422, content={"detail": "Not allowed."})
        return private_handler


router = APIRouter(prefix="/export", tags=["export"], route_class=_PrivateValidationRoute)
_tasks: set[asyncio.Task[None]] = set()


async def _run(job_id: str, user_id: uuid.UUID, options: ExportOptions, members: list[PrintMember], meta: PrintMeta) -> None:
    try:
        await run_export(job_id, user_id, options, members, meta)
    except asyncio.CancelledError:
        jobs.request_cancel(job_id)
        raise
    except Exception:
        jobs.update_job(job_id, status="failed", error_code="internal")


def _owned(job_id: str, user: User) -> jobs.Job:
    try:
        job = jobs.read_job(job_id)
    except ValueError:
        job = None
    if job is None or not jobs.job_belongs_to(job, user.id):
        raise HTTPException(status_code=404, detail="Not found.")
    return job


@router.post("/report")
async def create_report(options: ExportOptions, user: User = Depends(get_data_user), db: Session = Depends(get_db)):
    if options.scope != "family":
        try:
            member_id = uuid.UUID(options.scope)
        except ValueError:
            raise HTTPException(status_code=404, detail="Not found.") from None
        require_member(db, user.id, member_id)
        options = options.model_copy(update={"scope": str(member_id)})
    # Serialized across workers: two simultaneous POSTs cannot both create jobs.
    with jobs.user_creation_lock(user.id):
        jobs.sweep(datetime.now(timezone.utc))
        active = jobs.active_job_for_user(user.id)
        if active is not None:
            return JSONResponse(status_code=409, content={"code": "export_in_progress", "job_id": active})
        backend = FlockSlotBackend()
        key = jobs.user_hash(user.id)
        handle = backend.try_lock_user(key)
        if handle is None:
            # A cancelled job may still be releasing the browser resources.
            return JSONResponse(status_code=429, content={"code": "export_cooldown"})
        try:
            age = backend.last_done_age(key)
            if age is not None and age < USER_COOLDOWN_SECONDS:
                return JSONResponse(status_code=429, content={"code": "export_cooldown"})
            members, meta = build_print_meta(db, user, options.scope)
            job_id = jobs.create_job(user.id, "family" if options.scope == "family" else "member", len(options.section_ids))
        finally:
            backend.release_user(handle)
        task = asyncio.create_task(_run(job_id, user.id, options, members, meta))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    return {"job_id": job_id, "status": "preparing"}


@router.get("/report/{job_id}")
def report_status(job_id: str, user: User = Depends(get_data_user)):
    jobs.sweep(datetime.now(timezone.utc))
    job = _owned(job_id, user)
    return {key: value for key, value in job.items() if key not in ("user_hash", "cancel")}


@router.get("/report/{job_id}/file")
def report_file(job_id: str, user: User = Depends(get_data_user)):
    jobs.sweep(datetime.now(timezone.utc))
    job = _owned(job_id, user)
    data = jobs.open_pdf_once(job_id) if job["status"] == "ready" else None
    if data is None:
        raise HTTPException(status_code=404, detail="Not found.")
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="Unifolio-portfolio-report-{today}.pdf"',
        "Cache-Control": "no-store",
    })


@router.delete("/report/{job_id}")
def cancel_report(job_id: str, user: User = Depends(get_data_user)):
    _owned(job_id, user)
    jobs.request_cancel(job_id)
    return {"status": "cancelled"}
