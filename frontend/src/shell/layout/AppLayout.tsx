import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { PageBoundary } from "./PageBoundary";
import { PageState } from "./PageState";
import { usePageTitle } from "./usePageTitle";
import { useRegistry } from "../registry/RegistryContext";
import { rememberBack } from "../nav/modeMemory";

export function AppLayout() {
  const { pathname } = useLocation();
  const pageArea = useRef<HTMLElement>(null);
  const routes = useRegistry();
  usePageTitle(pathname);
  // Back (in Portfolio mode) returns to the last non-Portfolio page; rememberBack ignores everything else.
  useEffect(() => { rememberBack(pathname, routes); }, [pathname, routes]);
  useEffect(() => { pageArea.current?.scrollTo?.({ top: 0, left: 0 }); }, [pathname]);
  return <div className="flex h-screen overflow-hidden bg-[var(--shell-page)] text-[var(--shell-text)]">
    <Sidebar pathname={pathname} />
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar />
      <main ref={pageArea} className="min-h-0 flex-1 overflow-y-auto p-6">
        <PageBoundary key={pathname}><Suspense fallback={<PageState state="loading" />}><Outlet /></Suspense></PageBoundary>
      </main>
    </div>
  </div>;
}
