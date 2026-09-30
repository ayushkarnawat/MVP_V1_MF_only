"""Per-folio PAN / holder-name extraction and grouping of folios into people.

Spec: "How people are found" + "Fallbacks". Raw PANs stay inside these
structures (RAM only); nothing here logs or serialises a PAN, and person keys
(`p1`, `p2`, ...) are derived from statement order, never from a PAN.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.services.import_.name_match import compare_names

# A folio is identified by (amc, folio_key), matching casparser's own keying:
# folio numbers are RTA-scoped, so the bare number can collide across AMCs.
FolioId = tuple[str, str]

NameSource = Literal["holder_line", "other_folio", "addressee", "placeholder", "typed"]

# Copied from casparser 1.3.0 parsers/cams_detailed.py FOLIO_LINE_RE (L226-238).
_FOLIO_LINE_RE = re.compile(
    r"Folio\s+No\s*:\s*(\d+(?:\s*/\s*\d+)?)"
    r"(?:.*?PAN\s*:\s*([A-Z]{5}\d{4}[A-Z]))?"
    r"(?:.*?KYC\s*:\s*(OK|NOT OK))?"
    r"(?:.*?PAN\s*:\s*(OK|NOT OK))?",
    re.I,
)
_AMC_RE = re.compile(r"^(.+?\s+(?:MF|Mutual\s*Fund|Fund\s*House))$", re.I)
_DATE_CELL_RE = re.compile(r"^\s*(\d{1,2}[-\s]*[A-Za-z]{3}[-\s]*\d{4})")
_SKIP_LABEL_RE = re.compile(r"^\s*(nominee|registrar|kyc|pan)\b", re.I)
# F8: letters, spaces, dots and apostrophes only; 2-85 chars. Digits, ':' and
# '-' are what scheme/ISIN/amount rows contain, so they are rejected here.
_NAME_SHAPED_RE = re.compile(r"[A-Za-z][A-Za-z .'’]{1,84}")
# Scheme-ish words: a letters-only continuation line of a scheme name (e.g.
# "Parag Parikh Flexi Cap Fund") must not be taken for a holder name.
_REJECT_WORDS_RE = re.compile(
    r"\b(isin|advisor|registrar|fund|plan|growth|scheme|direct|regular|idcw|"
    r"dividend|option|cap|equity|debt|liquid|index|etf)\b",
    re.I,
)


def folio_key(folio: str) -> str:
    return re.sub(r"\s+", "", folio)


@dataclass
class FolioHolder:
    folio_key: str
    pan: str | None
    holder_name: str | None


@dataclass
class ParsedPerson:
    key: str
    pan: str | None
    pan_masked: str | None
    name: str
    name_source: NameSource
    needs_name: bool
    folio_keys: list[FolioId]
    matched_by_name: list[FolioId]


def _is_name_shaped(text: str) -> bool:
    s = text.strip()
    return bool(_NAME_SHAPED_RE.fullmatch(s)) and not _REJECT_WORDS_RE.search(s)


def extract_folio_holders(lines: list[str]) -> dict[FolioId, FolioHolder]:
    holders: dict[FolioId, FolioHolder] = {}
    current_amc = "UNKNOWN"
    for i, raw in enumerate(lines):
        text = raw.strip()
        if _AMC_RE.match(text):
            current_amc = text
            continue
        if "Folio No" not in text or _DATE_CELL_RE.match(text):
            continue
        m = _FOLIO_LINE_RE.search(text)
        if not m:
            continue
        fkey = folio_key(m.group(1))
        fid = (current_amc, fkey)
        if fid in holders:
            continue
        holder_name: str | None = None
        # Look only at the lines right after the header, past label lines.
        # Anything else that isn't a clean name (next header, AMC line, date
        # row, scheme row) means "not readable": never borrow further down,
        # that would attach a neighbouring folio's name.
        for nxt in lines[i + 1 : i + 6]:
            cand = nxt.strip()
            if not cand:
                continue
            if _SKIP_LABEL_RE.match(cand):
                continue
            if (
                "Folio No" not in cand
                and not _AMC_RE.match(cand)
                and not _DATE_CELL_RE.match(cand)
                and _is_name_shaped(cand)
            ):
                holder_name = cand
            break
        holders[fid] = FolioHolder(fkey, m.group(2), holder_name)
    return holders


def read_pdf_lines(pdf_path: str, password: str) -> list[str]:
    # Pinned to casparser 1.3.0: extract_pages is an internal API, re-verify
    # on upgrade.
    from casparser.parsers.extract import extract_pages

    return [line.text for page in extract_pages(pdf_path, password) for line in page.lines]


def _mask(pan: str | None) -> str | None:
    from app.services.import_.parser import mask_pan  # local: parser imports this module

    return mask_pan(pan)


@dataclass
class _Slot:
    pan: str | None
    first: int
    folios: list[tuple[int, FolioId]]
    names: list[str]  # holder names in folio order (may be empty)


def _matches(a: str, b: str) -> bool:
    return compare_names(a, b).result in ("exact", "variant")


def group_people(
    folios: list[tuple[FolioId, str | None]],
    holders: dict[FolioId, FolioHolder],
    addressee_name: str | None,
) -> tuple[list[ParsedPerson], list[FolioId]]:
    def hname(fid: FolioId) -> str | None:
        h = holders.get(fid)
        return h.holder_name if h and h.holder_name else None

    pan_slots: dict[str, _Slot] = {}
    for idx, (fid, pan) in enumerate(folios):
        if not pan:
            continue
        slot = pan_slots.setdefault(pan, _Slot(pan, idx, [], []))
        slot.folios.append((idx, fid))
        n = hname(fid)
        if n:
            slot.names.append(n)

    name_slots: list[_Slot] = []
    matched_by_name: dict[int, list[tuple[int, FolioId]]] = {}  # id(slot) -> folios
    unassigned: list[FolioId] = []
    for idx, (fid, pan) in enumerate(folios):
        if pan:
            continue
        n = hname(fid)
        if not n:
            unassigned.append(fid)
            continue
        hits = [s for s in pan_slots.values() if any(_matches(n, x) for x in s.names)]
        if len(hits) == 1:  # ambiguous (several PAN groups) -> don't guess
            hits[0].folios.append((idx, fid))
            matched_by_name.setdefault(id(hits[0]), []).append((idx, fid))
            continue
        target = next((s for s in name_slots if _matches(n, s.names[0])), None)
        if target is None:
            target = _Slot(None, idx, [], [])
            name_slots.append(target)
        target.folios.append((idx, fid))
        target.names.append(n)

    slots = sorted([*pan_slots.values(), *name_slots], key=lambda s: s.first)
    single_pan_group = len(pan_slots) == 1
    people: list[ParsedPerson] = []
    for n_, slot in enumerate(slots, start=1):
        key = f"p{n_}"
        ordered = [f for _, f in sorted(slot.folios)]
        # Holder line = the first folio that defines the person (for a PAN
        # group, its first PAN folio, not a no-PAN folio placed by name).
        head = sorted(slot.folios)[0][1]
        if slot.pan:
            head = next(f for i, f in sorted(slot.folios) if folios[i][1] == slot.pan)
        name: str | None
        source: NameSource
        if hname(head):
            name, source = hname(head), "holder_line"
        else:
            name, source = None, "placeholder"
        if name is None:
            other = slot.names[0] if slot.names else None
            if other:
                name, source = other, "other_folio"
        if name is None and slot.pan and single_pan_group and addressee_name:
            name, source = addressee_name, "addressee"
        needs_name = False
        if name is None:
            name, source, needs_name = f"Person {n_}", "placeholder", True
        people.append(
            ParsedPerson(
                key=key,
                pan=slot.pan,
                pan_masked=_mask(slot.pan),
                name=name,
                name_source=source,
                needs_name=needs_name,
                folio_keys=ordered,
                matched_by_name=[f for _, f in sorted(matched_by_name.get(id(slot), []))],
            )
        )
    return people, unassigned


def name_warnings(people: list[ParsedPerson]) -> list[str]:
    """Parse warnings for every fallback beyond the holder line. Contains no
    PAN and no name, only the person key."""
    return [
        f"person {p.key}: name not read from statement"
        for p in people
        if p.name_source != "holder_line"
    ]
