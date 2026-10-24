import type { ShellRoute } from "../registry/types";
import { resolveRoute, rowOf } from "../nav/resolve";

export function shouldResetScope(prevPath: string, nextPath: string, routes: ShellRoute[], memberCount: number): boolean {
  if (!(memberCount > 1) || prevPath === nextPath) return false;
  const next = resolveRoute(nextPath, routes);
  if (!next || next.scope !== "family-or-member") return false;
  const byId = new Map(routes.map(route => [route.id, route]));
  return rowOf(resolveRoute(prevPath, routes), byId)?.id !== rowOf(next, byId)?.id;
}
