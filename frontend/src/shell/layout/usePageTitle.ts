import { useEffect } from "react";
import { resolveRoute } from "../nav/resolve";
import { useRegistry } from "../registry/RegistryContext";

export function usePageTitle(pathname: string) {
  const routes = useRegistry();
  const title = resolveRoute(pathname, routes)?.title ?? routes.find(route => route.path === "*")?.title ?? "Page not found";
  useEffect(() => { document.title = `${title} · Unifolio`; }, [title]);
}
