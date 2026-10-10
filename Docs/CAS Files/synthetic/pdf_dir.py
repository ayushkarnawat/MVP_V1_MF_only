"""Where the synthetic CAS PDFs live: in the repo, under pdfs/ (2026-10-10, so the
manager and anyone else can test; every person, PAN and amount in them is fictitious):

  pdfs/realistic/   real-life scenarios for QA and future features (big_family_*, r1_*, r2_*, r3_*)
  pdfs/regression/  import edge cases used by the synthetic gate (p20/p10/p7/p3/px/pk, KFintech,
                    old CAMS, family variants) -- not meant for manual QA
  pdfs/errors/      broken files for the parser's error messages

Override the root with UNIFOLIO_SYNTHETIC_CAS=<folder> (same three subfolders, or a flat folder).
Real CAS statements never go here (.gitignore keeps /Docs/CAS Files/*.pdf out)."""

from __future__ import annotations

import os
from pathlib import Path

_REPO_PDFS = Path(__file__).resolve().parent / "pdfs"


def pdf_dir() -> Path:
    env = os.environ.get("UNIFOLIO_SYNTHETIC_CAS")
    return Path(env) if env else _REPO_PDFS


def pdf_path(name: str) -> Path:
    """A synthetic PDF by file name, wherever it sits: realistic/, regression/ or the root."""
    root = pdf_dir()
    for folder in (root / "realistic", root / "regression", root):
        if (folder / name).exists():
            return folder / name
    return root / "regression" / name
