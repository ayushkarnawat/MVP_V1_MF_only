import { matchPath } from "react-router";
import type { ShellRoute } from "../registry/types";

function parameterCount(path: string): number {
  return path.split("/").filter(segment => segment.startsWith(":") || segment === "*").length;
}

export function resolveRoute(pathname: string, routes: ShellRoute[]): ShellRoute | undefined {
  return routes.filter(route => route.path && route.path !== "*" && matchPath({ path: route.path, end: true }, pathname))
    .sort((a, b) => parameterCount(a.path!) - parameterCount(b.path!) || b.path!.length - a.path!.length)[0];
}

export function modeOf(pathname: string): "main" | "portfolio" {
  return pathname === "/portfolio" || pathname.startsWith("/portfolio/") ? "portfolio" : "main";
}

export function rowOf(route: ShellRoute | undefined, byId: Map<string, ShellRoute>): ShellRoute | undefined {
  const seen = new Set<string>();
  let current = route;
  while (current && !seen.has(current.id)) {
    if (current.section !== null) return current;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}

export function activeRowId(pathname: string, routes: ShellRoute[]): string | undefined {
  return rowOf(resolveRoute(pathname, routes), new Map(routes.map(route => [route.id, route])))?.id;
}
