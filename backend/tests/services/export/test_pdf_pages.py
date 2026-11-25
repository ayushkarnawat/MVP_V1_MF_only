import pytest

from app.services.export.pdf_pages import PdfPagesError, extract_page_texts, section_pages


def make_pdf(texts: list[str], broken_page: int | None = None) -> bytes:
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for index, text in enumerate(texts):
        page_id = len(objects) + 1
        kids.append(f"{page_id} 0 R")
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 12 Tf 40 750 Td ({escaped}) Tj ET".encode("ascii")
        if index == broken_page:
            stream = b"BT /F1 12 Tf (unterminated"
        objects.extend([
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {page_id + 1} 0 R >>".encode("ascii"),
            f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream",
        ])
    objects[1] = f"<< /Type /Pages /Count {len(texts)} /Kids [{' '.join(kids)}] >>".encode("ascii")
    document = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(document))
        document.extend(f"{number} 0 obj\n".encode("ascii") + obj + b"\nendobj\n")
    xref = len(document)
    document.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        document.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    document.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii"))
    return bytes(document)


def test_extract_page_texts_returns_the_text_of_each_real_pdf_page():
    texts = extract_page_texts(make_pdf(["Invented first page", "Invented second page"]))
    assert [text.strip() for text in texts] == ["Invented first page", "Invented second page"]


def test_section_pages_finds_first_occurrences_and_notes():
    texts = extract_page_texts(make_pdf([
        "Cover", "[[sec:overview-summary]]", "[[sec:overview-summary]] [[sec:holdings-all-stocks]] [[sec:notes]]",
    ]))
    assert section_pages(texts) == {"overview-summary": 2, "holdings-all-stocks": 3, "notes": 3}


def test_garbled_page_returns_empty_text_without_losing_other_pages(caplog):
    texts = extract_page_texts(make_pdf(["Invented readable page", "Hidden invented text"], broken_page=1))
    assert texts[0].strip() == "Invented readable page" and texts[1] == ""
    assert caplog.text == ""


def test_non_pdf_bytes_raise_a_generic_pdf_pages_error(caplog):
    with pytest.raises(PdfPagesError) as exc:
        extract_page_texts(b"invented private text, not a PDF")
    assert "invented private text" not in str(exc.value)
    assert caplog.text == ""


def test_ids_outside_the_marker_pattern_are_ignored():
    assert section_pages(["[[sec:Upper]] [[sec:-start]] [[sec:a_b]] [[sec:]] [[sec:" + "a" * 61 + "]] [[sec:a0-valid]]"]) == {"a0-valid": 1}


def test_parser_diagnostics_are_silent_and_logging_state_is_restored(monkeypatch, caplog):
    import logging
    import pypdf
    from types import SimpleNamespace

    logger = logging.getLogger("pypdf")
    handlers, propagate = logger.handlers, logger.propagate

    class NoisyPage:
        def extract_text(self):
            logging.getLogger("pypdf._page").warning("invented private text [[sec:notes]] page 7")
            return "Readable invented text"

    monkeypatch.setattr(pypdf, "PdfReader", lambda *args, **kwargs: SimpleNamespace(pages=[NoisyPage()]))
    assert extract_page_texts(make_pdf(["Unused invented text"])) == ["Readable invented text"]
    assert caplog.text == ""
    assert logger.handlers is handlers and logger.propagate is propagate


def splice_fixture(widths):
    from io import BytesIO
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, NameObject

    writer = PdfWriter()
    for width in widths:
        page = writer.add_blank_page(width=width, height=200)
        content = DecodedStreamObject()
        content.set_data(f"q\n% Invented page {width}\nQ\n".encode("ascii"))
        page[NameObject("/Contents")] = writer._add_object(content)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def test_splice_first_pages_replaces_only_the_first_n_pages():
    from io import BytesIO
    from pypdf import PdfReader
    from app.services.export.pdf_pages import splice_first_pages

    first, replacement = splice_fixture([101, 102, 103, 104]), splice_fixture([201, 202, 203])
    result = PdfReader(BytesIO(splice_first_pages(first, replacement, 2)))
    assert [int(page.mediabox.width) for page in result.pages] == [201, 202, 103, 104]


def test_splice_keeps_the_page_count_and_the_remaining_pages_byte_for_byte():
    from io import BytesIO
    from pypdf import PdfReader
    from app.services.export.pdf_pages import splice_first_pages

    first = splice_fixture([101, 102, 103, 104])
    original = PdfReader(BytesIO(first))
    result = PdfReader(BytesIO(splice_first_pages(first, splice_fixture([201, 202]), 2)))
    assert len(result.pages) == len(original.pages)
    for index in (2, 3):
        assert result.pages[index].get_contents().get_data() == original.pages[index].get_contents().get_data()
        assert result.pages[index].mediabox == original.pages[index].mediabox


@pytest.mark.parametrize("count,first_bad,replacement_bad", [
    (0, False, False), (-1, False, False), (3, False, False),
    (2, False, False), (1, True, False), (1, False, True),
])
def test_splice_rejects_a_bad_count_and_unreadable_input(count, first_bad, replacement_bad, caplog):
    from app.services.export.pdf_pages import splice_first_pages

    first = b"Invented private invalid first PDF" if first_bad else splice_fixture([101, 102])
    replacement = b"Invented private invalid replacement PDF" if replacement_bad else splice_fixture([201])
    with pytest.raises(PdfPagesError) as exc:
        splice_first_pages(first, replacement, count)
    assert "Invented private" not in str(exc.value)
    assert caplog.text == ""
