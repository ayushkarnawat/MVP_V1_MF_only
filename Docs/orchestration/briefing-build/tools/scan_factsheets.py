#!/usr/bin/env python3
"""Read-only factsheet scan: which pages print P/E, P/B and a benchmark, and which pages are pictures.

Usage:  python scan_factsheets.py --dir <folder with PDFs> --out <output folder>
Needs:  pypdfium2 (already in backend/requirements.txt). No database, no network, writes only to --out.

Outputs three CSV files in --out:
  files.csv  one row per PDF: pages, text pages, image-only pages, hit counts
  pages.csv  one row per page: characters, image objects, image coverage, page class, P/E and P/B hit flags
  hits.csv   one row per matching line: kind (PE, PB, BENCHMARK), the line, the next line, the page class
"""
import argparse, csv, hashlib, os, re, sys
import pypdfium2 as pdfium

PE = re.compile(r"(p\s*/\s*e\b|price[\s/-]*(?:to)?[\s-]*earning|\bpe\s+ratio\b|\bp/e\b)", re.I)
PB = re.compile(r"(p\s*/\s*b(?:v)?\b|price[\s/-]*(?:to)?[\s-]*book|\bpb\s+ratio\b|\bp/bv\b|\bpbv\b)", re.I)
BM = re.compile(r"(benchmark|\btier\s*[-]?\s*(?:1|2|i|ii)\b|additional\s+benchmark)", re.I)
NUM = re.compile(r"\d+(?:\.\d+)?")

def classify(chars: int, img_count: int, img_cover: float) -> str:
    if chars >= 50 and img_cover >= 0.5:
        return "mixed"
    if chars >= 50:
        return "text"
    if img_count >= 1 and img_cover >= 0.3:
        return "image_only"
    if img_count >= 1:
        return "image_small"
    return "blank_or_vector"

def scan_pdf(path, writers, root):
    rel = os.path.relpath(path, root)
    amc = os.path.splitext(os.path.basename(path))[0]
    data = open(path, "rb").read()
    sha = hashlib.sha256(data).hexdigest()[:12]
    pdf = pdfium.PdfDocument(path)
    tot = len(pdf)
    counts = {"text": 0, "mixed": 0, "image_only": 0, "image_small": 0, "blank_or_vector": 0}
    pe_pages = pb_pages = bm_pages = 0
    for i in range(tot):
        page = pdf[i]
        tp = page.get_textpage()
        try:
            text = tp.get_text_range() or ""
            chars = len("".join(text.split()))
        finally:
            tp.close()
        w, h = page.get_size()
        area = max(w * h, 1.0)
        img_count, cover = 0, 0.0
        try:
            for obj in page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_IMAGE]):
                img_count += 1
                l, b, r, t = obj.get_pos()
                cover += max(0.0, (r - l)) * max(0.0, (t - b)) / area
        except Exception:
            pass
        cover = min(cover, 1.0)
        cls = classify(chars, img_count, cover)
        counts[cls] += 1
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        pe = pb = bm = False
        for j, ln in enumerate(lines):
            for kind, rx in (("PE", PE), ("PB", PB), ("BENCHMARK", BM)):
                if rx.search(ln):
                    nxt = lines[j + 1] if j + 1 < len(lines) else ""
                    val = ";".join(NUM.findall(ln)[:4])
                    writers["hits"].writerow([rel, amc, i + 1, kind, ln[:220], val, nxt[:160], cls])
                    pe |= kind == "PE"; pb |= kind == "PB"; bm |= kind == "BENCHMARK"
        pe_pages += pe; pb_pages += pb; bm_pages += bm
        writers["pages"].writerow([rel, amc, i + 1, chars, img_count, round(cover * 100, 1), cls, int(pe), int(pb), int(bm)])
        page.close()
    pdf.close()
    writers["files"].writerow([rel, amc, sha, len(data), tot, counts["text"] + counts["mixed"], counts["image_only"], counts["image_small"], counts["blank_or_vector"], pe_pages, pb_pages, bm_pages])
    print(f"{amc:28s} pages={tot:4d} text={counts['text'] + counts['mixed']:4d} image_only={counts['image_only']:3d} blank={counts['blank_or_vector']:3d} | PE pages={pe_pages:3d} PB pages={pb_pages:3d} benchmark pages={bm_pages:3d}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    fh = {k: open(os.path.join(a.out, k + ".csv"), "w", newline="", encoding="utf-8") for k in ("files", "pages", "hits")}
    w = {k: csv.writer(v) for k, v in fh.items()}
    w["files"].writerow(["file", "amc", "sha256_12", "bytes", "pages", "text_pages", "image_only_pages", "image_small_pages", "blank_or_vector_pages", "pages_with_pe", "pages_with_pb", "pages_with_benchmark"])
    w["pages"].writerow(["file", "amc", "page_no", "chars", "image_count", "image_cover_pct", "page_class", "has_pe", "has_pb", "has_benchmark"])
    w["hits"].writerow(["file", "amc", "page_no", "kind", "line_text", "numbers_in_line", "next_line", "page_class"])
    files = []
    for root, _, names in os.walk(a.dir):
        files += [os.path.join(root, n) for n in names if n.lower().endswith(".pdf")]
    if not files:
        sys.exit("no PDF files found under --dir")
    for p in sorted(files):
        try:
            scan_pdf(p, w, a.dir)
        except Exception as e:  # one bad file must not stop the run
            print(f"ERROR {p}: {e}", file=sys.stderr)
    for v in fh.values():
        v.close()
    print("done:", len(files), "files ->", a.out)

if __name__ == "__main__":
    main()
