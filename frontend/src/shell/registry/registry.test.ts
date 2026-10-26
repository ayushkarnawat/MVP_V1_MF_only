import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { Home } from "lucide-react";
import { describe, expect, it } from "vitest";
import { buildRegistry, validateRegistry } from "./buildRegistry";
import type { ShellRoute } from "./types";

// Expanded from contract v1.6 section 4, independently of the route modules.
const urlMap = [
  ["root", "/"],
  ["home", "/home"],
  ["portfolio", "/portfolio"],
  ["portfolio-equity", "/portfolio/equity"],
  ["portfolio-equity-direct-stocks", "/portfolio/equity/direct-stocks"],
  ["portfolio-equity-us-stocks", "/portfolio/equity/us-stocks"],
  ["portfolio-equity-fds-bonds", "/portfolio/equity/fds-bonds"],
  ["portfolio-debt", "/portfolio/debt"],
  ["portfolio-gold", "/portfolio/gold"],
  ["portfolio-real-estate", "/portfolio/real-estate"],
  ["portfolio-others", "/portfolio/others"],
  ["portfolio-mutual-funds", "/portfolio/mutual-funds"],
  ["portfolio-mutual-funds-performance", "/portfolio/mutual-funds/performance"],
  ["portfolio-mutual-funds-allocation", "/portfolio/mutual-funds/allocation"],
  ["portfolio-mutual-funds-holdings", "/portfolio/mutual-funds/holdings"],
  ["portfolio-mutual-funds-transactions", "/portfolio/mutual-funds/transactions"],
  ["portfolio-mutual-funds-overlap", "/portfolio/mutual-funds/overlap"],
  ["portfolio-mutual-funds-analytics", "/portfolio/mutual-funds/analytics"],
  ["portfolio-mutual-funds-history", "/portfolio/mutual-funds/history"],
  ["portfolio-mutual-funds-fund", "/portfolio/mutual-funds/funds/:schemeId"],
  ["portfolio-mutual-funds-fund-overlap", "/portfolio/mutual-funds/funds/:schemeId/overlap"],
  ["portfolio-mutual-funds-fund-insights", "/portfolio/mutual-funds/funds/:schemeId/insights"],
  ["liabilities", "/liabilities"],
  ["planning", "/planning"],
  ["profile", "/profile"],
  ["profile-personal", "/profile/personal"],
  ["profile-family", "/profile/family"],
  ["profile-connected-accounts", "/profile/connected-accounts"],
  ["profile-settings", "/profile/settings"],
  ["profile-settings-notifications", "/profile/settings/notifications"],
  ["profile-settings-preferences", "/profile/settings/preferences"],
  ["profile-settings-security", "/profile/settings/security"],
  ["profile-settings-import-history", "/profile/settings/import-history"],
  ["profile-subscription", "/profile/subscription"],
  ["profile-tax", "/profile/tax"],
  ["profile-data-privacy", "/profile/data-privacy"],
  ["profile-legacy", "/profile/legacy"],
  ["profile-import-health", "/profile/import-health"],
  ["help", "/help"],
  ["import", "/import"],
  ["not-found", "*"],
];

function page(overrides: Partial<ShellRoute> = {}): ShellRoute {
  return {
    id: "leaf", path: "/leaf", label: "Leaf", title: "Leaf", icon: Home,
    section: null, order: 1, layout: "app", scope: "none", status: "placeholder",
    page: async () => ({ default: () => null }), ...overrides,
  };
}

function group(overrides: Partial<ShellRoute> = {}): ShellRoute {
  return page({ id: "group", path: "/group", kind: "group", page: undefined,
    redirectTo: "/leaf", status: "live", ...overrides });
}

