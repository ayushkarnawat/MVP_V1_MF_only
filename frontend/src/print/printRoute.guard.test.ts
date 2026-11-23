import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";

const root = resolve("src/print");
function files(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(resolve(folder, entry.name)) : [resolve(folder, entry.name)]);
}
const source = files(root).filter(file => /\.(tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file));
const read = (file: string) => readFileSync(file, "utf8");
it("no hex colour or rgb() in print/ except print-runtime.css and the fonts file", () => {
  expect(source.filter(file => !/print-runtime\.css$|print-fonts(?:\.stub)?\.css$/.test(file) && /#[\da-f]{3,8}\b|rgba?\(/i.test(read(file)))).toEqual([]);
});
it("no external URL in any style or font file", () => {
  expect(source.filter(file => /\.css$/.test(file) && /(?:https?:)?\/\/|@import\s+["']/.test(read(file)))).toEqual([]);
});
it("fonts load from the bundle, not Google", () => {
  const fontFiles = source.filter(file => /print-fonts(?:\.stub)?\.css$/.test(file));
  expect(fontFiles.length).toBeGreaterThan(0);
  for (const file of fontFiles) {
    expect(read(file)).not.toMatch(/https?:|\/\/|google/i);
    for (const url of read(file).matchAll(/url\(["']?([^)'"\s]+)/g)) expect(url[1]).toMatch(/^\.?\.?\/fonts\//);
  }
});
it("no parseFloat, toFixed, Intl, console, any in print/", () => {
  expect(source.filter(file => /parseFloat|toFixed|\bIntl\b|\bconsole\b|\bany\b/.test(read(file)))).toEqual([]);
});
it("no import from another feature except the section components, session and required member-list API", () => {
  const offenders: string[] = [];
  for (const file of source) for (const match of read(file).matchAll(/(?:from\s+|import\(\s*)["']([^"']*)["']/g)) {
    const target = resolve(dirname(file), match[1]).replaceAll("\\", "/");
    if (target.includes("/features/") && !/\/features\/(?:mutual-funds\/|auth\/(?:session|api)$)/.test(target)) offenders.push(target);
  }
  expect(offenders).toEqual([]);
});
it("every <button is absent from print/", () => expect(source.filter(file => /<button\b/.test(read(file)))).toEqual([]));
