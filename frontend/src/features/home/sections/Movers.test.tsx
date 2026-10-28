import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { MoversResponse } from "../types";
import { Movers, type MoversProps } from "./Movers";
import { renderInShell as render } from "@/shell/testing";

function setup(overrides: Partial<MoversProps> = {}) {
  const handlers = { onViewChange: vi.fn(), onRetry: vi.fn() };
  const props: MoversProps = {
    status: "data",
    data: fixture<MoversResponse>("movers_sector"),
    view: "sector",
    ...handlers,
    ...overrides,
  };
  const view = render(<Movers {...props} />);
  return { ...view, handlers };
}

describe("Movers: states", () => {
  it("shows a loading placeholder", () => {
    setup({ status: "loading", data: null });
    expect(screen.getByRole("status", { name: "Loading movers" })).toBeInTheDocument();
  });

  it("shows the title, a message and a retry button on an error", () => {
    const { handlers } = setup({ status: "error", data: null });
    expect(screen.getByRole("heading", { name: /What moved today/ })).toBeInTheDocument();
    expect(screen.getByText("Could not load movers.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it("treats data status without data like an error", () => {
    setup({ status: "data", data: null });
    expect(screen.getByText("Could not load movers.")).toBeInTheDocument();
  });

  it("says there is no movement data when nothing moved and nothing is hidden", () => {
    setup({ data: fixture<MoversResponse>("movers_empty"), view: "fund" });
    expect(screen.getByText("No movement data yet")).toBeInTheDocument();
    expect(screen.queryByTestId("movers-split")).toBeNull();
  });
});

describe("Movers: the header and the controls", () => {
  it("titles the card and marks the sector view as an estimate, with an explanation", () => {
    setup();
    expect(screen.getByRole("heading", { name: /What moved today/ })).toBeInTheDocument();
    const pill = screen.getByText("Estimated");
    expect(pill.closest("[title]")?.getAttribute("title")).toBe("Spread over each fund's sectors using its latest monthly holdings");
  });

  it("has no estimate pill in the other views", () => {
    setup({ data: fixture<MoversResponse>("movers_fund"), view: "fund" });
    expect(screen.queryByText("Estimated")).toBeNull();
  });

  it("offers Sector, Category and Fund as a group with the current one pressed, and reports a change", () => {
    const { handlers } = setup({ view: "category" });
    const group = screen.getByRole("group", { name: "Group by" });
    const pressed = within(group).getAllByRole("button").map(button => [button.textContent, button.getAttribute("aria-pressed")]);
    expect(pressed).toEqual([["Sector", "false"], ["Category", "true"], ["Fund", "false"]]);
    fireEvent.click(within(group).getByRole("button", { name: "Fund" }));
    expect(handlers.onViewChange).toHaveBeenCalledWith("fund");
  });

  it("flags partial data with the missing funds", () => {
    const data = fixture<MoversResponse>("movers_sector");
    data.partial = true;
    data.missing_funds = [{ scheme_id: "a", name: "Dev Gold Fund" }];
    setup({ data });
    expect(screen.getByRole("note").getAttribute("title")).toBe("Missing: Dev Gold Fund");
  });

  it("explains a fall-back from the sector view to categories", () => {
    setup({ data: fixture<MoversResponse>("movers_category_fallback"), view: "sector" });
    expect(screen.getByTestId("movers-fallback").textContent).toBe(
      "Sector view needs holdings for at least half of your funds, so categories are shown instead.",
    );
    expect(screen.queryByTestId("movers-fallback")).not.toBeNull();
    expect(screen.queryByText("Estimated")).toBeNull();
  });

  it("shows no fall-back note normally", () => {
    setup();
    expect(screen.queryByTestId("movers-fallback")).toBeNull();
  });
});

describe("Movers: the net change and the rows", () => {
  it("shows the net change with its percentage and the gained and lost totals", () => {
    setup({ data: fixture<MoversResponse>("movers_fund"), view: "fund" });
    expect(screen.getByText("Net change today")).toBeInTheDocument();
    expect(screen.getByTestId("change-badge").textContent).toBe("▲ +₹12 (+0.23%)");
    expect(screen.getByTestId("split-gain").style.width).toBe("68.8%");
    expect(screen.getByTestId("split-loss").style.width).toBe("31.2%");
    expect(screen.getByText("Gained ₹22")).toBeInTheDocument();
    expect(screen.getByText("Lost ₹10")).toBeInTheDocument();
  });

  it("lists the gains and the losses under their headings, in the order given", () => {
    setup({ data: fixture<MoversResponse>("movers_fund"), view: "fund" });
    expect(screen.getByText("Lifted your portfolio")).toBeInTheDocument();
    expect(screen.getByText("Pulled it down")).toBeInTheDocument();
    const rows = screen.getAllByTestId(/^mover-(?!bar|tile|fund)/);
    expect(rows.map(row => row.getAttribute("data-testid"))).toEqual([
      "mover-" + fixture<MoversResponse>("movers_fund").gains[0].key,
      "mover-" + fixture<MoversResponse>("movers_fund").gains[1].key,
      "mover-" + fixture<MoversResponse>("movers_fund").losses[0].key,
    ]);
    expect(rows[0].textContent).toContain("Asha Large Cap");
    expect(rows[2].textContent).toContain("-₹10");
  });

  it("leaves out the 'Lifted' heading when nothing gained and the 'Pulled' heading when nothing lost", () => {
    setup({ data: fixture<MoversResponse>("movers_all_down"), view: "fund" });
    expect(screen.queryByText("Lifted your portfolio")).toBeNull();
    expect(screen.getByText("Pulled it down")).toBeInTheDocument();
    expect(screen.getByTestId("change-badge").textContent.startsWith("▼")).toBe(true);
    expect(screen.queryByTestId("split-gain")).toBeNull();
    expect(screen.getByTestId("split-loss").style.width).toBe("100%");
  });

  it("sizes every bar against the largest single amount", () => {
    setup({ data: fixture<MoversResponse>("movers_fund"), view: "fund" });
    const widths = screen.getAllByTestId(/^mover-bar-/).map(node => (node as HTMLElement).style.width);
    expect(widths).toEqual(["50%", "50%", "50%"]);
  });

  it("shows an 'others' row with the count and the amount, that is not clickable", () => {
    setup({ data: fixture<MoversResponse>("movers_fund"), view: "fund" });
    const others = screen.getByTestId("movers-others");
    expect(others.textContent).toContain("1 other");
    expect(others.textContent).toContain("+₹2");
    expect(others.getAttribute("role")).toBeNull();
  });

  it("leaves out the 'others' row when there are none", () => {
    setup();
    expect(screen.queryByTestId("movers-others")).toBeNull();
  });

  it("shows a different footnote for the sector view and the others, and a greyed link to all funds", () => {
    const first = setup();
    expect(screen.getByText("Sector figures are estimates and add up to the exact change.")).toBeInTheDocument();
    first.unmount();
    setup({ data: fixture<MoversResponse>("movers_fund"), view: "fund" });
    expect(screen.getByText("Rows add up to the net change.")).toBeInTheDocument();
    const link = screen.getByText("View all by day's change").closest("[aria-disabled]") as HTMLElement;
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.getAttribute("title")).toBe("Coming soon");
  });
});

describe("Movers: the funds behind a row", () => {
  it("opens a panel with the funds of the chosen row and closes it again", () => {
    setup();
    const data = fixture<MoversResponse>("movers_sector");
    fireEvent.click(screen.getByTestId(`mover-${data.gains[0].key}`));
    const panel = screen.getByRole("dialog", { name: `${data.gains[0].label} funds` });
    const names = within(panel).getAllByRole("listitem").map(item => item.textContent);
    expect(names).toHaveLength(data.gains[0].funds.length);
    expect(names.some(text => text?.includes("Asha Large Cap"))).toBe(true);
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows no per-fund amount in the sector view (it is not known) and the amount in the fund view", () => {
    const { unmount } = setup();
    const sector = fixture<MoversResponse>("movers_sector");
    fireEvent.click(screen.getByTestId(`mover-${sector.gains[0].key}`));
    expect(within(screen.getByRole("dialog")).getAllByRole("listitem")[0].textContent).not.toMatch(/₹/);
    unmount();
    setup({ data: fixture<MoversResponse>("movers_fund"), view: "fund" });
    const fund = fixture<MoversResponse>("movers_fund");
    fireEvent.click(screen.getByTestId(`mover-${fund.losses[0].key}`));
    expect(within(screen.getByRole("dialog")).getAllByRole("listitem")[0].textContent).toContain("-₹10");
  });

  it("closes with Escape", () => {
    setup();
    const data = fixture<MoversResponse>("movers_sector");
    fireEvent.click(screen.getByTestId(`mover-${data.gains[0].key}`));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the panel when the view changes", () => {
    const { rerender, handlers } = setup();
    const data = fixture<MoversResponse>("movers_sector");
    fireEvent.click(screen.getByTestId(`mover-${data.gains[0].key}`));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(<Movers status="data" data={fixture<MoversResponse>("movers_fund")} view="fund" {...handlers} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses palette variables only", () => {
    const { container } = setup();
    expect(container.innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(container.innerHTML).toContain("var(--ui-elevated)");
  });
});
