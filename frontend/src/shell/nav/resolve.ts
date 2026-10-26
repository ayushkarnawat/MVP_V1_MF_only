import { matchPath } from "react-router";
import type { ShellRoute } from "../registry/types";

function parameterCount(path: string): number {
  return path.split("/").filter(segment => segment.startsWith(":") || segment === "*").length;
}

// React Router matches on the decoded pathname, so `/%68ome` is Home there; match the same way or the
// placeholder guards in AppLink, useAppNavigate and the scope reset rule can be bypassed by an encoded path.
function decodePathname(pathname: string): string {
  // Like the router: an encoded slash stays encoded (it is part of a param value, not a new segment),
  // and one undecodable segment leaves the whole path raw. Query and hash are not part of the match.
  const bare = pathname.split(/[?#]/)[0];
  try {
    return bare.split("/").map(segment => decodeURIComponent(segment).replace(/\//g, "%2F")).join("/");
  } catch {
    return bare;
  }
}

export function resolveRoute(pathname: string, routes: ShellRoute[]): ShellRoute | undefined {
  const decoded = decodePathname(pathname);
  return routes.filter(route => route.path && route.path !== "*" && matchPath({ path: route.path, end: true }, decoded))
    .sort((a, b) => parameterCount(a.path!) - parameterCount(b.path!) || b.path!.length - a.path!.length)[0];
}

export function finalRoute(route: ShellRoute | undefined, routes: ShellRoute[]): ShellRoute | undefined {
  const seen = new Set<string>();
  let current = route;
  while (current?.redirectTo) {
    if (seen.has(current.id)) return undefined;
    seen.add(current.id);
    current = resolveRoute(current.redirectTo, routes);
  }
  return current;
}

export function modeOf(pathname: string): "main" | "portfolio" {
  const path = decodePathname(pathname).toLowerCase();
  return path === "/portfolio" || path.startsWith("/portfolio/") ? "portfolio" : "main";
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
