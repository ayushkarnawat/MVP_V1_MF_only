import { readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { describe, expect, it } from "vitest";

const ROOT = resolve("src/components/search");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = sourceFiles(ROOT);
const read = (file: string) => readFileSync(file, "utf8");
const name = (file: string) => file.slice(ROOT.length + 1).replaceAll("\\", "/");

describe("search component guards", () => {
  it("scans the expected search-fe-2 source files", () => {
    const names = FILES.map(name).sort();
    for (const expected of [
      "recentSearches.ts",
      "searchApi.ts",
      "searchIndexStore.ts",
      "searchTypes.ts",
      "useSearchIndex.ts",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("allows only features/auth/session from features/ (relative or @/ alias)", () => {
    const features = resolve("src/features").replaceAll("\\", "/");
    const offenders: string[] = [];

    for (const file of FILES) {
      const content = read(file);
      for (const match of content.matchAll(/(?:from\s+|import\(\s*)["'](\.[^"']*)["']/g)) {
        const target = resolve(dirname(file), match[1]).replaceAll("\\", "/");
        if (target.startsWith(`${features}/`) && !/features\/auth\/session$/.test(target)) {
          offenders.push(`${name(file)} -> ${match[1]}`);
        }
      }
      for (const match of content.matchAll(/(?:from\s+|import\(\s*)["']@\/features\/([^"']+)["']/g)) {
        if (match[1] !== "auth/session") {
          offenders.push(`${name(file)} -> @/features/${match[1]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("never uses parseFloat, toFixed, or Intl.", () => {
    expect(FILES.filter((file) => /parseFloat|toFixed|Intl\./.test(read(file))).map(name)).toEqual([]);
  });

  it("has no hard-coded colours", () => {
    expect(
      FILES.filter((file) => /#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/.test(read(file))).map(name),
    ).toEqual([]);
  });
});
