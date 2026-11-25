import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest
from PIL import Image


def load_script(name):
    path = Path(__file__).resolve().parents[2] / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


gate = load_script("export_look_gate")


def image_pdf(path, count=1, size=(32, 32)):
    pages = [Image.new("RGB", size, "white") for _ in range(count)]
    try:
        pages[0].save(path, "PDF", save_all=True, append_images=pages[1:], resolution=72)
    finally:
        for page in pages:
            page.close()
    return path


def text_pdf(path, texts):
    # A minimal PDF with Helvetica text streams: PDFium reads real section markers.
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b""]
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    kids = []
    for text in texts:
        page_id = len(objects) + 1
        kids.append(f"{page_id} 0 R")
        objects.append((f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] "
                        f"/Resources << /Font << /F1 3 0 R >> >> /Contents {page_id + 1} 0 R >>").encode())
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 10 Tf 10 50 Td ({escaped}) Tj ET".encode()
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>".encode()
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    path.write_bytes(pdf)
    return path


def captures(tmp_path, count=1, size=(32, 32)):
    pdf = image_pdf(tmp_path / "source.pdf", count, size)
    baseline, candidate = tmp_path / "baseline", tmp_path / "candidate"
    gate.capture(pdf, baseline)
    gate.capture(pdf, candidate)
    return baseline, candidate


def change_pixel(folder, page=1, box=(0, 0, 1, 1), color=(0, 0, 0)):
    path = folder / f"page-{page:03d}.png"
    with Image.open(path) as source:
        image = source.convert("RGB")
    image.paste(color, box)
    image.save(path)
    image.close()


def test_compare_passes_for_identical_pdfs(tmp_path, capsys):
    baseline, candidate = captures(tmp_path)
    assert gate.compare(baseline, candidate).passed
    assert gate.main(["compare", "--baseline", str(baseline), "--candidate", str(candidate)]) == 0
    assert capsys.readouterr().out == "PASS\n"


def test_compare_fails_when_the_page_count_differs(tmp_path, capsys):
    baseline, candidate = captures(tmp_path)
    gate.capture(image_pdf(tmp_path / "two.pdf", 2), candidate)
    assert not gate.compare(baseline, candidate, allow_pages=(1, 2)).passed
    assert gate.main(["compare", "--baseline", str(baseline), "--candidate", str(candidate)]) == 1
    assert capsys.readouterr().out == "page_count: 1 != 2\nFAIL\n"


def test_compare_fails_when_a_section_starts_on_another_page(tmp_path, capsys):
    baseline, candidate = tmp_path / "baseline", tmp_path / "candidate"
    gate.capture(text_pdf(tmp_path / "a.pdf", ["[[sec:overview]]", "Notes"]), baseline)
    gate.capture(text_pdf(tmp_path / "b.pdf", ["Cover", "[[sec:overview]]"]), candidate)
    assert not gate.compare(baseline, candidate, allow_pages=(1, 2)).passed
    assert gate.main(["compare", "--baseline", str(baseline), "--candidate", str(candidate),
                      "--allow-pages", "1-2"]) == 1
    assert capsys.readouterr().out == "sections differ\nFAIL\n"


def test_compare_catches_a_one_pixel_change_above_the_ratio(tmp_path, capsys):
    baseline, candidate = captures(tmp_path)
    change_pixel(candidate)
    assert not gate.compare(baseline, candidate, max_diff_ratio=0.0001).passed
    assert gate.main(["compare", "--baseline", str(baseline), "--candidate", str(candidate),
                      "--max-diff-ratio", "0.0001"]) == 1
    assert capsys.readouterr().out == "page 1: differs (0.0977%)\nFAIL\n"
    change_pixel(candidate, color=(247, 247, 247))
    assert gate.compare(baseline, candidate, max_diff_ratio=0).passed
    change_pixel(candidate, color=(246, 255, 255))
    assert not gate.compare(baseline, candidate, max_diff_ratio=0).passed


