import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { describe, expect, it } from "vitest";

// Vite/Vitest don't execute CSS side-effect imports in this suite (jsdom ignores
// stylesheets), so no render-based test can catch a broken/missing import of
// shell-tokens.css — it has to be caught by walking the real module graph.
function resolveImport(fromFile: string, importPath: string): string | null {
  if (!importPath.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), importPath);
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function collectImportedCssFiles(entry: string): Set<string> {
  const cssFiles = new Set<string>();
  const visited = new Set<string>();
  const importRegex = /(?:import|export)\s+(?:[^'"]*?from\s+)?["'](\.[^"']+)["']/g;

  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(importRegex)) {
      const importPath = match[1];
      if (importPath.endsWith(".css")) {
        const cssFile = resolve(dirname(file), importPath);
        if (existsSync(cssFile)) cssFiles.add(cssFile);
        continue;
      }
      const resolved = resolveImport(file, importPath);
      if (resolved) visit(resolved);
    }
  }

  visit(entry);
  return cssFiles;
}

describe("shell token stylesheet", () => {
  it("is reachable from App.tsx's real import graph", () => {
    const cssFiles = collectImportedCssFiles(resolve("src/App.tsx"));
    const shellTokens = resolve("src/shell/theme/shell-tokens.css");
    expect([...cssFiles]).toContain(shellTokens);
  });
});
