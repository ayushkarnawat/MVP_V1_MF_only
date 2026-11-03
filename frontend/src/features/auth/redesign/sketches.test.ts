import { existsSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { LOGO_FILE, SKETCH_FILES, SKETCH_MOTION, logoSrc, sketchSrc, type SketchName } from "./sketches";

const NAMES = Object.keys(SKETCH_FILES) as SketchName[];

describe("the auth sketches", () => {
  it("has the eight sketches of the design and the logo", () => {
    expect(NAMES.sort()).toEqual(["cards", "envelope", "idCard", "laptop", "person", "phone", "tick", "wallet"]);
  });
  it("every file exists under public/illustrations/auth", () => {
    for (const name of NAMES) expect(existsSync(resolve("public/illustrations/auth", SKETCH_FILES[name])), name).toBe(true);
    expect(existsSync(resolve("public/illustrations/auth", LOGO_FILE))).toBe(true);
  });
  it("builds a root-relative address for each", () => {
    expect(sketchSrc("laptop")).toBe("/illustrations/auth/laptop-assets.webp");
    expect(logoSrc()).toBe("/illustrations/auth/unifolio-logo.webp");
  });
  it("has the motion of the design's table (distance in px, duration in s)", () => {
    expect(SKETCH_MOTION.laptop).toEqual({ motion: "float", distance: 6, duration: 7 });
    expect(SKETCH_MOTION.phone).toEqual({ motion: "tilt", distance: 5, duration: 6.5 });
    expect(SKETCH_MOTION.envelope).toEqual({ motion: "float", distance: 5, duration: 7 });
    expect(SKETCH_MOTION.idCard).toEqual({ motion: "float", distance: 4, duration: 7.5 });
    expect(SKETCH_MOTION.person).toEqual({ motion: "breathe", distance: 0, duration: 8 });
    expect(SKETCH_MOTION.cards).toEqual({ motion: "float", distance: 6, duration: 8 });
    expect(SKETCH_MOTION.wallet).toEqual({ motion: "float", distance: 6, duration: 7 });
    expect(SKETCH_MOTION.tick).toEqual({ motion: "float", distance: 6, duration: 7 });
  });
});
