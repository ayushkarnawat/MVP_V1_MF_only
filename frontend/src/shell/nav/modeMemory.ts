import type { ShellRoute } from "../registry/types";
import { modeOf, resolveRoute } from "./resolve";

const backKey = "unifolio.shell.back";
type BackStorage = Pick<Storage, "getItem" | "setItem">;

export function shouldRemember(route: ShellRoute | undefined): boolean {
  return !!route?.path && route.path !== "*" && modeOf(route.path) === "main"
    && route.layout === "app" && route.status === "live" && route.kind !== "group";
}

export function rememberBack(pathname: string, routes: ShellRoute[], storage?: BackStorage): void {
  if (!shouldRemember(resolveRoute(pathname, routes))) return;
  try {
    (storage ?? window.sessionStorage).setItem(backKey, pathname);
  } catch {
    // Back remains usable when browser storage is unavailable.
  }
}

export function readBack(routes: ShellRoute[], storage?: BackStorage): string {
  try {
    const stored = (storage ?? window.sessionStorage).getItem(backKey);
    if (stored && shouldRemember(resolveRoute(stored, routes))) return stored;
  } catch {
    // The fallback also covers blocked access to sessionStorage itself.
  }
  return "/home";
}
