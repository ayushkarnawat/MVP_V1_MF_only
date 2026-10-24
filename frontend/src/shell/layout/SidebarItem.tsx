import * as Tooltip from "@radix-ui/react-tooltip";
import type { ShellRoute } from "../registry/types";
import { AppLink } from "../nav/AppLink";
import { finalRoute } from "../nav/resolve";

interface SidebarItemProps {
  route: ShellRoute;
  routes: ShellRoute[];
  pathname: string;
  active: boolean;
  child?: boolean;
  portfolioLabel?: boolean;
}

export function SidebarItem({ route, routes, pathname, active, child = false, portfolioLabel = false }: SidebarItemProps) {
  const destination = finalRoute(route, routes);
  const disabled = route.status === "placeholder" || !destination || destination.status === "placeholder";
  const Icon = portfolioLabel ? route.modeIcon ?? route.icon : route.icon;
  const label = portfolioLabel ? route.modeLabel ?? route.label : route.label;
  const classes = [
    "relative flex min-h-10 w-full items-center gap-2.5 px-2.5 py-2 text-sm font-medium font-body",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-accent)]",
    child && "pl-[34px]",
    disabled && "cursor-not-allowed",
    active ? "text-[var(--shell-text)]" : disabled ? "text-[var(--shell-text-disabled)]" : "text-[var(--shell-text-secondary)] hover:text-[var(--shell-text)] hover:bg-[var(--shell-divider)]",
    active ? "rounded-none bg-transparent font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--shell-accent)] after:content-['']" : "rounded-lg",
  ].filter(Boolean).join(" ");
  const content = <AppLink to={route.path!} className={classes}><Icon size={18} aria-hidden="true" /><span>{label}</span></AppLink>;
  // NavLink already marks an exact live match. Ancestor rows and disabled rows
  // need the marker here so there is exactly one aria-current in the sidebar.
  const linkMarksCurrent = !disabled && pathname.replace(/\/+$/, "").toLowerCase() === route.path?.replace(/\/+$/, "").toLowerCase();
  return <li aria-current={active && !linkMarksCurrent ? "page" : undefined}>
    {disabled ? <Tooltip.Root><Tooltip.Trigger asChild><span className="block">{content}</span></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content side="right" sideOffset={8} className="z-50 rounded-md bg-[var(--shell-tooltip-bg)] px-3 py-1.5 font-body text-xs text-[var(--shell-tooltip-text)]">Coming soon</Tooltip.Content></Tooltip.Portal></Tooltip.Root> : content}
  </li>;
}
