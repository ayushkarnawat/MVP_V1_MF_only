import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// Batch B Q5 / B-12: the ten auth screens switch to the brand green through auth-tokens.css, using only values from
// Docs/Unifolio Colour Palette.pdf (see Docs/orchestration/2026-11-18-palette-reference-for-workers.md). Red until B-12.
const css = readFileSync(resolve("src/styles/auth-tokens.css"), "utf8");
const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1].trim();
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, `${selector} is missing`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at) + 1);
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("auth-tokens.css: the brand green switch (palette values only)", () => {
  it("the green tokens are the palette's", () => {
    expect(token("--auth-green")).toBe("#22C55E");
    expect(token("--auth-green-ink")).toBe("#15803D");
    expect(token("--auth-step-on")).toBe("#22C55E");
    expect(token("--auth-sel-bg")).toBe("#E9F9EF");
    expect(token("--auth-sel-border")).toBe("#22C55E");
  });
  it("no old green is left anywhere in the file", () => {
    for (const old of ["#09B158", "#067A3D", "#07B659", "#40CD7B", "#F4FCF6", "rgba(9, 177, 88"]) expect(css.toUpperCase()).not.toContain(old.toUpperCase());
  });
  it("the glows and shadows that were green are the new green", () => {
    expect(token("--auth-btn-shadow")).toMatch(/rgba\(34,\s*197,\s*94,/);
    expect(css).toMatch(/box-shadow:\s*0 0 0 3px rgba\(34,\s*197,\s*94,/);
  });
  it("the primary button: dark text on the green, palette hover, pressed and disabled states, a visible focus ring", () => {
    expect(rule(".auth-btn")).toMatch(/color:\s*#111111/i);
    expect(rule(".auth-btn:hover:not(:disabled)")).toMatch(/background:\s*#16A34A/i);
    expect(rule(".auth-btn:active:not(:disabled)")).toMatch(/background:\s*#15803D/i);
    expect(rule(".auth-btn:disabled")).toMatch(/background:\s*#DFDFDF/i);
    expect(rule(".auth-btn:disabled")).toMatch(/color:\s*#717171/i);
    expect(rule(".auth-btn:focus-visible")).toMatch(/outline:\s*2px solid var\(--auth-green\)/);
  });
  it("the countdown button keeps its own grey (B-8) and still wins over the general disabled rule", () => {
    expect(rule(".auth-btn.auth-btn-count:disabled")).toMatch(/background:\s*#DFDFDF/i);
  });
  it("text stays readable: dark text on the button green, and the deep green on white and on the mint panel", () => {
    expect(contrast("#111111", "#22C55E")).toBeGreaterThanOrEqual(7);
    expect(contrast("#15803D", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    for (const stop of ["#F2FCF6", "#F8FDF9"]) expect(contrast("#15803D", stop)).toBeGreaterThanOrEqual(4.5);
  });
  it("the grouped option rows get their own token: the row height minus 6 px, never over 48 px", () => {
    expect(token("--auth-option-h")).toMatch(/^min\(calc\(var\(--auth-row-h\) - 6px\), 48px\)$/);
  });
  it("the grouped list has its own rules: a bordered, rounded group and flat rows with a selected fill and no card shadow", () => {
    expect(rule(".auth-option-group")).toMatch(/border:\s*1px solid #DFDFDF/i);
    expect(rule(".auth-option-group")).toMatch(/border-radius:\s*16px/);
    expect(rule(".auth-option-group[data-invalid=\"true\"]")).toMatch(/border-color:\s*var\(--auth-error-line\)/);
    expect(rule(".auth-option")).toMatch(/background:\s*#FFFFFF/i);
    expect(rule(".auth-option[aria-checked=\"true\"]")).toMatch(/background:\s*var\(--auth-sel-bg\)/);
    expect(rule(".auth-option[aria-checked=\"true\"]")).not.toMatch(/box-shadow:\s*0 0 0 3px/);
    expect(rule(".auth-option:focus-visible")).toMatch(/outline:\s*2px solid var\(--auth-green\)/);
  });
  it("the row divider is the palette's divider colour", () => {
    expect(css).toMatch(/--auth-option-divider:\s*#ECECEC/i);
  });
});
