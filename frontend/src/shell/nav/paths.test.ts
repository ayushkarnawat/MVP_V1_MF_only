import { expect, it } from "vitest";
import { buildRegistry } from "../registry/buildRegistry";
import { paths } from "./paths";
import { resolveRoute } from "./resolve";

const cases = [
  [() => paths.root(), "/", "root"],
  [() => paths.home(), "/home", "home"],
  [() => paths.portfolio(), "/portfolio", "portfolio"],
  [() => paths.equity.root(), "/portfolio/equity", "portfolio-equity"],
  [() => paths.equity.directStocks(), "/portfolio/equity/direct-stocks", "portfolio-equity-direct-stocks"],
  [() => paths.equity.usStocks(), "/portfolio/equity/us-stocks", "portfolio-equity-us-stocks"],
  [() => paths.equity.fdsBonds(), "/portfolio/equity/fds-bonds", "portfolio-equity-fds-bonds"],
  [() => paths.debt(), "/portfolio/debt", "portfolio-debt"],
  [() => paths.gold(), "/portfolio/gold", "portfolio-gold"],
  [() => paths.realEstate(), "/portfolio/real-estate", "portfolio-real-estate"],
  [() => paths.others(), "/portfolio/others", "portfolio-others"],
  [() => paths.mutualFunds.root(), "/portfolio/mutual-funds", "portfolio-mutual-funds"],
  [() => paths.mutualFunds.performance(), "/portfolio/mutual-funds/performance", "portfolio-mutual-funds-performance"],
  [() => paths.mutualFunds.allocation(), "/portfolio/mutual-funds/allocation", "portfolio-mutual-funds-allocation"],
  [() => paths.mutualFunds.holdings(), "/portfolio/mutual-funds/holdings", "portfolio-mutual-funds-holdings"],
  [() => paths.mutualFunds.transactions(), "/portfolio/mutual-funds/transactions", "portfolio-mutual-funds-transactions"],
  [() => paths.mutualFunds.overlap(), "/portfolio/mutual-funds/overlap", "portfolio-mutual-funds-overlap"],
  [() => paths.mutualFunds.analytics(), "/portfolio/mutual-funds/analytics", "portfolio-mutual-funds-analytics"],
  [() => paths.mutualFunds.history(), "/portfolio/mutual-funds/history", "portfolio-mutual-funds-history"],
  [() => paths.mutualFunds.fund("INF123"), "/portfolio/mutual-funds/funds/INF123", "portfolio-mutual-funds-fund"],
  [() => paths.mutualFunds.fundOverlap("INF123"), "/portfolio/mutual-funds/funds/INF123/overlap", "portfolio-mutual-funds-fund-overlap"],
  [() => paths.mutualFunds.fundInsights("INF123"), "/portfolio/mutual-funds/funds/INF123/insights", "portfolio-mutual-funds-fund-insights"],
  [() => paths.liabilities(), "/liabilities", "liabilities"],
  [() => paths.planning(), "/planning", "planning"],
  [() => paths.scenarios(), "/planning", "planning"],
  [() => paths.profile(), "/profile", "profile"],
  [() => paths.profilePersonal(), "/profile/personal", "profile-personal"],
  [() => paths.profileFamily(), "/profile/family", "profile-family"],
  [() => paths.profileConnectedAccounts(), "/profile/connected-accounts", "profile-connected-accounts"],
  [() => paths.profileSettings(), "/profile/settings", "profile-settings"],
  [() => paths.profileNotifications(), "/profile/settings/notifications", "profile-settings-notifications"],
  [() => paths.profilePreferences(), "/profile/settings/preferences", "profile-settings-preferences"],
  [() => paths.profileSecurity(), "/profile/settings/security", "profile-settings-security"],
  [() => paths.profileImportHistory(), "/profile/settings/import-history", "profile-settings-import-history"],
  [() => paths.profileSubscription(), "/profile/subscription", "profile-subscription"],
  [() => paths.profileTax(), "/profile/tax", "profile-tax"],
  [() => paths.profileDataPrivacy(), "/profile/data-privacy", "profile-data-privacy"],
  [() => paths.importHealth(), "/profile/import-health", "profile-import-health"],
  [() => paths.help(), "/help", "help"],
  [() => paths.import(), "/import", "import"],
] as const;

it.each(cases)("builds the registered destination %s -> %s", (build, expected, id) => {
  expect(build()).toBe(expected);
  expect(resolveRoute(build(), buildRegistry())?.id).toBe(id);
});

it("covers every navigable registry route, including placeholders", () => {
  expect([...new Set(cases.map(([, , id]) => id))].sort())
    .toEqual(buildRegistry().filter(route => route.path !== "*").map(route => route.id).sort());
});

it("encodes scheme ids as one path segment for all three fund builders", () => {
  const id = "INF /?#%";
  expect(paths.mutualFunds.fund(id)).toBe("/portfolio/mutual-funds/funds/INF%20%2F%3F%23%25");
  expect(paths.mutualFunds.fundOverlap(id)).toBe("/portfolio/mutual-funds/funds/INF%20%2F%3F%23%25/overlap");
  expect(paths.mutualFunds.fundInsights(id)).toBe("/portfolio/mutual-funds/funds/INF%20%2F%3F%23%25/insights");
});

it("encodes the optional member query and leaves the import pathname unchanged", () => {
  const url = new URL(paths.import("member &/?#"), "https://example.test");
  expect(url.pathname).toBe("/import");
  expect(url.searchParams.get("member")).toBe("member &/?#");
  expect([...url.searchParams.keys()]).toEqual(["member"]);
});
