import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

// Test files are skipped: they may mock the old screens (the shell wrapper still serves one at /profile/legacy), source files may not touch them.
const PROFILE = resolve("src/features/profile-v2");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
const FILES = sourceFiles(PROFILE);
const read = (file: string) => readFileSync(file, "utf8");
const name = (file: string) => file.slice(PROFILE.length + 1).replaceAll("\\", "/");

describe("profile-v2 boundary", () => {
  it("scans a real set of source files (not vacuous)", () => {
    expect(FILES.length).toBeGreaterThan(30);
  });

  it("no source file imports ProfileView, HouseholdMembersSection or FamilyMemberCard from features/profile", () => {
    const offenders = FILES.filter(file =>
      [...read(file).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].some(match => /(^|\/)profile\/(ProfileView|HouseholdMembersSection|FamilyMemberCard)(\.|$)/.test(match[1])),
    ).map(name);
    expect(offenders).toEqual([]);
  });
});

describe("profile-v2 never handles a full PAN", () => {
  it("no source file contains `pan:`, `pan_encrypted` or `decrypt`", () => {
    const offenders = FILES.filter(file => /\bpan\s*:|pan_encrypted|decrypt/i.test(read(file))).map(name);
    expect(offenders).toEqual([]);
  });
});
