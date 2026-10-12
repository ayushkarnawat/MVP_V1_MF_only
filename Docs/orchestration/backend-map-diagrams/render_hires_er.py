import asyncio, pathlib
from playwright.async_api import async_playwright

OUT = pathlib.Path(__file__).parent
STANDALONE = OUT.parent / "unifolio-backend-map.html"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # High DPI: 3x device scale factor for a crisp zoom-in image.
        ctx = await b.new_context(viewport={"width": 1600, "height": 1200}, device_scale_factor=3, color_scheme="light")
        pg = await ctx.new_page()
        await pg.goto(STANDALONE.resolve().as_uri())
        await pg.wait_for_timeout(9000)
        # Isolate just the diagram box, no surrounding prose/table, and give it a touch of padding.
        await pg.add_style_tag(content="""
            body { background: #FCFCFC !important; padding: 24px !important; }
            .wrap { max-width: none !important; }
            .diagram { overflow: visible !important; border-radius: 10px; }
        """)
        width = await pg.evaluate("""() => {
            const svg = document.querySelector('#schema .diagram svg');
            return Math.ceil(svg.getBoundingClientRect().width + 80);
        }""")
        height = await pg.evaluate("""() => {
            const svg = document.querySelector('#schema .diagram svg');
            return Math.ceil(svg.getBoundingClientRect().height + 80);
        }""")
        await pg.set_viewport_size({"width": max(1600, width), "height": max(1200, height)})
        await pg.wait_for_timeout(300)
        path = OUT / "full-er-diagram-HD.png"
        await pg.locator("#schema .diagram").first.screenshot(path=str(path))
        print(path.name)
        import subprocess
        out = subprocess.run(["python3", "-c", f"from PIL import Image; im=Image.open('{path}'); print(im.size)"], capture_output=True, text=True)
        print(out.stdout, out.stderr)
        await b.close()
asyncio.run(main())
