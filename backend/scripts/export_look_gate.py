"""Capture and compare PDF pages without printing their text or image paths."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageChops

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Copied from pdf_pages._MARKER; do not import the app's pypdf dependency.
_MARKER = re.compile(r"\[\[sec:([a-z0-9][a-z0-9-]{0,59})\]\]")


class CompareResult:
    def __init__(self, failures: list[str]):
        self.failures = failures

    @property
    def passed(self) -> bool:
        return not self.failures


def capture(pdf_path, out_dir, dpi=72) -> dict:
    if not 0 < dpi < float("inf"):
        raise ValueError("dpi must be positive and finite")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"page_count": 0, "sections": {}, "text_sha256": []}
    with pdfium.PdfDocument(str(pdf_path)) as document:
        manifest["page_count"] = len(document)
        for index in range(len(document)):
            page = document[index]
            try:
                textpage = page.get_textpage()
                try:
                    text = textpage.get_text_range()
                finally:
                    textpage.close()
                for section_id in _MARKER.findall(text):
                    manifest["sections"].setdefault(section_id, index + 1)
                normalised = " ".join(text.split())
                manifest["text_sha256"].append(hashlib.sha256(normalised.encode("utf-8")).hexdigest())
                bitmap = page.render(scale=dpi / 72)
                try:
                    image = bitmap.to_pil()
                    try:
                        image.save(out_dir / f"page-{index + 1:03d}.png", "PNG")
                    finally:
                        image.close()
                finally:
                    bitmap.close()
            finally:
                page.close()
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def _manifest(directory) -> dict:
    value = json.loads((Path(directory) / "manifest.json").read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("invalid manifest")
    count, sections, hashes = (value.get(key) for key in ("page_count", "sections", "text_sha256"))
    if type(count) is not int or count < 0 or not isinstance(sections, dict) or not isinstance(hashes, list):
        raise ValueError("invalid manifest")
    if len(hashes) != count or any(not isinstance(h, str) or not re.fullmatch(r"[0-9a-f]{64}", h) for h in hashes):
        raise ValueError("invalid text hashes")
    if any(not isinstance(key, str) or not _MARKER.fullmatch(f"[[sec:{key}]]")
           or type(page) is not int or not 1 <= page <= count for key, page in sections.items()):
        raise ValueError("invalid section pages")
    return value


def _mask_pages(mask) -> dict:
    if mask is None:
        return {}
    if not isinstance(mask, dict):
        mask = json.loads(Path(mask).read_text(encoding="utf-8"))
    if not isinstance(mask, dict) or not isinstance(mask.get("pages"), dict):
        raise ValueError("invalid mask")
    for page, rectangles in mask["pages"].items():
        if not isinstance(page, str) or not re.fullmatch(r"[1-9][0-9]*", page) or not isinstance(rectangles, list):
            raise ValueError("invalid mask page")
        for rectangle in rectangles:
            if (not isinstance(rectangle, list) or len(rectangle) != 4
                    or any(type(coord) is not int or coord < 0 for coord in rectangle)
                    or rectangle[0] > rectangle[2] or rectangle[1] > rectangle[3]):
                raise ValueError("invalid mask rectangle")
    return mask["pages"]


def _pixel_ratio(baseline, candidate, rectangles) -> tuple[float, bool]:
    with Image.open(baseline) as source_a, Image.open(candidate) as source_b:
        if source_a.size != source_b.size:
            return 1.0, False
        with source_a.convert("RGB") as a, source_b.convert("RGB") as b:
            with ImageChops.difference(a, b) as difference:
                red, green, blue = difference.split()
                try:
                    with ImageChops.lighter(red, green) as rg:
                        with ImageChops.lighter(rg, blue) as maximum:
                            changed = maximum.point(lambda value: 255 if value > 8 else 0)
                finally:
                    red.close()
                    green.close()
                    blue.close()
            with changed, Image.new("L", a.size, 255) as outside:
                width, height = a.size
                for x0, y0, x1, y1 in rectangles:
                    outside.paste(0, (min(x0, width), min(y0, height), min(x1, width), min(y1, height)))
                total = outside.histogram()[255]
                with ImageChops.multiply(changed, outside) as unmasked:
                    return (unmasked.histogram()[255] / total if total else 0.0), True


def compare(baseline_dir, candidate_dir, max_diff_ratio=0.0005, mask=None, allow_pages=()) -> CompareResult:
    if not 0 <= max_diff_ratio <= 1:
        raise ValueError("max-diff-ratio must be between 0 and 1")
    allowed = set(allow_pages)
    if any(type(page) is not int or page < 1 for page in allowed):
        raise ValueError("allow-pages must contain positive page numbers")
    baseline, candidate = _manifest(baseline_dir), _manifest(candidate_dir)
    masks = _mask_pages(mask)
    failures = []
    if baseline["page_count"] != candidate["page_count"]:
        failures.append(f"page_count: {baseline['page_count']} != {candidate['page_count']}")
    if baseline["sections"] != candidate["sections"]:
        failures.append("sections differ")
    for page in range(1, min(baseline["page_count"], candidate["page_count"]) + 1):
        if page in allowed:
            continue
        ratio, same_size = _pixel_ratio(Path(baseline_dir) / f"page-{page:03d}.png",
                                        Path(candidate_dir) / f"page-{page:03d}.png", masks.get(str(page), []))
        same_text = str(page) in masks or baseline["text_sha256"][page - 1] == candidate["text_sha256"][page - 1]
        if not same_size or not same_text or ratio > max_diff_ratio:
            failures.append(f"page {page}: differs ({ratio * 100:.4f}%)")
    return CompareResult(failures)


def _allow_pages(value: str) -> tuple[int, ...]:
    pages = set()
    for part in value.split(","):
        if not re.fullmatch(r"[1-9][0-9]*(?:-[1-9][0-9]*)?", part):
            raise ValueError("invalid allow-pages")
        first, _, last = part.partition("-")
        start, end = int(first), int(last or first)
        if start > end:
            raise ValueError("invalid allow-pages range")
        pages.update(range(start, end + 1))
    return tuple(sorted(pages))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    capture_parser = commands.add_parser("capture")
    capture_parser.add_argument("--pdf", required=True)
    capture_parser.add_argument("--out", required=True)
    capture_parser.add_argument("--dpi", type=float, default=72)
    compare_parser = commands.add_parser("compare")
    compare_parser.add_argument("--baseline", required=True)
    compare_parser.add_argument("--candidate", required=True)
    compare_parser.add_argument("--max-diff-ratio", type=float, default=0.0005)
    compare_parser.add_argument("--mask")
    compare_parser.add_argument("--allow-pages")
    try:
        args = parser.parse_args(argv)
        if args.command == "capture":
            capture(args.pdf, args.out, args.dpi)
            return 0
        result = compare(args.baseline, args.candidate, args.max_diff_ratio, args.mask,
                         _allow_pages(args.allow_pages) if args.allow_pages else ())
    except SystemExit as exc:
        return int(exc.code)
    except (OSError, ValueError, TypeError, pdfium.PdfiumError):
        # Parser/library exceptions may contain paths or PDF text. Keep diagnostics fixed.
        print("error: invalid arguments or unreadable capture data", file=sys.stderr)
        return 2
    for failure in result.failures:
        print(failure)
    print("PASS" if result.passed else "FAIL")
    return 0 if result.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
