import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ScopeContext } from "@/shell/scope/ScopeContext";
import type { ScopeValue } from "@/shell/scope/scopeTypes";
import { RegistryContext } from "@/shell/registry/RegistryContext";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { paths } from "@/shell/nav/paths";
import type { PageFilterSource } from "@/components/search/searchResultTypes";
import { FundPageFrame } from "@/features/individual-fund/FundPageFrame";
import { fixture } from "@/features/individual-fund/fixtures";
import type { SummaryResponse } from "@/features/individual-fund/types";

const mocks = vi.hoisted(() => ({ summary: vi.fn(), hideSearch: false }));
vi.mock("@/features/individual-fund/api", () => ({ fundPageApi: { summary: mocks.summary } }));
vi.mock("@/components/search/PageSearch", () => ({
  PageSearch: (props: PageFilterSource & { userId: string | null; jumpOnly?: boolean }) => mocks.hideSearch ? null : (
    <div data-testid="page-search-stub" data-page-key={props.pageKey} data-noun={props.noun}
      data-total={props.total} data-matched={props.matched} data-chips-allowed={JSON.stringify(props.chipsAllowed)}
      data-jump-only={String(props.jumpOnly)} data-user-id={JSON.stringify(props.userId)} />
  ),
}));
const scope: ScopeValue = {
  viewMode: "aggregate", memberId: null, members: [{ id: "asha", name: "Asha" }, { id: "bela", name: "Bela" }],
  scopeKey: "aggregate", userId: "example-user", setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(),
};
const routes = buildRegistry();
function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={[paths.mutualFunds.fund("example")]}>
    <RegistryContext.Provider value={routes}><ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider></RegistryContext.Provider>
  </MemoryRouter>;
}
function frame() {
  return <FundPageFrame schemeId="example" tab="overview">{() => <p>Example page body</p>}</FundPageFrame>;
}
async function mount() {
  const view = render(frame(), { wrapper: Wrapper });
  await screen.findByRole("heading", { level: 1, name: "Example Growth Fund" });
  return view;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.hideSearch = false;
  const summary = fixture<SummaryResponse>("summary_family");
  mocks.summary.mockResolvedValue({ ...summary, scheme: {
    id: "example", name: "Example Growth Fund", plan: "Direct", category: "Flexi Cap Fund", amc_name: "Example AMC",
  } });
});
afterEach(cleanup);

describe("fund frame search", () => {
  it("the header mounts the box in jump-only mode with pageKey fund", async () => {
    await mount();
    const box = within(screen.getByTestId("fund-header")).getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "fund");
    expect(box).toHaveAttribute("data-noun", "funds");
    expect(box).toHaveAttribute("data-total", "0");
    expect(box).toHaveAttribute("data-matched", "0");
    expect(box).toHaveAttribute("data-chips-allowed", "[]");
    expect(box).toHaveAttribute("data-jump-only", "true");
    expect(box).toHaveAttribute("data-user-id", '"example-user"');
  });
  it("the box sits right before the greyed Add Investment button", async () => {
    await mount();
    const box = screen.getByTestId("page-search-stub");
    const add = screen.getByRole("button", { name: "Add Investment" });
    expect(box.parentElement).toBe(add.parentElement);
    expect(box.nextElementSibling).toBe(add);
    expect(add.parentElement).toHaveClass("gap-2");
  });
  it("the greyed buttons, pills and breadcrumb are unchanged", async () => {
    await mount();
    const page = screen.getByTestId("fund-page");
    for (const name of ["Add Investment", "More"]) {
      const button = within(page).getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("title", "Coming soon");
      fireEvent.click(button);
    }
    expect(screen.getAllByTestId("fund-pill").map((pill) => pill.textContent)).toEqual(["Direct Plan", "Flexi Cap", "Example AMC"]);
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Investments" })).toHaveAttribute("href", paths.portfolio());
    expect(within(crumbs).getByRole("link", { name: "Mutual Funds" })).toHaveAttribute("href", paths.mutualFunds.root());
    expect(within(crumbs).getByText("Example Growth Fund")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Example page body")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Fund sections" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["Overview", "Overlap", "Insights"]);
  });
  it("with the box mocked out the frame renders as before", async () => {
    const view = await mount();
    const baseline = screen.getByTestId("fund-page").cloneNode(true) as HTMLElement;
    baseline.querySelector('[data-testid="page-search-stub"]')?.remove();
    mocks.hideSearch = true;
    view.rerender(frame());
    expect(screen.queryByTestId("page-search-stub")).not.toBeInTheDocument();
    expect(screen.getByTestId("fund-page").outerHTML).toBe(baseline.outerHTML);
  });
});
