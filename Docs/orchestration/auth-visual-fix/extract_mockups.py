"""Extract the owner's two auth mockup PDFs into pictures and a copy text file, so a worker or reviewer can
look at one screen at a time. Nothing here is committed (the PDFs and the output stay on your machine).

    pip install pymupdf
    python extract_mockups.py "C:/Users/<you>/Downloads" ./mockups

Writes, per PDF (tag signup or login):
  <tag>_p<NN>_img<K>.png   the full-size picture embedded in page NN (the clean design is a flat 1536 x 1024 raster)
  <tag>_p<NN>_page.png     the page rendered at 100 dpi (needed for the annotated pages: the red circles are drawn
                           on the page, not part of the picture)
  <tag>_copy.txt           the text of every page (the copy sheets are the pages whose title says "Copy")
"""
import pathlib
import sys

try:
    import pymupdf as fitz
except ImportError:  # older PyMuPDF
    import fitz

PDFS = {
    "signup": "Unifolio Webapp sign up redesign 1.pdf",
    "login": "Unifolio Webapp login redesign 1.pdf",
}


def main(src: str, out: str) -> None:
    source, target = pathlib.Path(src), pathlib.Path(out)
    target.mkdir(parents=True, exist_ok=True)
    for tag, name in PDFS.items():
        doc = fitz.open(source / name)
        lines = []
        for number, page in enumerate(doc, 1):
            for k, image in enumerate(page.get_images(full=True)):
                pix = fitz.Pixmap(doc, image[0])
                if pix.n - pix.alpha > 3:  # CMYK and similar to RGB
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                pix.save(target / f"{tag}_p{number:02d}_img{k}.png")
            page.get_pixmap(dpi=100).save(target / f"{tag}_p{number:02d}_page.png")
            lines.append(f"--- page {number} ---\n{page.get_text().strip()}\n")
        (target / f"{tag}_copy.txt").write_text("\n".join(lines), encoding="utf-8")
        print(f"{tag}: {doc.page_count} pages -> {target}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
