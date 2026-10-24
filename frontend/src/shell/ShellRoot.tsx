import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import type { ShellRoute } from "./registry/types";
import { RegistryContext, useRegistry } from "./registry/RegistryContext";
import { AppLayout } from "./layout/AppLayout";
import { FocusLayout } from "./layout/FocusLayout";
import { usePageModule } from "./layout/pageModules";
import { PageState } from "./layout/PageState";

function LazyPage({ route }: { route: ShellRoute }) {
  const Page = usePageModule(route.page);
  return Page ? <Page /> : <PageState state="error" message="This page is unavailable" />;
}

export function ShellRoutes({ routes: supplied }: { routes?: ShellRoute[] } = {}) {
  const registry = useRegistry();
  const routes = supplied ?? registry;
  const routeElement = (route: ShellRoute) => <Route key={route.id} path={route.path} element={route.redirectTo ? <Navigate to={route.redirectTo} replace /> : <LazyPage route={route} />} />;
  return <RegistryContext.Provider value={routes}><Routes>
    <Route element={<AppLayout />}>{routes.filter(route => route.path && route.layout === "app").map(routeElement)}</Route>
    <Route element={<FocusLayout />}>{routes.filter(route => route.path && route.layout === "focus").map(routeElement)}</Route>
  </Routes></RegistryContext.Provider>;
}

export function ShellRoot() { return <BrowserRouter><ShellRoutes /></BrowserRouter>; }
