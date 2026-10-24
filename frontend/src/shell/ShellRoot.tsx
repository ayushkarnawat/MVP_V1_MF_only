import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import type { ShellRoute } from "./registry/types";
import { RegistryContext, useRegistry } from "./registry/RegistryContext";
import { AppLayout } from "./layout/AppLayout";
import { FocusLayout } from "./layout/FocusLayout";
import { usePageModule } from "./layout/pageModules";
import { PageState } from "./layout/PageState";
import { ScopeProvider } from "./scope/ScopeProvider";
import { ImportProvider } from "./nav/ImportProvider";

function LazyPage({ route }: { route: ShellRoute }) {
  const Page = usePageModule(route.page);
  return Page ? <Page /> : <PageState state="error" message="This page is unavailable" />;
}

// A redirect keeps the query and hash (`/profile?x=1` stays `?x=1` after the redirect).
function RedirectKeepingQuery({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

export function ShellRoutes({ routes: supplied }: { routes?: ShellRoute[] } = {}) {
  const registry = useRegistry();
  const routes = supplied ?? registry;
  const routeElement = (route: ShellRoute) => <Route key={route.id} path={route.path} element={route.redirectTo ? <RedirectKeepingQuery to={route.redirectTo} /> : <LazyPage route={route} />} />;
  return <RegistryContext.Provider value={routes}><Routes>
    <Route element={<AppLayout />}>{routes.filter(route => route.path && route.layout === "app").map(routeElement)}</Route>
    <Route element={<FocusLayout />}>{routes.filter(route => route.path && route.layout === "focus").map(routeElement)}</Route>
  </Routes></RegistryContext.Provider>;
}

export function ShellRoot() {
  return <BrowserRouter><ScopeProvider><ImportProvider><ShellRoutes /></ImportProvider></ScopeProvider></BrowserRouter>;
}
