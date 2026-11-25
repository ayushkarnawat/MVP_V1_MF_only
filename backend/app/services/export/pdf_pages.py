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


def splice_first_pages(first_pdf: bytes, replacement_pdf: bytes, count: int) -> bytes:
    with _quiet_parser():
        try:
            from pypdf import PdfReader, PdfWriter

            if count < 1:
                raise ValueError()
            first = PdfReader(BytesIO(first_pdf), strict=True)
            replacement = PdfReader(BytesIO(replacement_pdf), strict=True)
            if len(first.pages) < count or len(replacement.pages) < count:
                raise ValueError()
            writer = PdfWriter()
            for index in range(count):
                writer.add_page(replacement.pages[index])
            for index in range(count, len(first.pages)):
                writer.add_page(first.pages[index])
            output = BytesIO()
            writer.write(output)
            return output.getvalue()
        except Exception:
            raise PdfPagesError("Could not splice PDF pages.") from None
