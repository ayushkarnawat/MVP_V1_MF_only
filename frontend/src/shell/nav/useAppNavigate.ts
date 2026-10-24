import { useCallback } from "react";
import { resolvePath, useLocation, useNavigate } from "react-router";
import type { NavigateOptions } from "react-router";
import { buildRegistry } from "../registry/buildRegistry";
import { resolveRoute } from "./resolve";

// `relative` is not offered: the destination is resolved against the pathname here, so route-relative
// resolution would silently differ from React Router's. Pass an absolute path from `paths` instead.
export function useAppNavigate() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback((to: string, options?: Omit<NavigateOptions, "relative">) => {
    const destination = resolvePath(to, pathname);
    if (resolveRoute(destination.pathname, buildRegistry())?.status === "placeholder") return;
    return navigate(destination, options);
  }, [navigate, pathname]);
}
