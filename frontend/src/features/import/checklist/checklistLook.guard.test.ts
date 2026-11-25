import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const checklistDir = __dirname;
const importDir = resolve(checklistDir, "..");

const touchedFiles = [
  resolve(checklistDir, "CamsChecklist.tsx"),
  resolve(checklistDir, "CamsChecklistHost.tsx"),
  resolve(importDir, "RequestCamsPath.tsx"),
  resolve(importDir, "TwoPathImportContainer.tsx"),
  resolve(importDir, "usePendingCamsRequest.ts"),
  resolve(importDir, "pendingCopy.ts"),
];

const allowedEffects = new Set([
  "open",
  "switch",
  "retry",
  "close",
  "select",
  "expand",
  "navigate",
  "sort",
]);

describe("checklistLook guard", () => {
  it("contains no hex colours or rgb() in touched files (only checklist-tokens.css may)", () => {
    const hexOrRgb = /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/;
    for (const file of touchedFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(hexOrRgb);
    }
  });

  it("uses cams-checklist-window as the window root class and no --color-* token in CamsChecklist.tsx", () => {
    const source = readFileSync(resolve(checklistDir, "CamsChecklist.tsx"), "utf8");
    expect(source).toContain("cams-checklist-window");
    expect(source).not.toMatch(/--color-/);
  });

  it("ensures every <button has data-clickable and an allowed data-effect", () => {
    const buttonTag = /<button\b[\s\S]*?(?<!=)>/g;
    for (const file of touchedFiles) {
      const source = readFileSync(file, "utf8");
      const tags = source.match(buttonTag) ?? [];
      for (const tag of tags) {
        expect(tag, file).toContain("data-clickable");
        const effectMatch = tag.match(/data-effect="([^"]+)"/);
        expect(effectMatch, `${file}: ${tag}`).not.toBeNull();
        expect(allowedEffects.has(effectMatch![1]), `${file}: ${effectMatch![1]}`).toBe(true);
      }
    }
  });

  it("has no new bare JSX text literals in CamsChecklist.tsx or CamsChecklistHost.tsx", () => {
    const files = [
      resolve(checklistDir, "CamsChecklist.tsx"),
      resolve(checklistDir, "CamsChecklistHost.tsx"),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // Strip {...} JSX expressions and check for any non-whitespace text between > and <
      const withoutExprs = source.replace(/\{[^{}]*\}/g, "");
      const textBetweenTags = [...withoutExprs.matchAll(/>([^<>{}]+)</g)]
        .map((m) => m[1].trim())
        // Only strings with letters or digits are text: stray brackets and arrows between tags are code.
        .filter((t) => /[A-Za-z0-9]/.test(t));
      expect(textBetweenTags, file).toEqual([]);
    }
  });
});
