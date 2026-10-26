import { readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { describe, expect, it } from "vitest";

const ROOT = resolve("src/features/mutual-funds");
// Orchestrator-owned files are not scanned: the contract types, the fixtures and the test helpers.
const OWNED = new Set(["types.ts", "testing.tsx"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "fixtures" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  }).filter(file => !OWNED.has(file.slice(ROOT.length + 1).replaceAll("\\", "/")));
}

const FILES = sourceFiles(ROOT);
const read = (file: string) => readFileSync(file, "utf8");
const name = (file: string) => file.slice(ROOT.length + 1).replaceAll("\\", "/");

describe("Mutual Funds front-end guards", () => {
  it("scans the files this packet creates (not vacuous)", () => {
    const names = FILES.map(name).sort();
    for (const expected of [
      "api.ts", "mfCopy.ts", "data/analyticsStore.ts", "data/useMfDashboard.ts", "frame/MutualFundsFrame.tsx", "frame/ComingSoonPages.tsx",
      "common/SectionCard.tsx", "common/charts.tsx", "overview/SummaryStrip.tsx", "overview/SipTimeline.tsx", "overview/HoldingsTable.tsx",
      "overview/OverviewCards.tsx", "overview/OverviewPage.tsx", "performance/PerformancePage.tsx",
    ]) expect(names).toContain(expected);
    expect(names).toHaveLength(14);
  });

  it("never turns a money or percentage string into a float, comments included", () => {
    expect(FILES.filter(file => /parseFloat|toFixed|Intl\./.test(read(file))).map(name)).toEqual([]);
  });

  it("uses colour variables only, no hard-coded colours", () => {
    expect(FILES.filter(file => /#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/.test(read(file))).map(name)).toEqual([]);
  });

  it("has no console calls and no any type", () => {
    expect(FILES.filter(file => /console\./.test(read(file))).map(name)).toEqual([]);
    expect(FILES.filter(file => /:\s*any\b|\bas any\b|<any>|\bany\[\]/.test(read(file))).map(name)).toEqual([]);
  });

  it("does not import another feature (only lib, components, shell and the auth session)", () => {
    const features = resolve("src/features").replaceAll("\\", "/");
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/(?:from\s+|import\(\s*)["'](\.[^"']*)["']/g)) {
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
        const allowed = match[1] === "mutual-funds" || match[1].startsWith("mutual-funds/") || match[1] === "auth/session";
        if (!allowed) offenders.push(`${name(file)} -> @/features/${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not import the shell's test helpers, the test setup or the orchestrator's helper file", () => {
    expect(FILES.filter(file => /shell\/testing|setupTests|\/testing["']|\.\/fixtures/.test(read(file))).map(name)).toEqual([]);
  });

  it("has no text the owner removed", () => {
    expect(FILES.filter(file => /Sync Investments|Download PDF/i.test(read(file))).map(name)).toEqual([]);
  });

  it("has at least one data-clickable marker for every button element in a file", () => {
    const offenders: string[] = [];
    for (const file of FILES.filter(f => f.endsWith(".tsx"))) {
      const text = read(file);
      const buttons = (text.match(/<button\b/g) ?? []).length;
      const marked = (text.match(/data-clickable/g) ?? []).length;
      if (marked < buttons) offenders.push(`${name(file)}: ${buttons} buttons, ${marked} markers`);
    }
    expect(offenders).toEqual([]);
  });
});
