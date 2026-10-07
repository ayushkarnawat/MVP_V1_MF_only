"""Where the generated synthetic CAS PDFs live: outside the repo (2026-10-07),
so they are never committed. The generator scripts, harness and truth.json
stay here in the repo; only the PDFs moved.

Override with UNIFOLIO_SYNTHETIC_CAS=<folder>. Default: the shared
"Unifolio/CAS Files/synthetic" folder on the Desktop (WSL or Windows path,
whichever exists)."""

from __future__ import annotations

import os
from pathlib import Path

_DEFAULTS = (
    "/mnt/c/Users/Dell/Desktop/Unifolio/CAS Files/synthetic",
    "C:/Users/Dell/Desktop/Unifolio/CAS Files/synthetic",
)


def pdf_dir() -> Path:
    env = os.environ.get("UNIFOLIO_SYNTHETIC_CAS")
    if env:
        return Path(env)
    for candidate in _DEFAULTS:
        if Path(candidate).is_dir():
            return Path(candidate)
    return Path(_DEFAULTS[0])
