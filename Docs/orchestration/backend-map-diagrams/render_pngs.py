import asyncio, pathlib
from playwright.async_api import async_playwright

OUT = pathlib.Path(__file__).parent
STANDALONE = OUT.parent / "unifolio-backend-map.html"
SECTIONS = ["aws", "schema", "signup", "login", "onboarding", "upload", "confirm", "pan",
            "family", "portfolio", "plans", "switch", "analytics", "jobs"]
NAMES = {"aws": "aws-architecture", "schema": "full-er-diagram", "signup": "signup-and-otp",
         "login": "login", "onboarding": "onboarding-household", "upload": "cas-upload-password-parsing",
         "confirm": "upload-auto-confirm", "pan": "pan-columns", "family": "multi-person-cas-import",
         "portfolio": "folios-schemes-holdings", "plans": "direct-regular-classification",
         "switch": "family-to-member-view", "analytics": "analytics-tables", "jobs": "background-jobs-eventbridge"}

CSS = """
body { padding: 40px !important; }
.wrap { max-width: none !important; gap: 0 !important; }
.diagram, .tbl-wrap { overflow: visible !important; }
section { background: var(--bg); padding: 36px 40px; }
section p, section ul, section ol { max-width: 1000px !important; }
.pngtitle { font: 600 12px/1 "Manrope", sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--accent-ink); }
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 1000}, device_scale_factor=1.5, color_scheme="light")
        pg = await ctx.new_page()
        await pg.goto(STANDALONE.resolve().as_uri())
        await pg.wait_for_timeout(9000)
        await pg.add_style_tag(content=CSS)
        for i, sid in enumerate(SECTIONS, 1):
            width = await pg.evaluate("""(sid) => {
                document.querySelectorAll('.wrap > *').forEach(el => el.style.display = (el.id === sid) ? '' : 'none');
                const sec = document.getElementById(sid);
                if (!sec.querySelector('.pngtitle')) {
                    const t = document.createElement('span'); t.className = 'pngtitle';
                    t.textContent = 'Unifolio Backend Map · ' + sec.querySelector('h2').textContent;
                    sec.prepend(t);
                }
                const svgW = Math.max(0, ...[...sec.querySelectorAll('.diagram svg')].map(s => s.getBoundingClientRect().width));
                return Math.ceil(Math.max(1100, svgW + 60));
            }""", sid)
            await pg.set_viewport_size({"width": width + 80, "height": 1000})
            await pg.evaluate("(w) => document.querySelector('.wrap').style.width = w + 'px'", width)
            await pg.wait_for_timeout(300)
            path = OUT / f"{i:02d}-{NAMES[sid]}.png"
            await pg.locator(f"#{sid}").screenshot(path=str(path))
            box = await pg.locator(f"#{sid}").bounding_box()
            print(path.name, int(box["width"]), "x", int(box["height"]))
        await b.close()
asyncio.run(main())
