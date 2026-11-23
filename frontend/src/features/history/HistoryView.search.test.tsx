import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageFilterSource } from "@/components/search/searchResultTypes";
import { ScopeContext } from "@/shell/scope/ScopeContext";
import type { ScopeValue } from "@/shell/scope/scopeTypes";
import { HistoryView } from "./HistoryView";
import type { HistoryPoint } from "./api";

const mocks = vi.hoisted(() => ({ fetchHistory: vi.fn(), searchProps: vi.fn() }));
vi.mock("./api", () => ({ fetchHistory: mocks.fetchHistory }));
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
const points: HistoryPoint[] = Array.from({ length: 14 }, (_, index) => ({
  month: new Date(Date.UTC(2025, index + 1, 0)).toISOString().slice(0, 10),
  value: 100, invested: 90, valueText: "100.00", investedText: "90.00", partial: false, missing: [],
}));
function mount() {
  return render(<MemoryRouter initialEntries={["/portfolio/mutual-funds/history"]}>
    <ScopeContext.Provider value={scope}><HistoryView viewMode="aggregate" memberId={null} /></ScopeContext.Provider>
  </MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); mocks.fetchHistory.mockResolvedValue(points); });
afterEach(cleanup);

describe("HistoryView search", () => {
  it("the box is mounted in the header row with pageKey history in jump-only mode", async () => {
    mount();
    await screen.findByRole("img", { name: "Portfolio value by month" });
    const box = screen.getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "history");
    expect(box).toHaveAttribute("data-noun", "months");
    expect(box).toHaveAttribute("data-jump-only", "true");
    expect(box).toHaveAttribute("data-total", "0");
    expect(box).toHaveAttribute("data-matched", "0");
    expect(box).toHaveAttribute("data-chips-allowed", "[]");
    expect(mocks.searchProps).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
    expect(screen.getByRole("heading", { name: "Portfolio history" }).parentElement?.parentElement).toContainElement(box);
  });

  it("it sits before the Range group", async () => {
    mount();
    await screen.findByRole("img", { name: "Portfolio value by month" });
    const box = screen.getByTestId("page-search-stub");
    const range = screen.getByRole("group", { name: "Range" });
    expect(range.parentElement).toContainElement(box);
    expect(box.compareDocumentPosition(range) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the Range buttons and the chart are unchanged", async () => {
    mount();
    const chart = await screen.findByRole("img", { name: "Portfolio value by month" });
    const range = screen.getByRole("group", { name: "Range" });
    expect(within(range).getAllByRole("button").map(button => button.textContent)).toEqual(["1Y", "3Y", "5Y", "All"]);
    expect(within(range).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Jan 2025");
    fireEvent.click(within(range).getByRole("button", { name: "1Y" }));
    expect(within(range).getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Mar 2025");
    expect(screen.getByText("Family · monthly value at each month-end")).toBeInTheDocument();
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });
});
