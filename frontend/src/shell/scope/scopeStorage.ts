export interface StoredScope {
  mode: "aggregate" | "member";
  memberId: string | null;
}

// `path` is the page the scope was last on. It lets a fresh load of another sidebar row (an address-bar
// navigation) apply the cross-row reset instead of restoring a member picked elsewhere. Absent in older saves.
export interface SavedScope extends StoredScope {
  path?: string;
}

const scopeKey = "unifolio.shell.scope";

export function readScope(): SavedScope | null {
  try {
    const stored = window.sessionStorage.getItem(scopeKey);
    if (!stored) return null;
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object" || !("mode" in value) || !("memberId" in value)) return null;
    if (value.mode !== "aggregate" && value.mode !== "member") return null;
    if (value.memberId !== null && typeof value.memberId !== "string") return null;
    const path = "path" in value && typeof value.path === "string" ? value.path : undefined;
    return { mode: value.mode, memberId: value.memberId, ...(path ? { path } : {}) };
  } catch { return null; }
}

export function writeScope(scope: StoredScope, path: string): void {
  try { window.sessionStorage.setItem(scopeKey, JSON.stringify({ ...scope, path })); }
  catch { /* Scope remains usable when session storage is unavailable. */ }
}
