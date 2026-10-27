import { describe, expect, it } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { resolveRoute } from "@/shell/nav/resolve";
import route from "@/shell/routes/portfolio.route";
import mutualFunds from "@/shell/routes/portfolio-mutual-funds.route";
import PortfolioPage from "./PortfolioPage";

describe("the /portfolio shell route", () => {
  it("is live, keeps its place in the shell and loads the Portfolio page", async () => {
    expect(route.id).toBe("portfolio");
    expect(route.path).toBe("/portfolio");
    expect(route.status).toBe("live");
    expect(route.scope).toBe("family-or-member");
    expect(route.layout).toBe("app");
    expect(route.section).toBe("main");
    expect(route.label).toBe("Portfolio");
    expect(route.modeLabel).toBe("Investments");
    const loaded = await route.page!();
    expect(loaded.default).toBe(PortfolioPage);
  });

  it("is what the registry resolves for /portfolio, and the registry stays valid", () => {
    const routes = buildRegistry();
    expect(resolveRoute("/portfolio", routes)?.id).toBe("portfolio");
    expect(resolveRoute("/portfolio", routes)?.status).toBe("live");
  });

  it("leaves the old Mutual Funds dashboard route as it was", async () => {
    expect(mutualFunds.path).toBe("/portfolio/mutual-funds");
    expect(mutualFunds.status).toBe("live");
    const { default: wrapper } = await import("@/shell/wrappers/DashboardWrapper");
    expect((await mutualFunds.page!()).default).toBe(wrapper);
  });
});
