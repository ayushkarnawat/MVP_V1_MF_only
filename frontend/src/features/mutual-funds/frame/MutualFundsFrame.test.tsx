import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShellRoutes } from "../../../shell/ShellRoot";
import { buildRegistry } from "../../../shell/registry/buildRegistry";
import { renderInShell } from "../../../shell/testing";
import { useLocation } from "react-router";
import { useScope } from "../../../shell/scope/ScopeContext";
import { SectionCard } from "../common/SectionCard";
import { MutualFundsFrame, TAB_DEFS, useMfFrame } from "./MutualFundsFrame";

const members = [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }];
const LABELS = ["Overview", "Performance", "Allocation", "Holdings", "Transactions", "Overlap", "Other Analytics"];

function Probe() {
  const { viewMode, memberId } = useScope();
  const { pathname } = useLocation();
  return <output data-testid="probe">{`${pathname}|${viewMode}|${memberId}`}</output>;
}

describe("TAB_DEFS", () => {
  it("lists the seven tabs in contract order with exact labels and the shell paths", () => {
    expect(TAB_DEFS.map(tab => tab.id)).toEqual(["overview", "performance", "allocation", "holdings", "transactions", "overlap", "analytics"]);
    expect(TAB_DEFS.map(tab => tab.label)).toEqual(LABELS);
    expect(TAB_DEFS.map(tab => tab.to())).toEqual([
      "/portfolio/mutual-funds", "/portfolio/mutual-funds/performance", "/portfolio/mutual-funds/allocation", "/portfolio/mutual-funds/holdings",
      "/portfolio/mutual-funds/transactions", "/portfolio/mutual-funds/overlap", "/portfolio/mutual-funds/analytics",
    ]);
  });
  it("gives each tab the page title and subtitle its mockup draws", () => {
    expect(TAB_DEFS[0]).toMatchObject({ title: "All Investments", subtitle: "Your family's mutual fund portfolio — holdings, allocation, and performance in one place." });
    expect(TAB_DEFS[1]).toMatchObject({ title: "Performance", subtitle: "Returns, portfolio value over time, and how you stack up against the market." });
    expect(TAB_DEFS[2].subtitle).toBe("How your money is spread — by asset class, market cap, category, fund house, and manager.");
    expect(TAB_DEFS[3].subtitle).toBe("The stocks behind your funds — by fund, and looked through across your whole portfolio.");
    expect(TAB_DEFS[4].subtitle).toBe("Every rupee in and out of your mutual funds, by period and by fund.");
    expect(TAB_DEFS[5].subtitle).toBe("How much your equity funds duplicate each other's stock picks.");
    expect(TAB_DEFS[6].subtitle).toBe("Cost, quality, and ranking views that go deeper than the headline dashboard.");
  });
});

