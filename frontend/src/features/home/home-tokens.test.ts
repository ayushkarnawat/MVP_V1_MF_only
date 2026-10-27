import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve("src/features/home/home-tokens.css"), "utf8");

// Same three places as the kit's palette-tokens: light (:root), system dark, forced dark.
const LIGHT = /(^|\n):root\s*\{([^}]*)\}/;
const SYSTEM_DARK = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}\s*\}/;
const FORCED_DARK = /(^|\n)\[data-theme="dark"\]\s*\{([^}]*)\}/;

function declarations(block: string | undefined): Map<string, string> {
  return new Map([...(block ?? "").matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}

const light = declarations(CSS.match(LIGHT)?.[2]);
const systemDark = declarations(CSS.match(SYSTEM_DARK)?.[1]);
const forcedDark = declarations(CSS.match(FORCED_DARK)?.[2]);

const REQUIRED = ["--home-bench", "--home-pos-border", "--home-neg-border", "--home-warn-border"];

describe("home-tokens.css", () => {
  it("finds the three blocks", () => {
    expect(light.size).toBeGreaterThan(0);
    expect(systemDark.size).toBeGreaterThan(0);
    expect(forcedDark.size).toBeGreaterThan(0);
  });

  it.each(REQUIRED)("%s is defined in light, system dark and forced dark", name => {
    expect(light.has(name)).toBe(true);
    expect(systemDark.has(name)).toBe(true);
    expect(forcedDark.has(name)).toBe(true);
  });

  it("defines nothing else (the kit already owns every other token)", () => {
    expect([...light.keys()].sort()).toEqual([...REQUIRED].sort());
    expect([...systemDark.keys()].sort()).toEqual([...REQUIRED].sort());
    expect([...forcedDark.keys()].sort()).toEqual([...REQUIRED].sort());
  });

  it("uses the palette's border colours in light", () => {
    expect(light.get("--home-pos-border")).toBe("#EAFBF0");
    expect(light.get("--home-neg-border")).toBe("#F6C6C7");
    expect(light.get("--home-warn-border")).toBe("#FCE0B0");
  });

  it("derives the benchmark colour from the kit's blue (Chart 03) in light and dark", () => {
    expect(light.get("--home-bench")).toBe("var(--c3)");
    expect(systemDark.get("--home-bench")).toBe("var(--c3)");
    expect(forcedDark.get("--home-bench")).toBe("var(--c3)");
  });

  it("uses 35 percent alpha borders in dark, and the same values in both dark blocks", () => {
    expect(systemDark.get("--home-pos-border")).toBe("rgba(34, 197, 94, 0.35)");
    expect(systemDark.get("--home-neg-border")).toBe("rgba(248, 113, 113, 0.35)");
    expect(systemDark.get("--home-warn-border")).toBe("rgba(251, 191, 36, 0.35)");
    expect(forcedDark).toEqual(systemDark);
  });
});
