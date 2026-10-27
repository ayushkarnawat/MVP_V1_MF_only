import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";
import * as charts from "./index";

// Rename safety (UI kit plan, review focus 5): the pages import these from the kit's paths and must never
// define their own copy. A hit here is a real duplicate: delete the copy and import the kit's version.
const KIT_NAMES = ["LineAreaChart", "useMorph", "GroupedBarChart", "ScatterChart"];
const FEATURES = resolve("src/features");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("shared chart kit", () => {
  it("exports every chart, the morph hook and the helpers from the charts index", () => {
    for (const name of ["LineAreaChart", "GroupedBarChart", "ScatterChart", "useMorph", "resample", "niceTicks"]) {
      expect(typeof (charts as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("keeps the existing chart exports", () => {
    expect(typeof (charts as Record<string, unknown>).PieChart).toBe("function");
  });

  it("scans a real set of feature files (not vacuous)", () => {
    expect(sourceFiles(FEATURES).length).toBeGreaterThan(50);
  });

  it("is not redefined inside any page folder", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(FEATURES)) {
      const source = readFileSync(file, "utf8");
      for (const name of KIT_NAMES) {
        if (new RegExp(`\\b(function|const|class)\\s+${name}\\b`).test(source)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
