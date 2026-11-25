import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import { HomePage } from "../HomePage";
import { mockHomeApi, type HomeCall } from "../testing/homeApi";
import type { MoversAllResponse, MoversResponse, MoversView } from "../types";
import { Movers, type MoversProps } from "./Movers";
import { API_BASE_URL } from "@/lib/apiClient";
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

  it("shows a different footnote for the sector view and the others, and a live button to all funds", () => {
    const first = setup();
    expect(screen.getByText("Sector figures are estimates and add up to the exact change.")).toBeInTheDocument();
    first.unmount();
    setup({ data: fixture<MoversResponse>("movers_fund"), view: "fund", loadAll: vi.fn() });
    expect(screen.getByText("Rows add up to the net change.")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "View all by day's change" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).not.toHaveAttribute("title");
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

  it("renders SchemeLogo on fund rows inside the opened movers dialog", () => {
    setup();
    const data = fixture<MoversResponse>("movers_sector");
    fireEvent.click(screen.getByTestId(`mover-${data.gains[0].key}`));
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll('[data-testid="scheme-logo"], div.shadow-2xs').length).toBeGreaterThan(0);
  });
});

describe("Movers: view all by day's change", () => {
  const linkName = "View all by day's change";
  const dialogName = "Everything that changed today";

  function sectorResponses() {
    const card = fixture<MoversResponse>("movers_sector");
    const allRows: MoversAllResponse = {
      ...card,
      rows: card.gains.map(row => ({ ...row, no_change: false })),
      waiting_for_price: [],
    };
    return { card, allRows };
  }

  function setupWithLoader() {
    const { card, allRows } = sectorResponses();
    const loadAll = vi.fn<(view: MoversView) => Promise<MoversAllResponse>>().mockResolvedValue(allRows);
    const props = { data: card, loadAll, hideValues: false };
    setup(props);
    return { card, loadAll };
  }

  function getViewAll() {
    return screen.queryByRole("button", { name: linkName }) ?? screen.getByRole("link", { name: linkName });
  }

  it("view_all_link_is_underlined_at_rest", () => {
    setupWithLoader();
    expect(getViewAll()).toHaveClass("underline");
  });
  it("view_all_link_keeps_its_accessible_name", () => {
    setupWithLoader();
    expect(getViewAll()).toHaveAccessibleName("View all by day's change");
  });
  it("disabled_variant_stays_non_interactive", () => {
    setup();
    const twin = screen.getByText(linkName).closest('[aria-disabled="true"]');
    expect(twin).toHaveAttribute("title", "Coming soon");
    expect(twin?.tagName).toBe("SPAN");
    expect(twin).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("button", { name: linkName })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(linkName));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the existing one-row panel is untouched", () => {
    const { card, loadAll } = setupWithLoader();
    const row = card.gains[0];
    fireEvent.click(screen.getByTestId(`mover-${row.key}`));

    const panel = screen.getByRole("dialog", { name: `${row.label} funds` });
    const funds = within(panel).getAllByRole("listitem");
    expect(funds).toHaveLength(row.funds.length);
    for (const fund of row.funds) {
      expect(within(panel).getByText(fund.name)).toBeVisible();
    }
    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
    expect(loadAll).not.toHaveBeenCalled();

    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: `${row.label} funds` })).toBeNull();
  });

  // D-11 replaces the old disabled-link assertion in this file's net-change tests.
  it("the link is live", async () => {
    setupWithLoader();
    const link = getViewAll();
    expect(link).toBeEnabled();
    expect(link).not.toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("title", "Coming soon");

    act(() => link.focus());
    fireEvent.click(link);
    const dialog = screen.getByRole("dialog", { name: dialogName });
    expect(dialog).toBeVisible();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(link).toHaveFocus());
  });

  it("all rows are fetched only when the dialog opens", async () => {
    const { loadAll } = setupWithLoader();
    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
    expect(loadAll).not.toHaveBeenCalled();

    fireEvent.click(getViewAll());

    await waitFor(() => expect(loadAll).toHaveBeenCalledExactlyOnceWith("sector"));
  });

  it("the card request is unchanged", async () => {
    const { card, allRows } = sectorResponses();
    const api = mockHomeApi({ movers: (call: HomeCall) => call.query.get("all") === "true" ? allRows : card });
    try {
      render(<HomePage today="2026-10-23" />);
      await screen.findByTestId("movers-split");

      const requests = () => api.callsFor("movers").map(call => {
        const url = new URL(call.url, "http://localhost");
        return { path: url.pathname, query: Object.fromEntries(url.searchParams) };
      });
      const path = new URL(`${API_BASE_URL}/household/aggregate/home/movers`, "http://localhost").pathname;
      expect(requests()).toEqual([{ path, query: { by: "sector" } }]);

      fireEvent.click(getViewAll());

      await waitFor(() => expect(requests()).toEqual([
        { path, query: { by: "sector" } },
        { path, query: { by: "sector", all: "true" } },
      ]));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
