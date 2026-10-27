import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve("src/styles/palette-tokens.css"), "utf8");
const INDEX_CSS = readFileSync(resolve("src/index.css"), "utf8");

// The three places a variable must be defined: light (:root), system dark, forced dark.
const LIGHT = /(^|\n):root\s*\{([^}]*)\}/;
const SYSTEM_DARK = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}\s*\}/;
const FORCED_DARK = /(^|\n)\[data-theme="dark"\]\s*\{([^}]*)\}/;

function names(block: string | undefined): Set<string> {
  return new Set([...(block ?? "").matchAll(/(--[a-z0-9-]+)\s*:/g)].map(match => match[1]));
}

const light = names(CSS.match(LIGHT)?.[2]);
const systemDark = names(CSS.match(SYSTEM_DARK)?.[1]);
const forcedDark = names(CSS.match(FORCED_DARK)?.[2]);

const REQUIRED = [
  "--c1", "--c2", "--c3", "--c4", "--c5", "--c6", "--c7", "--c8",
  "--pos", "--pos-text", "--pos-bg",
  "--warn", "--warn-text", "--warn-bg",
  "--neg", "--neg-text", "--neg-bg",
  "--ui-page", "--ui-card", "--ui-elevated", "--ui-divider", "--ui-border-hover", "--ui-row-hover",
  "--ui-text", "--ui-text-muted", "--ui-focus", "--ui-disabled-text", "--ui-disabled-border",
  "--ui-tooltip-bg", "--ui-tooltip-text",
];

describe("palette tokens", () => {
  it("finds all three blocks (the test is not vacuous)", () => {
    expect(light.size).toBeGreaterThan(20);
    expect(systemDark.size).toBeGreaterThan(20);
    expect(forcedDark.size).toBeGreaterThan(20);
  });

  it.each(REQUIRED)("%s is defined in light, system dark and forced dark", name => {
    expect(light.has(name)).toBe(true);
    expect(systemDark.has(name)).toBe(true);
    expect(forcedDark.has(name)).toBe(true);
  });

  it("defines the same variables in both dark blocks", () => {
    expect([...systemDark].sort()).toEqual([...forcedDark].sort());
  });

  it("never defines a shell variable", () => {
    expect(CSS).not.toMatch(/--shell-[a-z-]+\s*:/);
  });

  it("is imported by the app stylesheet", () => {
    expect(INDEX_CSS).toMatch(/@import\s+["']\.\/styles\/palette-tokens\.css["']/);
  });
});
