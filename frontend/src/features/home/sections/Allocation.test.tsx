import { fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(screen.getAllByTestId(/^legend-soon-/)).toHaveLength(4);
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
    expect(rows.map(row => row.getAttribute("data-testid"))).toEqual(["legend-equity", "legend-debt", "legend-gold", "legend-others"]);
    expect(rows[0].textContent).toContain("Equity");
    expect(rows[0].textContent).toContain("42.2%");
    expect(rows[3].textContent).toContain("0.0%");
    expect(rows[0].getAttribute("data-color")).toBe("var(--c1)");
  });

  it("lists the coming-soon classes muted, with a pill, after the live ones, and they do nothing", () => {
    const { handlers } = setup();
    const soon = screen.getAllByTestId(/^legend-soon-/);
    expect(soon.map(row => row.getAttribute("data-testid"))).toEqual([
      "legend-soon-direct_stocks", "legend-soon-fds_bonds", "legend-soon-real_estate", "legend-soon-us_stocks",
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

  it("makes legend rows plain text when no handler is given", () => {
    setup({ onClassClick: undefined });
    expect(screen.getByTestId("legend-debt").getAttribute("role")).toBeNull();
    expect(screen.getByTestId("slice-debt").getAttribute("role")).toBeNull();
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
