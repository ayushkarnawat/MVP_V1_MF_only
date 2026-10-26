import { readdirSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

// Automatic versions of checks every review brief used to ask a reviewer to repeat by hand.
// A hit is either a real violation or a pattern that needs a more precise rule; fix the source, not the guard.
const SHELL_DIR = resolve("src/shell");
const TOKENS_CSS = resolve(SHELL_DIR, "theme/shell-tokens.css");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

// Same comment rule as shellTokensReachable.test.ts: block comments, and "//" at line start or after whitespace.
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
const files = sourceFiles(SHELL_DIR);
const read = (file: string) => stripComments(readFileSync(file, "utf8"));
const rel = (file: string) => relative(SHELL_DIR, file).replaceAll("\\", "/");

describe("shell source guards", () => {
  it("scans a real set of files (not vacuous)", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain(TOKENS_CSS);
  });

  it("defines every --shell-* variable the shell uses", () => {
    const used = new Set(files.flatMap(file => [...read(file).matchAll(/var\(\s*(--shell-[a-z0-9-]+)/g)].map(match => match[1])));
    const defined = new Set([...read(TOKENS_CSS).matchAll(/(--shell-[a-z0-9-]+)\s*:/g)].map(match => match[1]));
    expect(used.size).toBeGreaterThan(5);
    expect([...used].filter(name => !defined.has(name))).toEqual([]);
  });

  it("defines every token in the light, system-dark and data-theme dark blocks", () => {
    const counts = new Map<string, number>();
    for (const match of read(TOKENS_CSS).matchAll(/(--shell-[a-z0-9-]+)\s*:/g)) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
    expect(counts.size).toBeGreaterThan(5);
    expect([...counts].filter(([, count]) => count !== 3).map(([name]) => name)).toEqual([]);
  });

  it("uses no raw hex colours outside the token file (use var(--shell-*))", () => {
    const hex = /["'`(\s:,[]#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
    const offenders = files.filter(file => file !== TOKENS_CSS && hex.test(read(file))).map(rel);
    expect(offenders).toEqual([]);
  });

  it.each([
    ["any type", /:\s*any\b|\bas any\b|<any>|\bany\[\]/],
    ["window.history", /window\.history/],
    ["popstate", /popstate/],
  ])("has no %s", (_label, pattern) => {
    expect(files.filter(file => pattern.test(read(file))).map(rel)).toEqual([]);
  });
});
