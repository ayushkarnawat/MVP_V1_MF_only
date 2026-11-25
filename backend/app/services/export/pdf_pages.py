import re
import logging
import threading
from contextlib import contextmanager
from io import BytesIO
from typing import Iterator

_MARKER = re.compile(r"\[\[sec:([a-z0-9][a-z0-9-]{0,59})\]\]")
_PARSER_LOCK = threading.RLock()


class PdfPagesError(Exception):
    pass


@contextmanager
def _quiet_parser() -> Iterator[None]:
    # Parser diagnostics can contain document fragments and object/page numbers.
    with _PARSER_LOCK:
        logger = logging.getLogger("pypdf")
        handlers, propagate = logger.handlers, logger.propagate
        logger.handlers, logger.propagate = [logging.NullHandler()], False
        try:
            yield
        finally:
            logger.handlers, logger.propagate = handlers, propagate


def extract_page_texts(pdf: bytes) -> list[str]:
    with _quiet_parser():
        try:
            from pypdf import PdfReader

            reader = PdfReader(BytesIO(pdf), strict=True)
            count = len(reader.pages)
        except Exception:
            raise PdfPagesError("Could not read PDF.") from None
        texts = []
        for index in range(count):
            try:
                texts.append(reader.pages[index].extract_text() or "")
            except Exception:
                texts.append("")
        return texts


def section_pages(texts: list[str]) -> dict[str, int]:
    pages: dict[str, int] = {}
    for number, text in enumerate(texts, 1):
        for marker in _MARKER.finditer(text):
            pages.setdefault(marker.group(1), number)
    return pages
