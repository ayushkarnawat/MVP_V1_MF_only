export interface StoredScope {
  mode: "aggregate" | "member";
  memberId: string | null;
}

const scopeKey = "unifolio.shell.scope";

export function readScope(): StoredScope | null {
  try {
    const stored = window.sessionStorage.getItem(scopeKey);
    if (!stored) return null;
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object" || !("mode" in value) || !("memberId" in value)) return null;
    if (value.mode !== "aggregate" && value.mode !== "member") return null;
    if (value.memberId !== null && typeof value.memberId !== "string") return null;
    return { mode: value.mode, memberId: value.memberId };
  } catch { return null; }
}

export function writeScope(scope: StoredScope): void {
  try { window.sessionStorage.setItem(scopeKey, JSON.stringify(scope)); }
  catch { /* Scope remains usable when session storage is unavailable. */ }
}