describe("MutualFundsFrame", () => {
  const mount = (tab: Parameters<typeof MutualFundsFrame>[0]["tab"], children: React.ReactNode = <p>body</p>, opts: Parameters<typeof renderInShell>[1] = {}) =>
    renderInShell(<MutualFundsFrame tab={tab}>{children}</MutualFundsFrame>, { path: "/portfolio/mutual-funds", scope: { members }, ...opts });

  it("renders the Overview header and Add Investment opens the import flow for the family", () => {
    const openImport = vi.fn();
    mount("overview", undefined, { openImport });
    expect(screen.getByRole("heading", { level: 1, name: "All Investments" })).toBeInTheDocument();
    expect(screen.getByText("Your family's mutual fund portfolio — holdings, allocation, and performance in one place.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Investment" }));
    expect(openImport).toHaveBeenCalledWith(undefined);
  });
  it("opens the import flow for the selected member", () => {
    const openImport = vi.fn();
    mount("overview", undefined, { openImport, scope: { members, viewMode: "member", memberId: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Investment" }));
    expect(openImport).toHaveBeenCalledWith("b");
  });
  it("opens the import flow for the family even if a stale member id is still held in the family view", () => {
    const openImport = vi.fn();
    mount("overview", undefined, { openImport, scope: { members, viewMode: "aggregate", memberId: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Investment" }));
    expect(openImport).toHaveBeenCalledWith(undefined);
  });
  it("has no Sync Investments, no Download PDF and no second Ask Mira button", () => {
    mount("overview");
    expect(screen.queryByText(/Sync Investments/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Download PDF/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask Mira" })).not.toBeInTheDocument();
  });
  it("uses the page's own title and has no Add Investment button on the other tabs", () => {
    mount("performance");
    expect(screen.getByRole("heading", { level: 1, name: "Performance" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Investment" })).not.toBeInTheDocument();
  });
  it("shows the seven tabs in order with exact labels", () => {
    mount("overview");
    const nav = screen.getByRole("navigation", { name: "Mutual Funds sections" });
    const items = [...nav.querySelectorAll("[data-tab]")];
    expect(items.map(item => item.textContent)).toEqual(LABELS);
    expect(items.map(item => item.getAttribute("data-tab"))).toEqual(TAB_DEFS.map(tab => tab.id));
  });
  it("marks only the active tab with the selected pill and aria-current", () => {
    mount("performance", undefined, { path: "/portfolio/mutual-funds/performance" });
    const nav = screen.getByRole("navigation", { name: "Mutual Funds sections" });
    const active = nav.querySelector("[data-tab=performance]")!;
    expect(active).toHaveAttribute("data-active", "true");
    expect(active.querySelector("[aria-current=page]")).toHaveTextContent("Performance");
    expect(nav.querySelectorAll("[aria-current=page]")).toHaveLength(1);
    expect(nav.querySelector("[data-tab=overview]")).toHaveAttribute("data-active", "false");
  });
  it("links every tab that is live, so all six other tabs are links from the Overview", () => {
    mount("overview");
    expect(screen.getByRole("link", { name: "Other Analytics" })).toHaveAttribute("href", "/portfolio/mutual-funds/analytics");
    for (const [name, href] of [["Performance", "performance"], ["Allocation", "allocation"], ["Holdings", "holdings"], ["Transactions", "transactions"], ["Overlap", "overlap"]]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", `/portfolio/mutual-funds/${href}`);
    }
    expect(within(screen.getByRole("navigation", { name: "Mutual Funds sections" })).getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" }).querySelector("[aria-disabled=true]")).toBeNull();
  });
  it("keeps the picked member when switching tabs", async () => {
    const routes = buildRegistry().map(route => route.id === "portfolio-mutual-funds-analytics"
      ? { ...route, page: async () => ({ default: () => <h1>Analytics stub</h1> }) }
      : route.id === "portfolio-mutual-funds"
        ? { ...route, page: async () => ({ default: () => <MutualFundsFrame tab="overview"><p>overview body</p></MutualFundsFrame> }) }
        : route);
    renderInShell(<><ShellRoutes /><Probe /></>, { path: "/portfolio/mutual-funds", routes, scope: { members, viewMode: "member", memberId: "b" } });
    await screen.findByText("overview body");
    expect(screen.getByTestId("probe")).toHaveTextContent("/portfolio/mutual-funds|member|b");
    fireEvent.click(screen.getByRole("link", { name: "Other Analytics" }));
    await screen.findByRole("heading", { name: "Analytics stub" });
    expect(screen.getByTestId("probe")).toHaveTextContent("/portfolio/mutual-funds/analytics|member|b");
  });
  it("opens the Mira coming-soon dialog from any child through useMfFrame", () => {
    function Child() { const { openMira } = useMfFrame(); return <button onClick={openMira}>Analyse with Mira</button>; }
    mount("overview", <Child />);
    expect(screen.queryByText(/Mira is coming soon/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyse with Mira" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Mira is coming soon");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    return waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("keeps the tab strip when a section inside has failed", () => {
    mount("overview", <SectionCard title="Returns" state="failed" onRetry={() => {}}>x</SectionCard>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" })).toBeInTheDocument();
  });
  it("renders a utility slot beside the tabs", () => {
    renderInShell(<MutualFundsFrame tab="overview" utility={<input aria-label="Search investments" />}><p>body</p></MutualFundsFrame>, { path: "/portfolio/mutual-funds", scope: { members } });
    expect(screen.getByRole("textbox", { name: "Search investments" })).toBeInTheDocument();
  });
  it("throws a clear error when useMfFrame is used outside the frame", () => {
    function Child() { useMfFrame(); return null; }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderInShell(<Child />, { path: "/portfolio/mutual-funds", scope: { members } })).toThrow("useMfFrame must be used within MutualFundsFrame");
    spy.mockRestore();
  });
});
