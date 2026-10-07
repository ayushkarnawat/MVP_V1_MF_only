"""Identify CAS funds against the local AMFI master, with NAV verification."""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
import re
import uuid
from typing import Awaitable, Callable, Literal
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models.reference import Scheme
from app.models.enums import SchemeSource
from app.services.import_.parser import ParsedScheme
from app.core.decimal_utils import quantize_nav

NavSeriesFetcher = Callable[[str], Awaitable[list[tuple[date, Decimal]] | None]]


@dataclass
class Identification:
    status: Literal["verified", "closed", "unlisted", "ask"]
    scheme_id: uuid.UUID | None
    amfi_code: str | None
    name: str
    category: str
    plan_type: Literal["direct", "regular"]
    plan_verified: bool
    identified_by: Literal["isin+nav", "isin", "sibling_nav", "casparser_code+nav", "closed", "none"]
    candidates: list[tuple[str, str]] = field(default_factory=list)
    nav_matched: bool | None = None


def classify_plan(master: Scheme | None, siblings_direct_nav_differs: bool, cas_name: str) -> tuple[str, bool]:
    if master is not None and master.plan_type is not None:
        return master.plan_type.value, True
    name = master.name if master is not None else cas_name
    if re.search(r"\b(?:DIRECT|DIR)\b", name, re.I):
        return "direct", True
    if re.search(r"\b(?:REGULAR|REG)\b", name, re.I):
        return "regular", True
    return "regular", siblings_direct_nav_differs


def _base(name: str) -> str:
    name = re.sub(r"\b(?:DIRECT|DIR|REGULAR|REG|PLAN|GROWTH|IDCW|DIVIDEND|OPTION|PAYOUT|REINVEST(?:MENT)?)\b", "", name, flags=re.I)
    return " ".join(re.findall(r"\w+", name.casefold()))


async def identify_scheme(db: Session, scheme: ParsedScheme, fetch_series: NavSeriesFetcher) -> Identification:
    candidates = db.query(Scheme).filter(Scheme.source != SchemeSource.CAS_ONLY, or_(Scheme.isin == scheme.isin, Scheme.isin_reinvest == scheme.isin)).all() if scheme.isin else []
    isin_hit = bool(candidates)
    if not candidates and scheme.amfi:
        candidates = db.query(Scheme).filter_by(amfi_code=scheme.amfi).all()
    candidate = candidates[0] if candidates else None
    histories = {}

    async def matches(master):
        if not master.amfi_code or scheme.valuation_date is None or scheme.valuation_nav is None:
            return None
        if master.amfi_code not in histories:
            histories[master.amfi_code] = await fetch_series(master.amfi_code)
        nav = next((nav for day, nav in histories[master.amfi_code] or [] if day == scheme.valuation_date), None)
        if nav is None:
            return None
        return abs(quantize_nav(nav) - quantize_nav(scheme.valuation_nav)) <= Decimal("0.0001")

    siblings = []
    if candidate and candidate.base_name:
        siblings = db.query(Scheme).filter_by(amc_name=candidate.amc_name, base_name=candidate.base_name).all()
    else:
        siblings = [s for s in db.query(Scheme).filter_by(amc_name=scheme.amc).all()
                    if _base(s.base_name or s.name) == _base(scheme.name)]

    async def result(master, identified_by, nav_matched):
        differs = False
        if master.plan_type is None and classify_plan(master, False, scheme.name)[1] is False:
            for sibling in siblings:
                if sibling.id != master.id and classify_plan(sibling, False, scheme.name) == ("direct", True):
                    if await matches(sibling) is False:
                        differs = True
                        break
        plan, verified = classify_plan(master, differs, scheme.name)
        return Identification("verified", master.id, master.amfi_code, master.name, master.sebi_category,
                              plan, verified, identified_by, nav_matched=nav_matched)

    if candidate:
        nav_ok = await matches(candidate)
        if isin_hit:
            return await result(candidate, "isin", nav_ok)
        if nav_ok is True:
            return await result(candidate, "casparser_code+nav", True)
    verified_siblings = [s for s in siblings if await matches(s) is True]
    if len(verified_siblings) == 1:
        return await result(verified_siblings[0], "sibling_nav", True)
    plan, verified = classify_plan(None, False, scheme.name)
    if scheme.close_units in (None, 0):
        return Identification("closed", None, None, scheme.name, scheme.scheme_type or "Unclassified",
                              plan, verified, "closed")
    offered = {s.id: s for s in candidates + siblings if s.amfi_code}
    if not offered:
        # Decided 6 Oct: a held fund in no master, with nothing to offer, is
        # imported as an unlisted fund and valued at the statement's own NAV
        # rather than asking a question that has no answers.
        return Identification("unlisted", None, None, scheme.name, scheme.scheme_type or "Unclassified",
                              plan, verified, "none")
    return Identification("ask", None, None, scheme.name, scheme.scheme_type or "Unclassified", plan, verified,
                          "none", [(s.amfi_code, s.name) for s in list(offered.values())[:5]])
