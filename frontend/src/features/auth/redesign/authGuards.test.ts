import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const REDESIGN = resolve("src/features/auth/redesign");
const sources = readdirSync(REDESIGN).filter((name) => /\.(ts|tsx|css)$/.test(name) && !/\.test\./.test(name));
const read = (path: string) => readFileSync(path, "utf8");

const hex = (css: string, name: string, from = 0): string => {
  const match = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css.slice(from));
  if (!match) throw new Error(`token ${name} not found`);
  return match[1];
};
const luminance = (color: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("auth screen guards (UI round 2, S6 task 6.15)", () => {
  const tokens = read(resolve("src/styles/auth-tokens.css"));
  const palette = read(resolve("src/styles/palette-tokens.css"));
  const mintStops = [hex(tokens, "--auth-mint-from"), hex(tokens, "--auth-mint-to")];

  it("text on the mint panel is at least 4.5:1 (WCAG AA): green, red, body and the muted grey the panel sets", () => {
    const panel = tokens.slice(tokens.indexOf(".auth-left-panel"));
    const muted = hex(panel, "--ui-text-muted");
    const lightPalette = palette.slice(0, palette.indexOf("@media"));
    const text = { "--ui-text": hex(lightPalette, "--ui-text"), "--pos-text": hex(lightPalette, "--pos-text"), "--neg-text": hex(lightPalette, "--neg-text"), muted };
    for (const [name, color] of Object.entries(text)) {
      for (const stop of mintStops) expect(contrast(color, stop), `${name} on ${stop}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("small muted text is at least 4.5:1 on white too", () => {
    const lightPalette = palette.slice(0, palette.indexOf("@media"));
    expect(contrast(hex(lightPalette, "--ui-text-muted"), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
  it("the floating sketches stop moving for people who ask for reduced motion", () => {
    expect(tokens).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.auth-sketch\s*\{\s*animation:\s*none;/);
  });
  it("no redesigned screen has a dark-mode style (auth screens are light only, design Q21)", () => {
    const offenders = sources.filter((name) => /\bdark:/.test(read(resolve(REDESIGN, name))));
    expect(offenders).toEqual([]);
  });
  it("every screen component sits on AuthPage, which forces the light theme", () => {
    const screens = ["LoginEntry", "LoginCode", "SignupPhoneEntry", "SignupCode", "AccountDetails", "EmailCode", "InvestorProfile", "ConnectAccounts", "AllSet"];
    const offenders = screens.filter((name) => !/<AuthPage>/.test(read(resolve(REDESIGN, `${name}.tsx`))));
    expect(offenders).toEqual([]);
  });
  it("the mobile screens never import the redesigned ones (mobile is unchanged, Q20)", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]));
    const offenders = walk(resolve("src/mobile")).filter((file) => /\.(ts|tsx)$/.test(file) && /auth\/redesign/.test(read(file)));
    expect(offenders).toEqual([]);
  });
});
