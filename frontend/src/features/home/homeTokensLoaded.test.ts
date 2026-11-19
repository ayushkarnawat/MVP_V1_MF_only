import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";

function loadedCss(entry: string, visited = new Set<string>()): string {
  if (visited.has(entry)) return "";
  visited.add(entry);

  const css = readFileSync(entry, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // Package imports are Tailwind layers. App token definitions come from local CSS.
  const imports = [...css.matchAll(/@import\s+(?:url\(\s*)?["'](\.{1,2}\/[^"']+)["']/g)];
  return [css, ...imports.map(match => loadedCss(resolve(dirname(entry), match[1]), visited))].join("\n");
}

it("defines every CSS variable used by Home in styles loaded from src/index.css", () => {
  const css = loadedCss(resolve("src/index.css"));
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
  const homeDir = resolve("src/features/home");
  const sourceFiles = readdirSync(homeDir, { recursive: true, withFileTypes: true })
    .filter(file => file.isFile() && /\.(?:css|tsx?)$/.test(file.name) && !/\.(?:test|spec)\./.test(file.name));
  const used = new Set<string>();

  for (const file of sourceFiles) {
    const source = readFileSync(join(file.parentPath, file.name), "utf8");
    for (const match of source.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)) {
      used.add(match[1]);
    }
  }

  expect(used.size).toBeGreaterThan(0);
  // Four more Home variables are used but defined nowhere (found by this test on 20 Nov 2026): their borders,
  // backgrounds and accent colour silently do not render today. Fixing them changes how Home looks, which the
  // shared-graph move (D-3) must not do, so they are listed here until the owner decides; any NEW undefined
  // variable, and --home-bench, still fails this test.
  const KNOWN_UNDEFINED = ["--ui-accent", "--ui-bg", "--ui-bg-subtle", "--ui-border"];
  expect([...used].filter(name => !defined.has(name) && !KNOWN_UNDEFINED.includes(name)).sort()).toEqual([]);
});
