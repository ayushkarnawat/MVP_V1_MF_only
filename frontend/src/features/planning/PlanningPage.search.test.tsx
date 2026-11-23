import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageFilterSource } from "@/components/search/searchResultTypes";
import { ImportContext, ScopeContext } from "@/shell/scope/ScopeContext";
import type { ScopeValue } from "@/shell/scope/scopeTypes";
import PlanningPage from "./PlanningPage";
import { curatedList, standardResult } from "./testData";

const mocks = vi.hoisted(() => ({ listScenarios: vi.fn(), getScenarioResult: vi.fn(), searchProps: vi.fn() }));
vi.mock("./api", () => ({ listScenarios: mocks.listScenarios, getScenarioResult: mocks.getScenarioResult }));
vi.mock("@/components/search/PageSearch", () => ({
  PageSearch: (props: PageFilterSource & { userId: string | null; jumpOnly?: boolean }) => {
    mocks.searchProps(props);
    const { pageKey, noun, total, matched, chipsAllowed, jumpOnly } = props;
    return <div data-testid="page-search-stub" data-page-key={pageKey} data-noun={noun}
      data-total={total} data-matched={matched} data-chips-allowed={JSON.stringify(chipsAllowed)} data-jump-only={String(jumpOnly)} />;
  },
}));

const scope: ScopeValue = { viewMode: "aggregate", memberId: null, scopeKey: "aggregate",
  members: [{ id: "asha", name: "Asha" }], userId: "example-user",
  setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn() };
function mount() {
  return render(<MemoryRouter initialEntries={["/planning"]}>
    <ScopeContext.Provider value={scope}><ImportContext.Provider value={{ openImport: vi.fn() }}>
      <PlanningPage />
    </ImportContext.Provider></ScopeContext.Provider>
  </MemoryRouter>);
}
function expectBox(title: string) {
  const box = screen.getByTestId("page-search-stub");
  expect(box).toHaveAttribute("data-page-key", "planning");
  expect(box).toHaveAttribute("data-noun", "scenarios");
  expect(box).toHaveAttribute("data-jump-only", "true");
  expect(box).toHaveAttribute("data-total", "0");
  expect(box).toHaveAttribute("data-matched", "0");
  expect(box).toHaveAttribute("data-chips-allowed", "[]");
  expect(screen.getByRole("heading", { level: 1, name: title }).closest("header")).toContainElement(box);
  expect(mocks.searchProps).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listScenarios.mockResolvedValue(curatedList());
  mocks.getScenarioResult.mockResolvedValue(standardResult());
  window.history.replaceState(null, "");
});
afterEach(() => { cleanup(); window.history.replaceState(null, ""); });

describe("PlanningPage search", () => {
  it("the box is mounted on the landing view", () => {
    mount();
    expectBox("Planning");
  });

  it("the box is mounted on the plan-the-future view", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Plan your future/ }));
    expectBox("Plan your future");
  });

  it("the box is mounted on the explore-the-market view", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Explore market scenarios/ }));
    await screen.findByTestId(`card-${curatedList()[0].scenario_id}`);
    expectBox("Explore market scenarios");
  });

  it("the existing buttons and titles are unchanged", async () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Planning" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Plan your future/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Plan your future" })).toBeInTheDocument();
    expect(screen.getByTestId("coming-soon")).toHaveTextContent("Coming soon");
    fireEvent.click(screen.getByRole("button", { name: "Back to Planning" }));
    fireEvent.click(screen.getByRole("button", { name: /Explore market scenarios/ }));
    await screen.findByTestId(`card-${curatedList()[0].scenario_id}`);
    expect(screen.getByRole("heading", { level: 1, name: "Explore market scenarios" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Planning" })).toBeInTheDocument();
    expectBox("Explore market scenarios");
  });
});
