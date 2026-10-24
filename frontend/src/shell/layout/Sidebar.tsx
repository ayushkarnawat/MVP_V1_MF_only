import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { UnifolioLogo } from "../../components/UnifolioLogo";
import { buildRegistry } from "../registry/buildRegistry";
import { activeRowId, modeOf } from "../nav/resolve";
import { paths } from "../nav/paths";
import { readBack } from "../nav/modeMemory";
import { SidebarItem } from "./SidebarItem";
import { SidebarGroup } from "./SidebarGroup";

export function Sidebar({ pathname }: { pathname: string }) {
  const routes = buildRegistry();
  const activeId = activeRowId(pathname, routes);
  const portfolioMode = modeOf(pathname) === "portfolio";
  const portfolio = routes.find(route => route.id === "portfolio")!;
  const rows = routes.filter(route => portfolioMode ? route.section === "portfolio" && !route.parentId : route.section === "main");
  return <Tooltip.Provider delayDuration={150}>
    <aside className="flex min-h-screen w-56 shrink-0 flex-col border-r border-[var(--shell-divider)] bg-[var(--shell-card)] px-3 py-4 font-body">
      <Link to={paths.home()} aria-label="Unifolio home" className="mb-4 block px-2.5 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-accent)]"><UnifolioLogo className="h-7" /></Link>
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-2">
        <ul className="space-y-0.5">
          {portfolioMode && <>
            <li><Link to={readBack(routes)} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--shell-text-secondary)] hover:bg-[var(--shell-divider)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-accent)]"><ArrowLeft size={18} aria-hidden="true" />Back</Link></li>
            <SidebarItem route={portfolio} routes={routes} pathname={pathname} active={activeId === portfolio.id} portfolioLabel />
          </>}
          {rows.map(route => route.kind === "group"
            ? <SidebarGroup key={route.id} route={route} childrenRoutes={routes.filter(child => child.parentId === route.id)} routes={routes} pathname={pathname} activeId={activeId} />
            : <SidebarItem key={route.id} route={route} routes={routes} pathname={pathname} active={route.id === activeId} />)}
        </ul>
        <ul className="mt-auto space-y-0.5 border-t border-[var(--shell-divider)] pt-3">
          {routes.filter(route => route.section === "footer").map(route => <SidebarItem key={route.id} route={route} routes={routes} pathname={pathname} active={route.id === activeId} />)}
        </ul>
      </nav>
    </aside>
  </Tooltip.Provider>;
}
