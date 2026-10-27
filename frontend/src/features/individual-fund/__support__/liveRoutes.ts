import { buildRegistry } from "@/shell/registry/buildRegistry";

// The two Individual Fund shell routes are registered as placeholders for now (IF page not exposed yet, register C166).
// These tests still cover the real pages inside the shell, so they flip the two routes to live in a copy of the registry
// handed to renderInShell, leaving the real route files untouched.
export function liveFundRoutes() {
  return buildRegistry().map(route => {
    if (route.id === "portfolio-mutual-funds-fund") return { ...route, status: "live" as const, page: () => import("../OverviewPage") };
    if (route.id === "portfolio-mutual-funds-fund-insights") return { ...route, status: "live" as const, page: () => import("../InsightsPage") };
    return route;
  });
}
