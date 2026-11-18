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
    expect(css).toMatch(/--auth-mint-from:\s*#F2FCF6/i);
    expect(css).toMatch(/--auth-mint-to:\s*#F8FDF9/i);
    expect(css).toMatch(/--auth-green:\s*#22C55E/i); // palette brand green (the green switch, Batch B Q5)
    expect(css).toMatch(/--auth-card-h:/);
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

// Batch B item 6 (B-10): one keyframe for the tick pop, and the reduced-motion rule that switches it off.
const allBlocks = (start: string) => {
  const found: string[] = [];
  let from = 0;
  for (let at = css.indexOf(start, from); at > -1; at = css.indexOf(start, from)) {
    found.push(block(css.slice(at)));
    from = at + start.length;
  }
  return found;
};

describe("auth-tokens.css: the tick pop (Batch B, item 6)", () => {
  it("defines authTickPop: it grows about 25 percent, then settles to the size of the other ticks, with transform only", () => {
    const frames = block("@keyframes authTickPop");
    expect(frames).toMatch(/scale\(1\.25\)/);
    expect(frames).toMatch(/scale\(1\)/);
    expect(frames).not.toMatch(/\b(top|left|margin|width|height)\s*:/);
  });
  it("applies it through .auth-tick-pop, once (it does not repeat)", () => {
    const rule = block(".auth-tick-pop");
    expect(rule).toMatch(/animation:[^;]*authTickPop/);
    expect(rule).not.toMatch(/infinite/);
  });
  it("switches it off under prefers-reduced-motion, next to the sketch rule", () => {
    const reduced = allBlocks("@media (prefers-reduced-motion: reduce)").join("\n");
    expect(reduced).toMatch(/\.auth-tick-pop\s*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/\.auth-sketch\s*\{[^}]*animation:\s*none/);
  });
});
