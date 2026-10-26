import { describe, expect, it } from "vitest";
import { buildRegistry } from "../registry/buildRegistry";
import { activeRowId, finalRoute, modeOf, resolveRoute, rowOf } from "./resolve";

const routes = buildRegistry();
const byId = new Map(routes.map(route => [route.id, route]));

describe("redirect destinations", () => {
  it("follows Equity to the Mutual Funds placeholder", () => {
    expect(finalRoute(byId.get("portfolio-equity"), routes)?.id).toBe("portfolio-mutual-funds");
  });

  it("follows multiple redirects and leaves a non-redirect unchanged", () => {
    const leaf = byId.get("home")!;
    const middle = { ...leaf, id: "middle", path: "/middle", redirectTo: "/home" };
    const start = { ...leaf, id: "start", path: "/start", redirectTo: "/middle" };
    expect(finalRoute(start, [start, middle, leaf])).toBe(leaf);
    expect(finalRoute(leaf, [leaf])).toBe(leaf);
  });

  it("returns undefined for missing targets, unknown routes and loops", () => {
    const loop = { ...routes[0], id: "loop", path: "/loop", redirectTo: "/loop" };
    const other = { ...loop, id: "other", path: "/other", redirectTo: "/loop" };
    expect(finalRoute(loop, [loop])).toBeUndefined();
    expect(finalRoute({ ...loop, redirectTo: "/other" }, [{ ...loop, redirectTo: "/other" }, other])).toBeUndefined();
    expect(finalRoute({ ...loop, redirectTo: "/missing" }, [loop])).toBeUndefined();
    expect(finalRoute(undefined, routes)).toBeUndefined();
  });
});

describe("route resolution", () => {
  it.each([
    ["/portfolio", "portfolio"],
    ["/portfolio/mutual-funds/holdings", "portfolio-mutual-funds-holdings"],
    ["/portfolio/mutual-funds/funds/INF123", "portfolio-mutual-funds-fund"],
    ["/portfolio/mutual-funds/funds/INF123/insights", "portfolio-mutual-funds-fund-insights"],
    ["/portfolio/equity", "portfolio-equity"],
    ["/profile", "profile"],
    ["/unknown", undefined],
    ["/portfolio/mutual-funds/overlap/compare", undefined],
  ])("resolves %s to %s", (path, id) => {
    expect(resolveRoute(path, routes)?.id).toBe(id);
  });

  it("prefers fewer parameters even when the dynamic pattern is longer", () => {
    const base = routes[0];
    const fixtures = [
      { ...base, id: "dynamic", path: "/reports/:longParameterName" },
      { ...base, id: "static", path: "/reports/new" },
    ];
    expect(resolveRoute("/reports/new", fixtures)?.id).toBe("static");
    expect(fixtures[0].id).toBe("dynamic");
  });

  it("breaks equal parameter counts by the longer matching path", () => {
    const base = routes[0];
    expect(resolveRoute("/reports/new", [
      { ...base, id: "short", path: "/reports/:x" },
      { ...base, id: "long", path: "/reports/:longName" },
    ])?.id).toBe("long");
  });

  it.each([
    ["/portfolio", "portfolio"],
    ["/portfolio/equity/us-stocks", "portfolio"],
    ["/profile", "main"],
    ["/portfolio-other", "main"],
  ])("uses the correct mode for %s", (path, mode) => {
    expect(modeOf(path)).toBe(mode);
  });

  it.each([
    ["/portfolio", "portfolio"],
    ["/portfolio/mutual-funds/holdings", "portfolio-mutual-funds"],
    ["/portfolio/mutual-funds/funds/INF123", "portfolio-mutual-funds"],
    ["/portfolio/mutual-funds/funds/INF123/overlap", "portfolio-mutual-funds"],
    ["/profile/settings/security", "profile"],
    ["/profile", "profile"],
    ["/portfolio/equity", "portfolio-equity"],
    ["/unknown", undefined],
    ["/", undefined],
  ])("finds the ancestor-or-self sidebar row for %s", (path, id) => {
    expect(rowOf(resolveRoute(path, routes), byId)?.id).toBe(id);
    expect(activeRowId(path, routes)).toBe(id);
  });

  it("stops safely on missing or cyclic parent links", () => {
    const base = { ...routes[0], section: null };
    const first = { ...base, id: "first", parentId: "second" };
    const second = { ...base, id: "second", parentId: "first" };
    expect(rowOf(first, new Map())).toBeUndefined();
    expect(rowOf(first, new Map([[first.id, first], [second.id, second]]))).toBeUndefined();
  });

  it("matches an encoded path the way the router does", () => {
    const routes = buildRegistry();
    expect(resolveRoute("/%68ome", routes)?.id).toBe(resolveRoute("/home", routes)?.id);
    expect(resolveRoute("/%68ome", routes)).toBeDefined();
    expect(resolveRoute("/%E0%A4%A", routes)).toBeUndefined();
  });

  it("keeps an encoded slash inside the fund id and ignores query and hash", () => {
    const routes = buildRegistry();
    expect(resolveRoute("/portfolio/mutual-funds/funds/a%2Fb", routes)?.id).toBe("portfolio-mutual-funds-fund");
    expect(resolveRoute("/portfolio/mutual-funds/funds/x%2Foverlap", routes)?.id).toBe("portfolio-mutual-funds-fund");
    expect(resolveRoute("/portfolio/mutual-funds?sort=today_change#x", routes)?.id).toBe("portfolio-mutual-funds");
  });

  it("modeOf ignores case and encoding", () => {
    expect(modeOf("/Portfolio/debt")).toBe("portfolio");
    expect(modeOf("/%70ortfolio/debt")).toBe("portfolio");
  });
});
