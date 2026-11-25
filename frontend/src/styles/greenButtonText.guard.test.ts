import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// Read as text from disk, like the other guard tests: Vite processes CSS (and CSS modules) even with ?raw under Vitest.
const FILES: Record<string, string> = {
  "./auth-tokens.css": "src/styles/auth-tokens.css",
  "../features/export/export-tokens.css": "src/features/export/export-tokens.css",
  "../features/import/checklist/checklist-tokens.css": "src/features/import/checklist/checklist-tokens.css",
  "../features/auth/onboarding.module.css": "src/features/auth/onboarding.module.css",
  "../features/dashboard/XirrDisclaimerModal.module.css": "src/features/dashboard/XirrDisclaimerModal.module.css",
  "../features/export/ExportDialog.tsx": "src/features/export/ExportDialog.tsx",
  "../features/auth/Q2Investing.tsx": "src/features/auth/Q2Investing.tsx",
};
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [key, readFileSync(resolve(file), "utf8").replace(/\r/g, "")]),
);
const read = (path: string) => {
  expect(sources[path], path).toBeDefined();
  return sources[path].replace(/\/\*[\s\S]*?\*\//g, "");
};
const rule = (css: string, selector: string) => {
  const block = css.split(`${selector} {`)[1]?.split("}")[0];
  expect(block, selector).toBeDefined();
  return block ?? "";
};
const inkValues = (css: string, token: string) =>
  [...css.matchAll(new RegExp(`${token}:\\s*([^;]+);`, "g"))].map(match => match[1].trim().toUpperCase());

describe("green button labels", () => {
  it("auth_button_text_is_white_in_default_and_hover", () => {
    const css = read("./auth-tokens.css");
    const base = rule(css, ".auth-btn");
    const hover = rule(css, ".auth-btn:hover:not(:disabled)");
    expect(base).toMatch(/(?:^|;)\s*color:\s*#FFFFFF\b/i);
    for (const block of [base, hover]) expect(block).not.toMatch(/(?:^|;)\s*color:\s*#111111\b/i);
    const hoverColor = /(?:^|;)\s*color:\s*([^;]+)/i.exec(hover)?.[1].trim();
    if (hoverColor) expect(hoverColor.toUpperCase()).toBe("#FFFFFF");
  });
  it("export_button_ink_is_white_in_all_three_theme_blocks", () => {
    expect(inkValues(read("../features/export/export-tokens.css"), "--export-btn-ink"))
      .toEqual(["#FFFFFF", "#FFFFFF", "#FFFFFF"]);
  });
  it("checklist_button_ink_is_white_in_window_and_panel", () => {
    const css = read("../features/import/checklist/checklist-tokens.css");
    expect(inkValues(css, "--ccp-btn-ink")).toEqual(["#FFFFFF", "#FFFFFF", "#FFFFFF"]);
    expect(inkValues(css, "--ccw-btn-ink")).toEqual(["#FFFFFF"]);
  });
  it("onboarding_and_disclaimer_buttons_are_white", () => {
    for (const [file, selector] of [
      ["../features/auth/onboarding.module.css", ".continueBtn"],
      ["../features/dashboard/XirrDisclaimerModal.module.css", ".gotIt"],
    ]) expect(rule(read(file), selector)).toMatch(/(?:^|;)\s*color:\s*#FFFFFF\b/i);
  });
  it("no_green_filled_button_file_sets_a_dark_label", () => {
    const dark = /#(?:111111|000000)\b/i;
    for (const [file, source] of Object.entries(sources)) {
      const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
      if (file.endsWith(".css")) {
        for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          const [, selector, body] = match;
          if (/\.auth-btn(?![\w-])|\.continueBtn\b|\.gotIt\b/.test(selector) && !selector.includes(":disabled") || selector.includes(":not(:disabled)")) {
            expect(body.match(/(?:^|;)\s*color:\s*([^;]+)/i)?.[1] ?? "", file).not.toMatch(dark);
          }
          for (const ink of body.matchAll(/--(?:export|ccp|ccw)-btn-ink:\s*([^;]+)/g)) expect(ink[1], file).not.toMatch(dark);
        }
      } else {
        for (const button of text.matchAll(/<(?:motion\.)?button\b[\s\S]*?>/g)) {
          expect(button[0], file).not.toMatch(/(?:text-\[#(?:111111|000000)\]|color:\s*["']#(?:111111|000000)["'])/i);
        }
      }
    }
  });
});
