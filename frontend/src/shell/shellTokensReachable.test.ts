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

// Comments are stripped first: a commented-out import is not in the bundle, so it must not count.
// A line comment starts at "//" at the line start or after whitespace (so "https://" in a string is safe).
function relativeImports(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const importRegex = /(?:import|export)\s+(?:[^'"]*?from\s+)?["'](\.[^"']+)["']/g;
  return [...code.matchAll(importRegex)].map(match => match[1]);
}

function collectImportedCssFiles(entry: string): Set<string> {
  const cssFiles = new Set<string>();
  const visited = new Set<string>();

  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    for (const importPath of relativeImports(readFileSync(file, "utf8"))) {
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

  it("does not count commented-out imports", () => {
    const source = [
      '// import "./theme/shell-tokens.css";',
      '/* import "./theme/block.css"; */',
      'const disabled = true; // import "./theme/inline.css";',
      'import "./theme/real.css"; // import "./theme/after-real.css";',
    ].join("\n");
    expect(relativeImports(source)).toEqual(["./theme/real.css"]);
  });
});
