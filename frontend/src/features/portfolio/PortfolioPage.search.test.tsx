import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageFilterSource } from "@/components/search/searchResultTypes";
import type { PageLayoutProps } from "@/shell/layout/PageLayout";
import { ImportContext, ScopeContext } from "@/shell/scope/ScopeContext";
import type { ScopeValue } from "@/shell/scope/scopeTypes";
import { fixture } from "./fixtures";
import { fixture as insightsFixture } from "./fixtures/insights";
import PortfolioPage from "./PortfolioPage";

const mocks = vi.hoisted(() => ({ getPortfolioSummary: vi.fn(), getPortfolioAllocation: vi.fn(),
  getPortfolioValueSeries: vi.fn(), getPortfolioInsights: vi.fn(), layoutProps: vi.fn(), searchProps: vi.fn(), visible: true }));
vi.mock("./api", () => mocks);
vi.mock("@/shell/layout/PageLayout", async importOriginal => {
  const actual = await importOriginal<typeof import("@/shell/layout/PageLayout")>();
  return { PageLayout: (props: PageLayoutProps) => {
    mocks.layoutProps(props);
    return <actual.PageLayout {...props} />;
  } };
});
vi.mock("@/components/search/PageSearch", () => ({
  PageSearch: (props: PageFilterSource & { userId: string | null; jumpOnly?: boolean }) => {
    mocks.searchProps(props);
    if (!mocks.visible) return null;
    const { pageKey, noun, total, matched, chipsAllowed, jumpOnly } = props;
    return <div data-testid="page-search-stub" data-page-key={pageKey} data-noun={noun}
      data-total={total} data-matched={matched} data-chips-allowed={JSON.stringify(chipsAllowed)} data-jump-only={String(jumpOnly)} />;
  },
}));
const scope: ScopeValue = { viewMode: "aggregate", memberId: null, scopeKey: "aggregate",
  members: [{ id: "asha", name: "Asha" }], userId: "example-user",
  setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn() };
function mount() {
  const openImport = vi.fn();
  const view = render(<MemoryRouter initialEntries={["/portfolio"]}>
    <ScopeContext.Provider value={scope}><ImportContext.Provider value={{ openImport }}>
      <PortfolioPage />
    </ImportContext.Provider></ScopeContext.Provider>
  </MemoryRouter>);
  return { ...view, openImport };
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.visible = true;
  mocks.getPortfolioSummary.mockResolvedValue(fixture("summary_family"));
  mocks.getPortfolioAllocation.mockResolvedValue(fixture("allocation_family"));
  mocks.getPortfolioValueSeries.mockResolvedValue(fixture("series_family_30d"));
  mocks.getPortfolioInsights.mockResolvedValue(insightsFixture("insights_family"));
});
afterEach(cleanup);

describe("PortfolioPage search", () => {
  it("PageLayout gets the box through its search slot (pageKey portfolio, jump-only)", async () => {
    mount();
    await screen.findByTestId("value-total");
    const box = screen.getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "portfolio");
    expect(box).toHaveAttribute("data-noun", "investments");
    expect(box).toHaveAttribute("data-jump-only", "true");
    expect(box).toHaveAttribute("data-total", "0");
    expect(box).toHaveAttribute("data-matched", "0");
    expect(box).toHaveAttribute("data-chips-allowed", "[]");
    expect(mocks.layoutProps).toHaveBeenLastCalledWith(expect.objectContaining({
      search: expect.objectContaining({ props: expect.objectContaining({ pageKey: "portfolio", jumpOnly: true }) }),
    }));
    expect(mocks.searchProps).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
    expect(screen.getByRole("heading", { level: 1 }).closest("header")).toContainElement(box);
  });

  it("the header actions are unchanged", async () => {
    const { openImport } = mount();
    await screen.findByTestId("value-total");
    const action = screen.getByRole("button", { name: "Add Investment" });
    expect(action.closest("header")).toContainElement(screen.getByTestId("page-search-stub"));
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(openImport).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(screen.getByRole("heading", { level: 1, name: "All Investments" })).toBeInTheDocument();
  });

  it("with the box mocked out the page renders as before", async () => {
    const shown = mount();
    await screen.findByTestId("value-total");
    const expectedSummary = screen.getByRole("region", { name: "Portfolio summary" }).textContent;
    const expectedTitle = screen.getByRole("heading", { level: 1 }).textContent;
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
    shown.unmount();
    mocks.visible = false;
    mount();
    await screen.findByTestId("value-total");
    expect(screen.getByRole("region", { name: "Portfolio summary" }).textContent).toBe(expectedSummary);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(expectedTitle);
    expect(screen.getByRole("button", { name: "Add Investment" })).toBeEnabled();
    expect(screen.queryByTestId("page-search-stub")).not.toBeInTheDocument();
  });
});
