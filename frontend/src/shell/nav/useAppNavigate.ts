import { useCallback } from "react";
import { resolvePath, useLocation, useNavigate } from "react-router";
import type { NavigateOptions } from "react-router";
import { buildRegistry } from "../registry/buildRegistry";
import { resolveRoute } from "./resolve";

export function useAppNavigate() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback((to: string, options?: NavigateOptions) => {
    const destination = resolvePath(to, pathname);
    if (resolveRoute(destination.pathname, buildRegistry())?.status === "placeholder") return;
    return navigate(destination, options);
  }, [navigate, pathname]);
}
