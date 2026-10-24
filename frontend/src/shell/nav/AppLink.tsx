import type { ReactNode } from "react";
import { NavLink, useResolvedPath } from "react-router";
import { buildRegistry } from "../registry/buildRegistry";
import { resolveRoute } from "./resolve";

interface AppLinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
}

export function AppLink({ to, children, className, activeClassName }: AppLinkProps) {
  const resolved = useResolvedPath(to, { relative: "path" });
  const route = resolveRoute(resolved.pathname, buildRegistry());
  if (route?.status === "placeholder") {
    return <span aria-disabled="true" tabIndex={0} title="Coming soon" className={[className, "shell-link-disabled"].filter(Boolean).join(" ")}>{children}</span>;
  }
  return <NavLink to={to} relative="path" end className={({ isActive }) => [className, isActive && activeClassName].filter(Boolean).join(" ")}>{children}</NavLink>;
}
