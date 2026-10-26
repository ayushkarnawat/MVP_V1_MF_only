import { useCallback } from "react";
import { resolvePath, useLocation, useNavigate } from "react-router";
import type { NavigateOptions } from "react-router";
import { useRegistry } from "../registry/RegistryContext";
import { finalRoute, resolveRoute } from "./resolve";

// `relative` is not offered: the destination is resolved against the pathname here, so route-relative
// resolution would silently differ from React Router's. Pass an absolute path from `paths` instead.
export function useAppNavigate() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const routes = useRegistry();
  return useCallback((to: string, options?: Omit<NavigateOptions, "relative">) => {
    const destination = resolvePath(to, pathname);
    const route = resolveRoute(destination.pathname, routes);
    const target = finalRoute(route, routes);
    if (route?.status === "placeholder" || target?.status === "placeholder" || (route && !target)) return;
    return navigate(destination, options);
  }, [navigate, pathname, routes]);
}