def test_compare_ignores_changes_inside_the_mask(tmp_path):
    baseline, candidate = captures(tmp_path)
    change_pixel(candidate)
    manifest_path = candidate / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["text_sha256"][0] = hashlib.sha256(b"Invented changed date").hexdigest()
    manifest_path.write_text(json.dumps(manifest))
    mask = {"pages": {"1": [[0, 0, 1, 1], [0, 0, 1, 1]]}}
    assert gate.compare(baseline, candidate, mask=mask, max_diff_ratio=0).passed
    change_pixel(candidate, box=(1, 0, 2, 1))
    assert not gate.compare(baseline, candidate, mask=mask, max_diff_ratio=0).passed
    assert gate.compare(baseline, candidate, mask={"pages": {"1": [[0, 0, 32, 32]]}}).passed


def test_allow_pages_permits_only_the_listed_pages_to_differ(tmp_path):
    baseline, candidate = captures(tmp_path, count=2)
    change_pixel(candidate, page=1)
    assert gate.compare(baseline, candidate, allow_pages=(1,)).passed
    change_pixel(candidate, page=2)
    assert not gate.compare(baseline, candidate, allow_pages=(1,)).passed
    assert gate.compare(baseline, candidate, allow_pages=(1, 2)).passed


def test_compare_prints_no_text_content(tmp_path, capsys):
    baseline, candidate = tmp_path / "baseline", tmp_path / "candidate"
    gate.capture(text_pdf(tmp_path / "a.pdf", ["Invented confidential sample alpha"]), baseline)
    gate.capture(text_pdf(tmp_path / "b.pdf", ["Invented confidential sample beta"]), candidate)
    # Equal images must not conceal a text-layer change.
    (candidate / "page-001.png").write_bytes((baseline / "page-001.png").read_bytes())
    assert gate.main(["compare", "--baseline", str(baseline), "--candidate", str(candidate)]) == 1
    output = capsys.readouterr().out
    assert output == "page 1: differs (0.0000%)\nFAIL\n"
    assert "Invented" not in output and str(tmp_path) not in output


def test_capture_writes_pages_and_a_manifest_with_section_pages(tmp_path):
    pdf = text_pdf(tmp_path / "markers.pdf", ["Cover", "[[sec:overview]]", "[[sec:overview]] [[sec:notes]]"])
    out = tmp_path / "capture"
    manifest = gate.capture(pdf, out)
    assert set(p.name for p in out.iterdir()) == {"page-001.png", "page-002.png", "page-003.png", "manifest.json"}
    assert manifest == json.loads((out / "manifest.json").read_text())
    assert set(manifest) == {"page_count", "sections", "text_sha256"}
    assert manifest["page_count"] == 3 and manifest["sections"] == {"overview": 2, "notes": 3}
    assert len(manifest["text_sha256"]) == 3
    assert all(re.fullmatch(r"[0-9a-f]{64}", value) for value in manifest["text_sha256"])
    assert manifest["text_sha256"][0] == hashlib.sha256(b"Cover").hexdigest()


def test_two_captures_of_the_same_pdf_compare_equal(tmp_path):
    baseline, candidate = captures(tmp_path, count=3)
    assert gate.compare(baseline, candidate, max_diff_ratio=0).passed


def test_a_one_pixel_change_is_caught_by_the_default_ratio_on_a_realistic_page_size(tmp_path):
    baseline, candidate = captures(tmp_path, size=(595, 842))
    change_pixel(candidate, box=(100, 100, 140, 140))
    assert not gate.compare(baseline, candidate).passed


def test_save_pdf_writes_only_the_requested_path_and_refuses_overwrite(tmp_path, monkeypatch, capsys):
    measure = load_script("measure_export_staging")
    path = tmp_path / "report.pdf"
    http = measure.Http("http://unused", "invented", save_pdf=path)
    monkeypatch.setattr(http, "_call", lambda *args, **kwargs: (200, b"invented PDF bytes"))
    assert http.get_file("invented") == (200, 18)
    assert path.read_bytes() == b"invented PDF bytes"
    assert capsys.readouterr().out == f"saved_pdf: 18 bytes to {path}\n"
    assert http.get_file("invented") == (200, 18)  # later runs discard; never overwrite
    assert capsys.readouterr().out == ""
    assert list(tmp_path.iterdir()) == [path]
    with pytest.raises(FileExistsError, match="refusing to overwrite"):
        measure.Http("http://unused", "invented", save_pdf=path)
