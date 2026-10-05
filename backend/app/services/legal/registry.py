"""Registry of the current legal documents users agree to (consent core).

To swap in lawyer-approved text: replace the file under ``documents/`` and
bump its version string below -- nothing else. The sha256 is recomputed from
the file at import time, and ``validate_accepted`` / ``outdated_documents``
key off the version, so every user is asked to agree again automatically.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from app.models.enums import ConsentDocumentType, ConsentPurpose

_DOCUMENTS_DIR = Path(__file__).parent / "documents"


@dataclass(frozen=True)
class LegalDocument:
    document_type: ConsentDocumentType
    version: str
    title: str
    purposes: tuple[ConsentPurpose, ...]
    content: str  # markdown text served to users
    sha256: str  # hex digest of content.encode("utf-8")


def _load(
    document_type: ConsentDocumentType,
    version: str,
    title: str,
    purposes: tuple[ConsentPurpose, ...],
) -> LegalDocument:
    # Text mode with universal newlines: a Windows checkout (CRLF) and the
    # Linux container (LF) read identical content, so the recorded sha256 is
    # the same everywhere for the same version.
    content = (_DOCUMENTS_DIR / f"{document_type.value}.md").read_text(encoding="utf-8")
    return LegalDocument(
        document_type=document_type,
        version=version,
        title=title,
        purposes=purposes,
        content=content,
        sha256=hashlib.sha256(content.encode("utf-8")).hexdigest(),
    )


_CURRENT: dict[ConsentDocumentType, LegalDocument] = {
    ConsentDocumentType.TERMS_OF_SERVICE: _load(
        ConsentDocumentType.TERMS_OF_SERVICE,
        "tos-placeholder-2026-10-01",
        "Terms & Conditions",
        (ConsentPurpose.SERVICE_AGREEMENT,),
    ),
    ConsentDocumentType.PRIVACY_POLICY: _load(
        ConsentDocumentType.PRIVACY_POLICY,
        "privacy-placeholder-2026-10-01",
        "Privacy Policy",
        (ConsentPurpose.ACCOUNT_AND_AUTHENTICATION, ConsentPurpose.PORTFOLIO_TRACKING_ANALYTICS),
    ),
    ConsentDocumentType.PAN_DISCLAIMER: _load(
        ConsentDocumentType.PAN_DISCLAIMER,
        "pan-disclaimer-placeholder-2026-10-05",
        "PAN disclaimer",
        (ConsentPurpose.CAS_PAN_PROCESSING,),
    ),
}


def current_documents() -> dict[ConsentDocumentType, LegalDocument]:
    return dict(_CURRENT)


def current_document(t: ConsentDocumentType) -> LegalDocument:
    return _CURRENT[t]
