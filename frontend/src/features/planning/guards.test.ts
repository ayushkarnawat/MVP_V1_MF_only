import { readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { describe, expect, it } from "vitest";

const PLANNING = resolve("src/features/planning");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "fixtures" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && entry.name !== "testData.ts" ? [path] : [];
  });
}

const FILES = sourceFiles(PLANNING);
const read = (file: string) => readFileSync(file, "utf8");
const name = (file: string) => file.slice(PLANNING.length + 1).replaceAll("\\", "/");

describe("Planning front-end guards", () => {
  it("scans the files PL-A creates (not vacuous)", () => {
    const names = FILES.map(name).sort();
    for (const expected of [
      "api.ts", "planningCopy.ts", "planningHistory.ts", "scenarioFormat.ts", "tiles.ts", "types.ts",
      "components/AssetClassChart.tsx", "components/BenchmarkChart.tsx", "components/DivergingBars.tsx",
      "components/MemberRows.tsx", "components/MemberSelect.tsx", "components/MiraInsightsCard.tsx",
      "components/StatTile.tsx",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("never turns a money or percentage string into a float", () => {
    const offenders = FILES.filter(file => /parseFloat|toFixed|Intl\./.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });

  it("uses colour variables only, no hard-coded colours, in the components", () => {
    const offenders = FILES.filter(file => file.endsWith(".tsx"))
      .filter(file => /#[0-9A-Fa-f]{3,8}\b|rgba?\(/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });

  it("does not import another feature (only lib, components, shell and the auth session)", () => {
    const features = resolve("src/features").replaceAll("\\", "/");
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/from\s+["'](\.[^"']*)["']/g)) {
        const target = resolve(dirname(file), match[1]).replaceAll("\\", "/");
        const inFeatures = target.startsWith(`${features}/`);
        const allowed = !inFeatures || target.startsWith(PLANNING.replaceAll("\\", "/")) || /features\/auth\/session$/.test(target);
        if (!allowed) offenders.push(`${name(file)} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not import another feature through the @/ alias either", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/from\s+["']@\/features\/([^"']+)["']/g)) {
        const allowed = match[1] === "planning" || match[1].startsWith("planning/") || match[1] === "auth/session";
        if (!allowed) offenders.push(`${name(file)} -> @/features/${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("draws its bars as plain markup: no chart library and not the kit's bar chart (L28)", () => {
    const offenders = FILES.filter(file => /recharts|d3-|from\s+["']d3["']|components\/ui\/charts/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });

  it("has no console calls and does not use test helpers", () => {
    expect(FILES.filter(file => /console\./.test(read(file))).map(name)).toEqual([]);
    expect(FILES.filter(file => /shell\/testing|setupTests|testData|fixtures/.test(read(file))).map(name)).toEqual([]);
  });

  it("uses only the approved icons (L44)", () => {
    const approved = new Set(["Sprout", "ChartColumn", "TrendingDown", "TrendingUp", "Percent", "Sparkles", "Snowflake", "Lightbulb", "ChevronLeft", "ChevronRight", "Info", "ArrowRight"]);
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g)) {
        for (const icon of match[1].split(",").map(part => part.trim()).filter(Boolean)) {
          if (!approved.has(icon)) offenders.push(`${name(file)} -> ${icon}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
