import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve("src/styles/auth-tokens.css"), "utf8");
const block = (start: string) => {
  const at = css.indexOf(start);
  expect(at, `${start} is missing`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf("{", at); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(at, i + 1);
  }
  throw new Error("unbalanced css");
};

describe("auth-tokens.css", () => {
  it("defines the mint tints, the card shadow and the step-bar colours", () => {
    expect(css).toMatch(/--auth-mint-from:\s*#E4FAEC/i);
    expect(css).toMatch(/--auth-mint-to:\s*#F6FEF9/i);
    expect(css).toMatch(/--auth-card-shadow:/);
    expect(css).toMatch(/--auth-step-on:/);
    expect(css).toMatch(/--auth-step-off:/);
  });
  it("defines authFloat, and it moves with transform only", () => {
    const frames = block("@keyframes authFloat");
    expect(frames).toMatch(/translateY/);
    expect(frames).not.toMatch(/\b(top|left|margin|width|height)\s*:/);
  });
  it("defines every sketch variant: float (default), tilt and breathe", () => {
    expect(css).toMatch(/\.auth-sketch\s*\{/);
    expect(css).toMatch(/\.auth-sketch\[data-motion="tilt"\]/);
    expect(css).toMatch(/\.auth-sketch\[data-motion="breathe"\]/);
    expect(block("@keyframes authBreathe")).toMatch(/scale\(1\.015\)/);
    expect(block("@keyframes authFloatTilt")).toMatch(/rotate\(1deg\)/);
  });
  it("turns the animation off under prefers-reduced-motion", () => {
    const reduced = block("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toMatch(/\.auth-sketch/);
    expect(reduced).toMatch(/animation:\s*none/);
  });
});
