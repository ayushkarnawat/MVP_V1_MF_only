"""B-11: email images for the four Head of Family emails (plain round shapes as the workbook draws them, plus the logo pair).
Sources: Logo/Unifolio Logo Transparent.png (the repo's own transparent logo). No other picture is used and no personal data is involved.
Sizes are 2x the CSS size so they stay sharp on high-resolution screens."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "email-assets")
os.makedirs(OUT, exist_ok=True)
LOGO = "D:/Unifolio code/Logo/Unifolio Logo Transparent.png"


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shape(path, size, fill, ellipse=True):
    """An anti-aliased filled round shape on a transparent background (drawn at 4x, reduced)."""
    w, h = size
    big = Image.new("RGBA", (w * 4, h * 4), (0, 0, 0, 0))
    ImageDraw.Draw(big).ellipse((0, 0, w * 4 - 1, h * 4 - 1), fill=hex_rgb(fill) + (255,))
    big.resize((w, h), Image.LANCZOS).save(path, optimize=True)


# ---- logo pair
src = Image.open(LOGO).convert("RGBA")
box = src.split()[3].getbbox()
src = src.crop(box)
height = 56  # displayed at about 28 px
logo = src.resize((round(src.width * height / src.height), height), Image.LANCZOS)
logo.save(os.path.join(OUT, "logo-light.png"), optimize=True)

dark = logo.copy()
px = dark.load()
for y in range(dark.height):
    for x in range(dark.width):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        is_green = g > r + 40 and g > b + 20  # keep the green ring as it is
        if not is_green:
            px[x, y] = (252, 252, 252, a)  # palette primary text on dark (#FCFCFC), same transparency
dark.save(os.path.join(OUT, "logo-dark.png"), optimize=True)

# ---- illustrations: 150 x 118 CSS px ellipses (workbook .em-ill); light disc #EAFBF0, dark-mode disc #F2FCF6
for name in ("ill-forward", "ill-back"):
    shape(os.path.join(OUT, f"{name}-light.png"), (300, 236), "#EAFBF0")
    shape(os.path.join(OUT, f"{name}-dark.png"), (300, 236), "#F2FCF6")

# ---- icons: 44 px CSS circles (workbook .em-ic); light #EAFBF0, dark mode #1F3B28
for name in ("crown", "layers", "person", "people", "shield", "date", "warn", "link"):
    shape(os.path.join(OUT, f"ic-{name}-light.png"), (88, 88), "#EAFBF0")
    shape(os.path.join(OUT, f"ic-{name}-dark.png"), (88, 88), "#1F3B28")

for f in sorted(os.listdir(OUT)):
    im = Image.open(os.path.join(OUT, f))
    print(f"{f:28s} {im.size[0]}x{im.size[1]} {os.path.getsize(os.path.join(OUT, f))} bytes")
