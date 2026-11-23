// A search jump asks the shell to land on a family or member view. It travels as one-time router state under `searchIntent`
// ({ scope, section?, open? }). Only `scope` belongs to the scope provider; `section` and `open` are read by the page itself.
export type ScopeIntent = { scope: "family" } | { scope: { memberId: string } };

export const SEARCH_INTENT_KEY = "searchIntent";

export function readScopeIntent(state: unknown): ScopeIntent | null {
  if (typeof state !== "object" || state === null) return null;
  const intent: unknown = Reflect.get(state, SEARCH_INTENT_KEY);
  if (typeof intent !== "object" || intent === null) return null;
  const scope: unknown = Reflect.get(intent, "scope");
  if (scope === "family") return { scope: "family" };
  if (typeof scope === "object" && scope !== null) {
    const memberId: unknown = Reflect.get(scope, "memberId");
    if (typeof memberId === "string" && memberId.length > 0) return { scope: { memberId } };
  }
  return null;
}

/** The history state without the scope part of the intent (page keys such as `section`, `open`, and other state keys stay). */
export function stateWithoutScopeIntent(state: unknown): Record<string, unknown> | null {
  if (typeof state !== "object" || state === null) return null;
  const { [SEARCH_INTENT_KEY]: intent, ...rest } = state as Record<string, unknown>;
  if (typeof intent === "object" && intent !== null) {
    const { scope: _scope, ...pageKeys } = intent as Record<string, unknown>;
    if (Object.keys(pageKeys).length > 0) return { ...rest, [SEARCH_INTENT_KEY]: pageKeys };
  }
  return Object.keys(rest).length > 0 ? rest : null;
}
