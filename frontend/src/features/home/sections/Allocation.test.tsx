import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { AllocationResponse } from "../types";
import { Allocation, type AllocationProps } from "./Allocation";

const ASHA = "81e5a369-bbd4-59f1-b480-8a5bbf1c74ef";

function setup(overrides: Partial<AllocationProps> = {}) {
  const handlers = { onClassClick: vi.fn(), onSelectMember: vi.fn(), onShowFamily: vi.fn(), onRetry: vi.fn() };
  const props: AllocationProps = {
    status: "data",
    data: fixture<AllocationResponse>("allocation_family"),
    scope: "aggregate",
    memberName: null,
    ...handlers,
    ...overrides,
  };
  const view = render(<Allocation {...props} />);
  return { ...view, handlers };
}

describe("Allocation: states", () => {
  it("shows a loading placeholder", () => {
    setup({ status: "loading", data: null });
    expect(screen.getByRole("status", { name: "Loading allocation" })).toBeInTheDocument();
    expect(screen.queryByTestId("donut-center-value")).toBeNull();
  });

  it("shows the title, a message and a retry button on an error", () => {
    const { handlers } = setup({ status: "error", data: null });
    expect(screen.getByRole("heading", { name: /Asset allocation/ })).toBeInTheDocument();
    expect(screen.getByText("Could not load allocation.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it("treats data status without data like an error", () => {
    setup({ status: "data", data: null });
    expect(screen.getByText("Could not load allocation.")).toBeInTheDocument();
  });

  it("invites the user to add investments when the portfolio is empty, keeping the coming-soon classes", () => {
    setup({ data: fixture<AllocationResponse>("allocation_empty") });
    expect(screen.getByText("Add investments to see allocation")).toBeInTheDocument();
    expect(screen.queryByTestId("donut-center-value")).toBeNull();
    expect(screen.queryByTestId("legend-equity")).toBeNull();
    expect(screen.getAllByTestId(/^legend-soon-/)).toHaveLength(3);
    expect(screen.queryByTestId("family-bar")).toBeNull();
  });
});

describe("Allocation: the donut and the legend", () => {
  it("titles the card and shows the compact total in the centre", () => {
    setup();
    expect(screen.getByRole("heading", { name: /Asset allocation/ })).toBeInTheDocument();
    expect(screen.getByTestId("donut-center-value").textContent).toBe("₹5,212");
    expect(screen.getByTestId("donut-center-label").textContent).toBe("Total value");
  });

  it("draws a slice for each class with a share, coloured by rank", () => {
    setup();
    expect(screen.getByTestId("slice-equity").getAttribute("stroke")).toBe("var(--c1)");
    expect(screen.getByTestId("slice-debt").getAttribute("stroke")).toBe("var(--c2)");
    expect(screen.getByTestId("slice-gold").getAttribute("stroke")).toBe("var(--c3)");
    expect(screen.queryByTestId("slice-others")).toBeNull();
  });

  it("lists live classes largest first with their share to one decimal place", () => {
    setup();
    const rows = screen.getAllByTestId(/^legend-(?!soon)/);
    expect(rows.map(row => row.getAttribute("data-testid"))).toEqual(["legend-equity", "legend-debt", "legend-gold", "legend-real_estate", "legend-others"]);
    expect(rows[0].textContent).toContain("Equity");
    expect(rows[0].textContent).toContain("42.2%");
    expect(rows[3].textContent).toContain("0.0%");
    expect(rows[0].getAttribute("data-color")).toBe("var(--c1)");
  });

  it("lists the coming-soon classes muted, with a pill, after the live ones, and they do nothing", () => {
    const { handlers } = setup();
    const soon = screen.getAllByTestId(/^legend-soon-/);
    expect(soon.map(row => row.getAttribute("data-testid"))).toEqual([
      "legend-soon-direct_stocks", "legend-soon-fds_bonds", "legend-soon-us_stocks",
    ]);
    expect(soon[0].textContent).toContain("Direct stocks");
    expect(within(soon[0]).getByText("Coming soon")).toBeInTheDocument();
    expect(soon[0].getAttribute("aria-disabled")).toBe("true");
    expect(soon[0].getAttribute("role")).toBeNull();
    fireEvent.click(soon[0]);
    expect(handlers.onClassClick).not.toHaveBeenCalled();
  });

  it("opens a class from its legend row, by click, Enter and Space, and from its slice", () => {
    const { handlers } = setup();
    const row = screen.getByTestId("legend-debt");
    expect(row.getAttribute("role")).toBe("button");
    expect(row.getAttribute("tabindex")).toBe("0");
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    row.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByTestId("slice-gold"));
    expect(handlers.onClassClick.mock.calls.map(call => call[0])).toEqual(["debt", "debt", "debt", "gold"]);
  });

  it("keeps legend rows and slices as buttons that open the pop-up when no handler is given", () => {
    setup({ onClassClick: undefined });
    expect(screen.getByTestId("legend-debt").getAttribute("role")).toBe("button");
    expect(screen.getByTestId("slice-debt").getAttribute("role")).toBe("button");
  });

  it("shows the Analytics link greyed out with a tooltip", () => {
    setup();
    const link = screen.getByText("View in Analytics");
    const holder = link.closest("[aria-disabled]") as HTMLElement;
    expect(holder.getAttribute("aria-disabled")).toBe("true");
    expect(holder.getAttribute("title")).toBe("Coming soon");
  });

  it("flags an estimated mix and partial data", () => {
    setup({ data: fixture<AllocationResponse>("allocation_fallback") });
    const pill = screen.getByText("Approximate");
    expect(pill.closest("[title]")?.getAttribute("title")).toBe("Estimated from your funds' categories");
    const partial = fixture<AllocationResponse>("allocation_family");
    partial.partial = true;
    partial.missing_funds = [{ scheme_id: "a", name: "Dev Gold Fund" }];
    setup({ data: partial });
    expect(screen.getByRole("note").getAttribute("title")).toBe("Missing: Dev Gold Fund");
  });

  it("shows neither an approximate pill nor a partial badge normally", () => {
    setup();
    expect(screen.queryByText("Approximate")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("Allocation: the family section", () => {
  it("shows the family bar and rows in a family view and passes the chosen member on", () => {
    const { handlers } = setup();
    expect(screen.getByTestId("family-bar")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`family-row-${ASHA}`));
    expect(handlers.onSelectMember).toHaveBeenCalledWith(ASHA);
    expect(screen.queryByText(/Viewing/)).toBeNull();
  });

  it("shows a 'Viewing ...' strip with a link back to the family in a member's view", () => {
    const { handlers } = setup({
      data: fixture<AllocationResponse>("allocation_member"), scope: "member", memberName: "Dev Rao",
    });
    expect(screen.queryByTestId("family-bar")).toBeNull();
    expect(screen.getByText("Viewing Dev Rao's portfolio")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Family combined/ }));
    expect(handlers.onShowFamily).toHaveBeenCalledTimes(1);
  });

  it("leaves out the link back when there is no family to go back to (a household of one)", () => {
    setup({
      data: fixture<AllocationResponse>("allocation_member"), scope: "member", memberName: "Dev Rao",
      onShowFamily: undefined,
    });
    expect(screen.getByText("Viewing Dev Rao's portfolio")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Family combined/ })).toBeNull();
  });

  it("falls back to a plain strip when a member has no name", () => {
    setup({ data: fixture<AllocationResponse>("allocation_member"), scope: "member", memberName: null });
    expect(screen.getByText("Viewing this portfolio")).toBeInTheDocument();
  });

  it("uses palette variables only", () => {
    const { container } = setup();
    expect(container.innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(container.innerHTML).toContain("var(--ui-elevated)");
  });
});

describe("Allocation: interactive donut and the funds pop-up (UI round 2, change 6)", () => {
  const FUNDS = [
    { scheme_id: "s1", name: "Alpha Flexi Cap Fund - Direct Growth", value: "1500.00", share_of_class: "68.18" },
    { scheme_id: "s2", name: "Beta Large Cap Fund - Direct Growth", value: "700.00", share_of_class: "31.82" },
  ];
  function withFunds(): AllocationResponse {
    const data = fixture<AllocationResponse>("allocation_family");
    data.classes = data.classes.map(row => (row.key === "equity" ? { ...row, funds: FUNDS } : row));
    return data;
  }
  const slice = (key: string) => screen.getByTestId(`slice-${key}`);
  const legend = (key: string) => screen.getByTestId(`legend-${key}`);

  it("hovering a slice highlights its legend row and dims the other slices", () => {
    setup({ data: withFunds() });
    fireEvent.mouseEnter(slice("debt"));
    expect(legend("debt").getAttribute("data-active")).toBe("true");
    expect(legend("equity").getAttribute("data-active")).toBe("false");
    expect(slice("equity").getAttribute("data-dim")).toBe("true");
    expect(slice("debt").getAttribute("data-dim")).toBe("false");
    fireEvent.mouseLeave(slice("debt"));
    expect(legend("debt").getAttribute("data-active")).toBe("false");
    expect(slice("equity").getAttribute("data-dim")).toBe("false");
  });
  it("hovering or focusing a legend row dims the other slices", () => {
    setup({ data: withFunds() });
    fireEvent.mouseEnter(legend("gold"));
    expect(slice("gold").getAttribute("data-dim")).toBe("false");
    expect(slice("equity").getAttribute("data-dim")).toBe("true");
    fireEvent.mouseLeave(legend("gold"));
    fireEvent.focus(legend("debt"));
    expect(slice("equity").getAttribute("data-dim")).toBe("true");
    expect(legend("debt").getAttribute("data-active")).toBe("true");
    fireEvent.blur(legend("debt"));
    expect(slice("equity").getAttribute("data-dim")).toBe("false");
  });
  it("clicking a slice opens the pop-up for that class and still tells the page", () => {
    const { handlers } = setup({ data: withFunds() });
    fireEvent.click(slice("equity"));
    const dialog = screen.getByRole("dialog", { name: "Equity" });
    expect(within(dialog).getByText("Alpha Flexi Cap Fund - Direct Growth")).toBeInTheDocument();
    expect(within(dialog).getByText("Beta Large Cap Fund - Direct Growth")).toBeInTheDocument();
    expect(handlers.onClassClick).toHaveBeenCalledWith("equity");
  });
  it("a legend row and the Enter key open the same pop-up", () => {
    setup({ data: withFunds() });
    fireEvent.click(legend("equity"));
    expect(screen.getByRole("dialog", { name: "Equity" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(slice("equity"), { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Equity" })).toBeInTheDocument();
  });
  it("shows the selected slice as pressed while the pop-up is open and clears it on close", () => {
    setup({ data: withFunds() });
    fireEvent.click(slice("equity"));
    expect(slice("equity").getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(slice("equity").getAttribute("aria-pressed")).toBe("false");
  });
  it("returns focus to the legend row that opened the pop-up", async () => {
    setup({ data: withFunds() });
    legend("debt").focus();
    fireEvent.click(legend("debt"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(legend("debt")));
  });
  it("a payload without funds still renders and the pop-up shows the fallback", () => {
    const data = fixture<AllocationResponse>("allocation_family");
    data.classes = data.classes.map(({ funds: _funds, ...row }) => row);
    setup({ data });
    fireEvent.click(slice("debt"));
    expect(within(screen.getByRole("dialog", { name: "Debt" })).getByText("Fund details are not available for this class yet.")).toBeInTheDocument();
  });
  it("a class with no value is not interactive", () => {
    const { handlers } = setup({ data: withFunds() });
    const row = legend("others");
    expect(row.getAttribute("role")).toBeNull();
    fireEvent.click(row);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(handlers.onClassClick).not.toHaveBeenCalled();
  });
});

describe("Allocation: the pop-up does not reopen by itself (review fix)", () => {
  it("forgets the open class when the response goes away, so ready data does not bring the pop-up back", () => {
    const base: AllocationProps = {
      status: "data", data: fixture<AllocationResponse>("allocation_family"), scope: "aggregate", memberName: null,
      onClassClick: vi.fn(), onSelectMember: vi.fn(), onShowFamily: vi.fn(), onRetry: vi.fn(),
    };
    const { rerender } = render(<Allocation {...base} />);
    fireEvent.click(screen.getByTestId("slice-equity"));
    expect(screen.getByRole("dialog", { name: "Equity" })).toBeInTheDocument();
    rerender(<Allocation {...base} status="loading" data={null} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Allocation {...base} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("slice-equity").getAttribute("aria-pressed")).toBe("false");
  });
});