describe("contract v1.6 registry", () => {
  it("has exactly one route file for every URL-map id and path", () => {
    expect(buildRegistry().map(({ id, path }) => [id, path]).sort())
      .toEqual([...urlMap].sort());
  });

  it("accepts the real registry", () => {
    expect(validateRegistry(buildRegistry())).toEqual([]);
  });

  it("sorts injected modules by main, portfolio, footer, null and then order", () => {
    const routes = buildRegistry({
      "../routes/hidden.route.tsx": { default: page({ id: "hidden", section: null, order: 0 }) },
      "../routes/footer.route.tsx": { default: page({ id: "footer", section: "footer", order: 0 }) },
      "../routes/second.route.tsx": { default: page({ id: "second", section: "main", order: 2 }) },
      "../routes/portfolio.route.tsx": { default: page({ id: "portfolio", section: "portfolio", order: 0 }) },
      "../routes/first.route.tsx": { default: page({ id: "first", section: "main", order: 1 }) },
    });
    expect(routes.map(route => route.id)).toEqual(["first", "second", "portfolio", "footer", "hidden"]);
  });

  it("keeps Equity's redirect and the four child rows", () => {
    const routes = buildRegistry();
    expect(routes.find(route => route.id === "portfolio-equity")).toMatchObject({
      kind: "group", redirectTo: "/portfolio/mutual-funds",
    });
    expect(routes.find(route => route.id === "portfolio-equity")?.page).toBeUndefined();
    expect(routes.filter(route => route.parentId === "portfolio-equity").map(route => route.id))
      .toEqual(["portfolio-equity-direct-stocks", "portfolio-mutual-funds", "portfolio-equity-us-stocks", "portfolio-equity-fds-bonds"]);
  });

  it("keeps Planning a placeholder page and Profile a non-scoped redirect", () => {
    const routes = buildRegistry();
    expect(routes.find(route => route.id === "planning")).toMatchObject({ path: "/planning", status: "placeholder", scope: "none" });
    expect(routes.find(route => route.id === "planning")?.redirectTo).toBeUndefined();
    expect(routes.find(route => route.id === "profile")).toMatchObject({ redirectTo: "/profile/personal", scope: "none", status: "placeholder" });
    expect(routes.filter(route => route.id.startsWith("profile")).every(route => route.scope === "none")).toBe(true);
    expect(routes.find(route => route.id === "profile-settings-import-history")?.parentId).toBe("profile-settings");
  });

  it("uses the contract's menu labels, icons, ordering and mode override", () => {
    const routes = buildRegistry();
    expect(routes.filter(route => route.section === "main").map(route => route.label))
      .toEqual(["Home", "Portfolio", "Liabilities", "Planning"]);
    expect(routes.filter(route => route.section === "footer").map(route => route.label))
      .toEqual(["Profile", "Help & Support"]);
    expect(routes.find(route => route.id === "portfolio")?.modeLabel).toBe("Investments");
    expect(routes.find(route => route.id === "portfolio")?.modeIcon).toBeTruthy();
    for (const route of routes.filter(route => route.section !== null)) {
      expect(route.label.trim()).not.toBe("");
      expect(route.icon).toBeTruthy();
    }
    expect(routes.find(route => route.id === "import")?.layout).toBe("focus");
    expect(routes.filter(route => route.id !== "import").every(route => route.layout === "app")).toBe(true);
  });

  it("resolves every lazy page to a default component", async () => {
    for (const route of buildRegistry()) {
      if (route.page) expect(typeof (await route.page()).default).toBe("function");
    }
  });

  it("renders the supplied route title in each page stub", async () => {
    const { default: PlaceholderPage } = await import("../layout/PlaceholderPage");
    const { default: NotFoundPage } = await import("../layout/NotFoundPage");
    const view = render(createElement(PlaceholderPage, { title: "Mutual Funds" }));
    expect(screen.getByRole("heading", { name: "Mutual Funds" })).toBeInTheDocument();
    view.unmount();
    render(createElement(NotFoundPage, { title: "Page not found" }));
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  // Runs S2.4 and I1 must enable the destinations before shell switch-on.
  it.skip("requires every group redirect target to be live by switch-on", () => {
    const routes = buildRegistry();
    for (const route of routes.filter(route => route.kind === "group")) {
      expect(routes.find(target => target.path === route.redirectTo)?.status).toBe("live");
    }
  });
});

describe("registry validation", () => {
  it("catches redirect cycles, missing targets and duplicate paths the way the router sees them", () => {
    const a = page({ id: "a", path: "/a", redirectTo: "/b/", page: undefined });
    const b = page({ id: "b", path: "/b", redirectTo: "/a", page: undefined });
    expect(validateRegistry([a, b]).some(error => error.includes("Redirect cycle"))).toBe(true);
    const lost = page({ id: "lost", path: "/lost", redirectTo: "/hmoe", page: undefined });
    expect(validateRegistry([lost])).toContain("Missing redirect target /hmoe for route lost");
    expect(validateRegistry([page({ id: "x", path: "/home" }), page({ id: "y", path: "/Home/" })])).toContain("Duplicate route path: /Home/");
  });

  it("rejects a duplicate id", () => {
    expect(validateRegistry([page(), page({ path: "/other" })])).toContain("Duplicate route id: leaf");
  });

  it("rejects a duplicate path", () => {
    expect(validateRegistry([page(), page({ id: "other" })])).toContain("Duplicate route path: /leaf");
  });

  it("rejects an id that differs from its file stem", () => {
    const routes = buildRegistry({ "../routes/other.route.tsx": { default: page() } });
    expect(validateRegistry(routes)).toContain("Route id leaf does not match file stem other");
  });

  it("rejects a missing parent", () => {
    expect(validateRegistry([page({ parentId: "missing" })])).toContain("Missing parent missing for route leaf");
  });

  it("rejects a group without children", () => {
    expect(validateRegistry([group(), page()])).toContain("Group group has no children");
  });

  it("rejects a group with a page", () => {
    expect(validateRegistry([group({ page: page().page }), page({ parentId: "group" })]))
      .toContain("Group group must not have a page");
  });

  it("rejects a group without a redirect", () => {
    expect(validateRegistry([group({ redirectTo: undefined }), page({ parentId: "group" })]))
      .toContain("Group group needs a redirect target");
  });

  it("rejects a group redirect whose target route is missing", () => {
    expect(validateRegistry([group({ redirectTo: "/missing" }), page({ parentId: "group" })]))
      .toContain("Missing redirect target /missing for group group");
  });

  it("rejects a group redirect to another group", () => {
    expect(validateRegistry([group({ redirectTo: "/other" }), group({ id: "other", path: "/other" }), page({ parentId: "group" })]))
      .toContain("Group group must redirect to a non-group route");
  });

  it("accepts a group redirect to a placeholder page in PR 1", () => {
    expect(validateRegistry([group(), page({ parentId: "group" })])).toEqual([]);
  });

  it("rejects a direct redirect loop", () => {
    expect(validateRegistry([page({ page: undefined, redirectTo: "/leaf" })]))
      .toContain("Redirect cycle at route leaf");
  });

  it("rejects an indirect redirect loop including a group", () => {
    expect(validateRegistry([group(), page({ parentId: "group", page: undefined, redirectTo: "/group" })]))
      .toContain("Redirect cycle at route group");
  });

  it("accepts an acyclic redirect chain", () => {
    expect(validateRegistry([page({ id: "start", path: "/start", page: undefined, redirectTo: "/leaf" }), page()])).toEqual([]);
  });

  it("rejects a live route with no page or redirect", () => {
    expect(validateRegistry([page({ status: "live", page: undefined })]))
      .toContain("Live route leaf needs a page or redirect");
  });

  it("rejects a non-group placeholder with no page or redirect", () => {
    expect(validateRegistry([page({ page: undefined })])).toContain("Route leaf needs a page or redirect");
  });

  it("rejects a placeholder without a title", () => {
    expect(validateRegistry([page({ title: " " })])).toContain("Placeholder route leaf needs a title");
  });

  it("reports an omitted placeholder title instead of throwing", () => {
    const { title: _title, ...withoutTitle } = page();
    expect(validateRegistry([withoutTitle as ShellRoute])).toContain("Placeholder route leaf needs a title");
  });

  it("rejects a menu route without a label", () => {
    expect(validateRegistry([page({ section: "main", label: " " })])).toContain("Menu route leaf needs a label");
  });

  it("reports an omitted menu label instead of throwing", () => {
    const { label: _label, ...withoutLabel } = page({ section: "main" });
    expect(validateRegistry([withoutLabel as ShellRoute])).toContain("Menu route leaf needs a label");
  });

  it("rejects a menu route without an icon", () => {
    const invalid = { ...page({ section: "footer" }), icon: undefined } as unknown as ShellRoute;
    expect(validateRegistry([invalid])).toContain("Menu route leaf needs an icon");
  });
});
