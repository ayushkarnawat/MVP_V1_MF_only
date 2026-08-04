"""FastAPI application — routes for CAS import and portfolio."""

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.db import get_db, init_db
from app.parser import ParseError, parse_cas_pdf_bytes
from app.schemas import (
    ConfirmMatchRequest,
    ErrorResponse,
    ImportConfirmRequest,
    ImportConfirmResponse,
    ImportHistoryItem,
    ImportPreviewResponse,
    PortfolioSummary,
    SchemeDetail,
    ValuationPoint,
)
from app.schemas import AllocationSlice, HoldingRow
from app.services import (
    build_import_preview,
    confirm_import,
    confirm_scheme_match,
    get_allocation,
    get_holdings,
    get_import_history,
    get_portfolio_summary,
    get_scheme_detail,
    get_valuation_history,
)

app = FastAPI(title="MF Portfolio Import", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/imports/parse", response_model=ImportPreviewResponse)
async def parse_import(
    file: UploadFile = File(...),
    password: str = Form(...),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(code="invalid_file", message="Please upload a PDF file.").model_dump(),
        )
    pdf_bytes = await file.read()
    try:
        parse_result = parse_cas_pdf_bytes(pdf_bytes, password)
    except ParseError as exc:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(code=exc.code, message=exc.message).model_dump(),
        ) from exc

    preview = await build_import_preview(parse_result, file.filename)
    return preview


@app.post("/api/imports/confirm", response_model=ImportConfirmResponse)
def confirm_import_route(
    body: ImportConfirmRequest,
    db: Session = Depends(get_db),
):
    try:
        return confirm_import(db, body.session_id, body.scheme_matches)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/imports", response_model=list[ImportHistoryItem])
def import_history(db: Session = Depends(get_db)):
    return get_import_history(db)


@app.get("/api/portfolio/summary", response_model=PortfolioSummary)
async def portfolio_summary(db: Session = Depends(get_db)):
    return await get_portfolio_summary(db)


@app.get("/api/portfolio/holdings", response_model=list[HoldingRow])
async def portfolio_holdings(db: Session = Depends(get_db)):
    return await get_holdings(db)


@app.get("/api/portfolio/allocation", response_model=list[AllocationSlice])
async def portfolio_allocation(db: Session = Depends(get_db)):
    return await get_allocation(db)


@app.get("/api/portfolio/valuation-history", response_model=list[ValuationPoint])
async def valuation_history(db: Session = Depends(get_db)):
    return await get_valuation_history(db)


@app.get("/api/schemes/{scheme_id}", response_model=SchemeDetail)
async def scheme_detail(scheme_id: int, db: Session = Depends(get_db)):
    detail = await get_scheme_detail(db, scheme_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return detail


@app.post("/api/schemes/{scheme_id}/confirm-match")
def scheme_confirm_match(
    scheme_id: int,
    body: ConfirmMatchRequest,
    db: Session = Depends(get_db),
):
    confirm_scheme_match(db, scheme_id, body.amfi_code)
    return {"status": "ok"}
