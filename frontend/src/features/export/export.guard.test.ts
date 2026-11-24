import { readdirSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

const EXPORT_DIR = resolve("src/features/export");
const TOKENS_CSS = resolve(EXPORT_DIR, "export-tokens.css");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

const files = sourceFiles(EXPORT_DIR);
const read = (file: string) => stripComments(readFileSync(file, "utf8"));
const rel = (file: string) => relative(EXPORT_DIR, file).replaceAll("\\", "/");

describe("export feature source guards", () => {
  it("no hex colour or rgb() in features/export except export-tokens.css", () => {
    const pattern = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
    const offenders = files.filter((f) => f !== TOKENS_CSS && pattern.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it.each([
    ["parseFloat", /\bparseFloat\b/],
    ["toFixed", /\.toFixed\b/],
    ["Intl", /\bIntl\b/],
    ["console", /\bconsole\./],
    ["any", /:\s*any\b|\bas any\b|<any>|\bany\[\]/],
  ])("no %s", (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("every <button has data-clickable and a data-effect from open, close, select, expand, retry, start, download", () => {
    const allowedEffects = new Set(["open", "close", "select", "expand", "retry", "start", "download"]);
    const violations: string[] = [];
    for (const file of files.filter((f) => f.endsWith(".tsx"))) {
      const content = read(file);
      const buttonTags = content.match(/<button\b[\s\S]*?>/g) ?? [];
      for (const tag of buttonTags) {
        if (!tag.includes("data-clickable")) {
          violations.push(`${rel(file)}: missing data-clickable on ${tag.slice(0, 60)}`);
        }
        const effectMatch = tag.match(/data-effect="([^"]+)"/);
        // A row component passes its effect in as a prop (data-effect={effect}): every literal it is given must be allowed.
        if (/data-effect=\{effect\}/.test(tag)) {
          for (const given of content.matchAll(/effect="([^"]+)"/g)) {
            if (!allowedEffects.has(given[1])) violations.push(`${rel(file)}: invalid effect prop ${given[1]}`);
          }
          continue;
        }
        if (!effectMatch || !allowedEffects.has(effectMatch[1])) {
          violations.push(`${rel(file)}: invalid or missing data-effect on ${tag.slice(0, 60)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("no import from another feature (only components/, lib/, shell/, and the feature itself)", () => {
    const violations: string[] = [];
    for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
      const content = read(file);
      const imports = [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of imports) {
        if (spec.includes("/features/") && !spec.includes("/features/export")) {
          violations.push(`${rel(file)}: forbidden import ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("network calls are confined to api.ts and useExportJob.ts", () => {
    const pattern = /\bfetch\s*\(|\bapiClient\b/;
    const offenders = files.filter((f) => !["api.ts", "useExportJob.ts"].includes(rel(f)) && pattern.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});
