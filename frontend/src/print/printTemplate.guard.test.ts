import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PRINT_DIR = __dirname;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const allFiles = walk(PRINT_DIR);
// The guard itself names the patterns it forbids, so it is not scanned.
const sourceFiles = allFiles.filter((f) => /\.(ts|tsx|css)$/.test(f) && !f.endsWith("printTemplate.guard.test.ts"));
const nonTestSourceFiles = sourceFiles.filter((f) => !/\.test\.(ts|tsx)$/.test(f));

describe("print template guard rails", () => {
  it("no hex colour or rgb() in any file under print/ except print-tokens.css", () => {
    const hexRe = new RegExp("#[0-9a-fA-F]{3,8}\\b");
    const rgbRe = new RegExp("rgba?\\s*\\(", "i");
    for (const file of sourceFiles) {
      const rel = relative(PRINT_DIR, file).replace(/\\/g, "/");
      if (rel === "print-tokens.css") continue;
      const content = readFileSync(file, "utf8");
      expect(content, `${rel} contains hex colour`).not.toMatch(hexRe);
      expect(content, `${rel} contains rgb()`).not.toMatch(rgbRe);
    }
  });

  it('no external URL in any font or style file (no "http", "googleapis", "gstatic")', () => {
    const styleFiles = sourceFiles.filter((f) => f.endsWith(".css"));
    for (const file of styleFiles) {
      const rel = relative(PRINT_DIR, file).replace(/\\/g, "/");
      const content = readFileSync(file, "utf8").toLowerCase();
      expect(content, `${rel} has http`).not.toContain("http");
      expect(content, `${rel} has googleapis`).not.toContain("googleapis");
      expect(content, `${rel} has gstatic`).not.toContain("gstatic");
    }
  });

  it("no parseFloat, toFixed, Intl, console, any in print/", () => {
    const forbidden = [
      new RegExp("\\bparse" + "Float\\b"),
      new RegExp("\\.to" + "Fixed\\b"),
      new RegExp("\\bInt" + "l\\b"),
      new RegExp("\\bcon" + "sole\\b"),
      new RegExp(":\\s*an" + "y\\b"),
      new RegExp("\\bas\\s+an" + "y\\b"),
    ];
    for (const file of sourceFiles) {
      const rel = relative(PRINT_DIR, file).replace(/\\/g, "/");
      const content = readFileSync(file, "utf8");
      for (const re of forbidden) {
        expect(content, `${rel} matched ${re}`).not.toMatch(re);
      }
    }
  });

  it('no "as on" / "as of" literals in print/ (they come from lib/dataDates.ts)', () => {
    const asOnRe = new RegExp("\\bas\\s+(on|of)\\b", "i");
    for (const file of nonTestSourceFiles) {
      const rel = relative(PRINT_DIR, file).replace(/\\/g, "/");
      const content = readFileSync(file, "utf8");
      expect(content, `${rel} contains as on / as of`).not.toMatch(asOnRe);
    }
  });

  it("every <button is absent (a printed page has no buttons)", () => {
    const buttonRe = new RegExp("<but" + "ton\\b", "i");
    for (const file of nonTestSourceFiles) {
      const rel = relative(PRINT_DIR, file).replace(/\\/g, "/");
      const content = readFileSync(file, "utf8");
      expect(content, `${rel} contains <button`).not.toMatch(buttonRe);
    }
  });

  it("no import from another feature (only components/, lib/ and print/)", () => {
    const importRe = /from\s+["']([^"']+)["']/g;
    for (const file of nonTestSourceFiles) {
      const rel = relative(PRINT_DIR, file).replace(/\\/g, "/");
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(importRe)) {
        const target = match[1];
        if (target.startsWith("@/features/") || target.includes("/features/")) {
          throw new Error(`${rel} imports from another feature: ${target}`);
        }
      }
    }
  });

  it("the fonts used are only DM Sans 700 and Manrope", () => {
    const fontsCss = readFileSync(join(PRINT_DIR, "print-fonts.css"), "utf8");
    expect(fontsCss).toContain("DM Sans");
    expect(fontsCss).toContain("Manrope");
    const fontFamilyMatches = Array.from(fontsCss.matchAll(/font-family:\s*["']([^"']+)["']/g)).map(
      (m) => m[1],
    );
    expect(new Set(fontFamilyMatches)).toEqual(new Set(["DM Sans", "Manrope"]));
    expect(fontsCss).toContain("font-weight: 700");
    expect(fontsCss).toContain("font-weight: 400 700");
  });
});
