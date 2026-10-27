import { readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { describe, expect, it } from "vitest";

const HOME = resolve("src/features/home");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = sourceFiles(HOME);
const read = (file: string) => readFileSync(file, "utf8");
const name = (file: string) => file.slice(HOME.length + 1).replaceAll("\\", "/");

describe("Home front-end guards", () => {
  it("scans the files this packet creates (not vacuous)", () => {
    const names = FILES.map(name).sort();
    for (const expected of [
      "api.ts", "homeFormat.ts", "types.ts", "useHomeSection.ts",
      "components/BenchmarkSelect.tsx", "components/DateRangeCalendar.tsx", "components/PeriodSelector.tsx",
      "components/benchmarkChoice.ts", "components/calendarMath.ts",
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
    const features = resolve("src/features");
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/from\s+["'](\.[^"']*)["']/g)) {
        const target = resolve(dirname(file), match[1]).replaceAll("\\", "/");
        const inFeatures = target.startsWith(`${features.replaceAll("\\", "/")}/`);
        const allowed = !inFeatures || target.startsWith(`${HOME.replaceAll("\\", "/")}`) || /features\/auth\/session$/.test(target);
        if (!allowed) offenders.push(`${name(file)} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not import another feature through the @/ alias either", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/from\s+["']@\/features\/([^"']+)["']/g)) {
        const allowed = match[1] === "home" || match[1].startsWith("home/") || match[1] === "auth/session";
        if (!allowed) offenders.push(`${name(file)} -> @/features/${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not write to the shell or to any file outside the Home folder through imports of test helpers", () => {
    const offenders = FILES.filter(file => /shell\/testing|setupTests/.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });
});
