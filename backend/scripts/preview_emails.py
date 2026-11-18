"""Write light and dark Head of Family email previews at desktop and phone widths."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_REPO_DIR = _BACKEND_DIR.parent
sys.path.insert(0, str(_BACKEND_DIR))

from app.services.auth.email_templates import (
    _branded_layout,
    _new_head_content,
    _old_head_content,
    _reversed_content,
    _undo_content,
)


def _preview_page(html: str, width: int, title: str) -> str:
    # A fixed-width iframe also gives the email's media queries the chosen viewport.
    safe_title = escape(title)
    return f"""\
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width={width}">
<title>{safe_title}</title>
</head>
<body style="margin:0">
<iframe title="{safe_title}" width="{width}" style="display:block;height:100vh;border:0"
        sandbox srcdoc="{escape(html)}"></iframe>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_folder", type=Path)
    output = parser.parse_args().output_folder.resolve()
    if output.is_relative_to(_REPO_DIR):
        parser.error("refusing to write previews inside the repository")

    old_head, new_head = "Aditi Shanbhag", "Rohan Shanbhag"
    emails = (
        ("new-head", _new_head_content()),
        ("undo", _undo_content(
            "https://ls-redesign.unifolio.in/undo-head-change#token=SAMPLEONLY",
            datetime(2026, 11, 10, 11, 37, tzinfo=timezone.utc),
        )),
        ("old-head", _old_head_content(new_head, old_head)),
        ("changed-back", _reversed_content(old_head, new_head)),
    )
    output.mkdir(parents=True, exist_ok=True)
    for name, email in emails:
        for scheme in ("light", "dark"):
            html = _branded_layout(email, scheme=scheme)
            for width in (600, 375):
                path = output / f"{name}-{scheme}-{width}.html"
                if path.is_symlink():
                    parser.error(f"preview file is a symbolic link: {path}")
                path.write_text(_preview_page(html, width, path.stem), encoding="utf-8", newline="\n")
                print(path)


if __name__ == "__main__":
    main()
