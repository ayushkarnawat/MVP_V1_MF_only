"""Error-path fixtures (2026-10-05): what the upload does with bad inputs.
All password MF@123 unless noted."""
import io, os
from pathlib import Path
import pikepdf, pypdfium2 as pdfium
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from cas_builder import encrypt_pdf, CASBuilder
import gen_scenarios as g

# Reads and writes the PDFs outside the repo (pdf_dir.py).
from pdf_dir import pdf_dir  # noqa: E402
HERE = pdf_dir()
OUT = HERE / "errors"
OUT.mkdir(parents=True, exist_ok=True)
PW = "MF@123"

# 1. Scanned statement: every page of p7_FY rasterised to an image, no text layer.
doc = pdfium.PdfDocument(str(HERE / "p7_FY.pdf"), password=PW)
buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4)
for page in doc:
    img = page.render(scale=1.5).to_pil()
    p = OUT / "_tmp.png"; img.save(p)
    c.drawImage(str(p), 0, 0, width=A4[0], height=A4[1]); c.showPage()
c.save(); (OUT / "_tmp.png").unlink()
encrypt_pdf(buf.getvalue(), PW, str(OUT / "err_scanned.pdf"))

# 2. Summary CAS: same layout, title "Consolidated Account Summary".
class SummaryBuilder(CASBuilder):
    TITLE = "Consolidated Account Summary"
by = {p.slug: p for p in g.PERSONAS}
L = g.ledger_for(by["p3"])
pdf, _ = g.render(by["p3"], L, "FY", g.WFY[1], builder=SummaryBuilder)
encrypt_pdf(pdf, PW, str(OUT / "err_summary.pdf"))

# 3. NSDL demat CAS (detected by its title text).
buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4)
for i, line in enumerate(["NSDL Consolidated Account Statement", "For the period 01-Sep-2026 to 30-Sep-2026",
                          "ISHA MOHAN VERMA", "About NSDL", "Summary of value of holdings"]):
    c.drawString(40, 800 - i * 18, line)
c.save(); encrypt_pdf(buf.getvalue(), PW, str(OUT / "err_nsdl.pdf"))

# 4. Oversized: the 20-year statement plus ~26 MB of attached noise (limit is 25 MB).
with pikepdf.open(HERE / "p20_20yr.pdf", password=PW) as pdf:
    pdf.attachments["padding.bin"] = pikepdf.AttachedFileSpec(pdf, os.urandom(26 * 1024 * 1024))
    pdf.save(OUT / "err_oversize.pdf", encryption=pikepdf.Encryption(user=PW, owner=PW, R=4))

# 5. Truncated download: first 60% of the bytes of a real-sized statement.
data = (HERE / "p20_20yr.pdf").read_bytes()
(OUT / "err_truncated.pdf").write_bytes(data[: int(len(data) * 0.6)])

# 6. Not a PDF at all, with a .pdf name.
(OUT / "err_not_a_pdf.pdf").write_bytes(b"This is a text file renamed to .pdf\n" * 50)

# 7. Unencrypted CAS (some users remove the password before uploading).
with pikepdf.open(HERE / "p3_FY.pdf", password=PW) as pdf:
    pdf.save(OUT / "err_unencrypted.pdf")
print("ok", sorted(x.name for x in OUT.iterdir()))
