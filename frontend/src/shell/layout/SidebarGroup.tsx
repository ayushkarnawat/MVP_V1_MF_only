import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ShellRoute } from "../registry/types";
import { SidebarItem } from "./SidebarItem";

interface SidebarGroupProps {
  route: ShellRoute;
  childrenRoutes: ShellRoute[];
  routes: ShellRoute[];
  pathname: string;
  activeId: string | undefined;
}

const equityKey = "unifolio.shell.equityOpen";

export function SidebarGroup({ route, childrenRoutes, routes, pathname, activeId }: SidebarGroupProps) {
  const [storedOpen, setStoredOpen] = useState(() => {
    try { return window.sessionStorage.getItem(equityKey) === "true"; }
    catch { return false; }
  });
  const listId = useId();
  const containsActive = childrenRoutes.some(child => child.id === activeId);
  const open = containsActive || storedOpen;
  const Icon = route.icon;
  function toggle() {
    if (containsActive) return;
    const next = !storedOpen;
    setStoredOpen(next);
    try { window.sessionStorage.setItem(equityKey, String(next)); }
    catch { /* The group still works without browser storage. */ }
  }
  return <li>
    <button type="button" aria-expanded={open} aria-controls={listId} data-contains-active={containsActive ? "true" : undefined}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg bg-transparent px-2.5 py-2 text-left font-body text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-accent)] ${containsActive ? "text-[var(--shell-text-body)]" : "text-[var(--shell-text-secondary)] hover:bg-[var(--shell-divider)]"}`}
      onClick={toggle} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}>
      <Icon size={18} aria-hidden="true" /><span>{route.label}</span><ChevronDown size={14} aria-hidden="true" className={`ml-auto ${open ? "rotate-180" : ""}`} />
    </button>
    <ul id={listId} hidden={!open} className="space-y-0.5">
      {childrenRoutes.map(child => <SidebarItem key={child.id} route={child} routes={routes} pathname={pathname} active={child.id === activeId} child />)}
    </ul>
  </li>;
}
