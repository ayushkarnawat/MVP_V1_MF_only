import { readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { describe, expect, it } from "vitest";

const PORTFOLIO = resolve("src/features/portfolio").replaceAll("\\", "/");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = sourceFiles(PORTFOLIO);
const read = (file: string) => readFileSync(file, "utf8");
const name = (file: string) => file.replaceAll("\\", "/").slice(PORTFOLIO.length + 1);

describe("Portfolio front-end guards", () => {
  it("scans every file this packet creates (not vacuous)", () => {
    const names = FILES.map(name).sort();
    for (const expected of [
      "PortfolioPage.tsx", "api.ts", "portfolioCopy.ts", "portfolioFormat.ts", "types.ts", "usePortfolioSection.ts",
      "components/InstrumentDonut.tsx", "sections/FamilyMembers.tsx", "sections/InstrumentAllocation.tsx", "sections/SummaryStrip.tsx",
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
        const allowed = !inFeatures || target.startsWith(PORTFOLIO) || /features\/auth\/session$/.test(target);
        if (!allowed) offenders.push(`${name(file)} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not import another feature through the @/ alias either", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/from\s+["']@\/features\/([^"']+)["']/g)) {
        const allowed = match[1] === "portfolio" || match[1].startsWith("portfolio/") || match[1] === "auth/session";
        if (!allowed) offenders.push(`${name(file)} -> @/features/${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("imports from the shell only through its public paths (never its test helpers)", () => {
    const offenders = FILES.filter(file => /shell\/testing|setupTests/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });

  it("does not fetch outside api.ts", () => {
    const offenders = FILES.filter(file => name(file) !== "api.ts" && /\bfetch\(|cachedFetch|authFetch/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });

  it("has no console output and no dangerouslySetInnerHTML", () => {
    const offenders = FILES.filter(file => /console\.|dangerouslySetInnerHTML/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });
});
