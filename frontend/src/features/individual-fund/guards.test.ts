import { readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { describe, expect, it } from "vitest";

const ROOT = resolve("src/features/individual-fund");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__support__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = sourceFiles(ROOT);
const read = (file: string) => readFileSync(file, "utf8");
const name = (file: string) => file.slice(ROOT.length + 1).replaceAll("\\", "/");

describe("Individual Fund front-end guards", () => {
  it("scans the files this run creates (not vacuous)", () => {
    const names = FILES.map(name).sort();
    for (const expected of [
      "api.ts", "fundCopy.ts", "fundFormat.ts", "types.ts", "useFundSection.ts", "FundPageFrame.tsx", "OverviewPage.tsx",
      "components/SectionState.tsx", "components/Segmented.tsx",
      "overview/PerformanceChart.tsx", "overview/ReturnsTable.tsx", "overview/ScoreCard.tsx", "overview/StatBand.tsx", "overview/TileDialog.tsx",
      "overview/InvestmentDetails.tsx", "overview/RiskMetrics.tsx", "overview/TopHoldings.tsx", "overview/AllHoldingsDialog.tsx",
      "overview/FundAllocation.tsx", "overview/holdingDialogs.tsx",
      "fixtures/index.ts", "fixtures/schema.ts",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("never turns a money or percentage string into a float for display (no parseFloat, toFixed or Intl, comments included)", () => {
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
        const allowed = !inFeatures || target.startsWith(ROOT.replaceAll("\\", "/")) || /features\/auth\/session$/.test(target);
        if (!allowed) offenders.push(`${name(file)} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not import another feature through the @/ alias either", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/from\s+["']@\/features\/([^"']+)["']/g)) {
        const allowed = match[1] === "individual-fund" || match[1].startsWith("individual-fund/") || match[1] === "auth/session";
        if (!allowed) offenders.push(`${name(file)} -> @/features/${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not import test helpers or leave console output in the sources", () => {
    const helpers = FILES.filter(file => /shell\/testing|setupTests|__support__/.test(read(file))).map(name);
    expect(helpers).toEqual([]);
    const consoles = FILES.filter(file => /\bconsole\./.test(read(file))).map(name);
    expect(consoles).toEqual([]);
  });

  it("calls the backend only through api.ts (no fetch in a component)", () => {
    const offenders = FILES.filter(file => name(file) !== "api.ts" && /\bfetch\(|cachedFetch/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });

  it("builds every link through the shell's typed paths (no hard-coded /portfolio string in a component)", () => {
    const offenders = FILES.filter(file => file.endsWith(".tsx") && /["'`]\/portfolio/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });
});
