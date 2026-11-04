import { existsSync, readFileSync } from "fs";
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
    expect(existsSync(resolve("public", LOGO_FILE.replace(/^\//, "")))).toBe(true);
  });
  it("the person is the designer's own drawing as a PNG with an alpha channel (owner-approved exception), so it has no box", () => {
    expect(SKETCH_FILES.person).toBe("person.png");
    const png = readFileSync(resolve("public/illustrations/auth", SKETCH_FILES.person));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png[25], "PNG colour type 6 is RGBA").toBe(6);
  });
  it("every other sketch is a vector file with a transparent background (no raster, no white backdrop)", () => {
    for (const name of NAMES.filter((n) => n !== "person")) {
      const file = SKETCH_FILES[name];
      expect(file, name).toMatch(/\.svg$/);
      const svg = readFileSync(resolve("public/illustrations/auth", file), "utf8");
      expect(svg, name).not.toMatch(/<image|data:image|xlink:href="http/i);
      expect(svg, name).not.toMatch(/<rect[^>]*width="100%"[^>]*height="100%"[^>]*fill="#?(fff|ffffff|white)"/i);
    }
  });
  it("the logo is the official brand file", () => {
    expect(LOGO_FILE).toBe("/brand/unifolio-logo-light.png");
  });
  it("builds a root-relative address for each", () => {
    expect(sketchSrc("laptop")).toBe("/illustrations/auth/laptop.svg");
    expect(logoSrc()).toBe("/brand/unifolio-logo-light.png");
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
