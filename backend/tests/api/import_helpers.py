"""Shared helpers for the /imports route tests (test_imports_routes.py and
test_imports_people_routes.py)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import patch

from app.models.enums import ConsentDocumentType, TransactionType
from app.services.import_.parser import (
    NormalizedTransaction,
    ParsedInvestor,
    ParsedScheme,
    ParseResult,
    mask_pan,
)
from app.services.import_.people import ParsedPerson, folio_key
from app.services.legal.registry import current_document

SCHEME_NAME = "HDFC Flexi Cap Fund - Direct Plan - Growth"
# Task 9: /imports/parse refuses an upload without the current PAN disclaimer.
PAN_DISCLAIMER_VERSION = current_document(ConsentDocumentType.PAN_DISCLAIMER).version


def _authed_headers(client, phone: str) -> dict[str, str]:
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    return {"Authorization": f"Bearer {token}"}


def _authed_headers_and_member(client, phone: str, name: str = "Test Investor") -> tuple[dict[str, str], str]:
    # Default name matches the sample CAS's holder so a first upload finds Me
    # by name (people detection, Task 6) instead of raising U2.
    headers = _authed_headers(client, phone)
    member = client.post(
        "/household-members",
        json={"name": name, "relationship": "self"},
        headers=headers,
    ).json()
    return headers, member["id"]


def _parse(client, headers, member_id, parse_result, cache_dir):
    from app.services.import_.enrich import mfapi_client

    async def _fake_get_json(_self, url):
        if url.endswith("/latest"):
            return {"meta": {"scheme_category": "Equity Scheme - Flexi Cap Fund"}}
        return [{"schemeCode": "125497", "schemeName": SCHEME_NAME}]

    with (
        patch("app.api.imports.parse_cas_pdf_bytes", return_value=parse_result),
        patch("app.services.import_.enrich.MfApiClient._get_json", new=_fake_get_json),
        # Keep the mfapi disk cache out of backend/.cache.
        patch.object(mfapi_client, "cache_dir", cache_dir),
        patch.object(mfapi_client, "_schemes", None),
    ):
        return client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={
                "password": "x",
                "household_member_id": member_id,
                "pan_disclaimer_version": PAN_DISCLAIMER_VERSION,
            },
            headers=headers,
        )


def _test_db():
    """A session on the same in-memory DB the `client` fixture's routes use."""
    from app.db.session import get_db
    from app.main import app

    return next(app.dependency_overrides[get_db]())


def family_result(persons: list[dict], *, addressee: str | None = None, unassigned: int = 0) -> ParseResult:
    """A ParseResult with people already detected. Each person dict:
    name, pan (or None), needs_name (default False), funds (default 1),
    unclassified (default 0: how many of its funds are plan_type unclassified)."""
    schemes: list[ParsedScheme] = []
    txns: list[NormalizedTransaction] = []
    people: list[ParsedPerson] = []
    n = 0

    def add_fund(person_key: str | None, plan_type: str = "direct") -> tuple[str, str]:
        nonlocal n
        n += 1
        folio = f"{1000 + n}/1"
        amc = "HDFC AMC"
        schemes.append(ParsedScheme(
            name=SCHEME_NAME, isin="INF123", amfi="125497", scheme_type="EQUITY", folio=folio, amc=amc,
            transaction_count=1, arn_code=None, plan_name_variant="direct", plan_type=plan_type,
            person_key=person_key,
        ))
        txns.append(NormalizedTransaction(
            folio=folio, amc=amc, scheme_name=SCHEME_NAME, isin="INF123", amfi="125497", scheme_type="EQUITY",
            txn_date=date(2024, 1, 1), txn_type=TransactionType.PURCHASE, description="Purchase",
            amount=Decimal("5000.00"), units=Decimal("10.000"), nav=Decimal("500.0000"), person_key=person_key,
        ))
        return (amc, folio_key(folio))

    for i, spec in enumerate(persons, start=1):
        key = f"p{i}"
        funds = spec.get("funds", 1)
        unclassified = spec.get("unclassified", 0)
        folio_ids = [
            add_fund(key, "unclassified" if j < unclassified else "direct") for j in range(funds)
        ]
        needs_name = spec.get("needs_name", False)
        people.append(ParsedPerson(
            key=key, pan=spec.get("pan"), pan_masked=mask_pan(spec.get("pan")),
            name=f"Person {i}" if needs_name else spec["name"],
            name_source="placeholder" if needs_name else "holder_line",
            needs_name=needs_name, folio_keys=folio_ids, matched_by_name=[],
        ))
    unassigned_ids = [add_fund(None) for _ in range(unassigned)]

    first_pan = next((p.pan for p in people if p.pan), None)
    return ParseResult(
        investor=ParsedInvestor(
            name=addressee if addressee is not None else (people[0].name if people else None),
            email="t@example.com", pan_masked=mask_pan(first_pan), pan=first_pan,
        ),
        schemes=schemes, transactions=txns, raw_json="{}", parse_warnings=[],
        cas_type="DETAILED", file_type="FileType.CAMS",
        people=people, unassigned_folio_keys=unassigned_ids,
    )
