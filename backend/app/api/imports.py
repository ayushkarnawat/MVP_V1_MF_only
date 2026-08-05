import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.import_.parser import ParseError, parse_cas_pdf_bytes
from app.services.import_.schemas import ImportConfirmRequest, ImportConfirmResponse, ImportPreviewResponse
from app.services.import_.service import SchemeConfidenceError, build_import_preview, confirm_import

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/parse", response_model=ImportPreviewResponse)
async def parse_import(file: UploadFile = File(...), password: str = Form(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail={"code": "invalid_file", "message": "Please upload a PDF file."})

    pdf_bytes = await file.read()
    try:
        parse_result = parse_cas_pdf_bytes(pdf_bytes, password)
    except ParseError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc

    return await build_import_preview(parse_result, file.filename)


@router.post("/confirm", response_model=ImportConfirmResponse)
def confirm_import_route(body: ImportConfirmRequest, db: Session = Depends(get_db)):
    try:
        household_member_id = uuid.UUID(body.household_member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="household_member_id must be a valid UUID.") from exc

    try:
        return confirm_import(db, body.session_id, household_member_id, body.scheme_confirmations)
    except SchemeConfidenceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
