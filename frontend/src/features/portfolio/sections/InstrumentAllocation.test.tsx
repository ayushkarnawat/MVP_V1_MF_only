import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderInShell } from "@/shell/testing";
import { fixture } from "../fixtures";
import type { PortfolioAllocationResponse } from "../types";
import { InstrumentAllocation, type InstrumentAllocationProps } from "./InstrumentAllocation";

const KEYS_ASC = ["direct-stocks", "us-stocks", "fds-and-bonds", "debt", "gold", "real-estate", "others", "mutual-funds"];
const rowIds = () => screen.getAllByTestId(/^legend-/).map(row => row.getAttribute("data-testid")!.slice("legend-".length));

function setup(overrides: Partial<InstrumentAllocationProps> = {}) {
  const onRetry = vi.fn();
  const props: InstrumentAllocationProps = {
    status: "data",
    data: fixture<PortfolioAllocationResponse>("allocation_family"),
    onRetry,
    ...overrides,
  };
  const view = renderInShell(<InstrumentAllocation {...props} />, { path: "/portfolio" });
  return { ...view, onRetry };
}

describe("InstrumentAllocation: states", () => {
  it("shows a loading placeholder", () => {
    setup({ status: "loading", data: null });
    expect(screen.getByRole("status", { name: "Loading allocation" })).toBeInTheDocument();
    expect(screen.queryByTestId("donut-center-value")).toBeNull();
  });

  it("shows a message and a retry button on an error, and treats data status without data the same", () => {
    const { onRetry, unmount } = setup({ status: "error", data: null });
    expect(screen.getByText("Couldn't load your asset allocation")).toBeInTheDocument();
    expect(screen.getByText("This section failed to load, but the rest of the page is unaffected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();
    setup({ status: "data", data: null });
    expect(screen.getByText("Couldn't load your asset allocation")).toBeInTheDocument();
  });

  it("has a heading and a named region when it has data", () => {
    setup();
    expect(screen.getByRole("heading", { level: 3, name: "Asset Allocation" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Asset Allocation" })).toBeInTheDocument();
  });

  it("flags partial data with a note naming the funds", () => {
    const data = fixture<PortfolioAllocationResponse>("allocation_family");
    data.partial = true;
    data.missing_funds = [{ scheme_id: "s1", name: "DevGoldFund" }];
    setup({ data });
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("1 on last known NAV");
    expect(note.getAttribute("title")).toContain("DevGoldFund");
  });

  it("shows no note when the data is complete", () => {
    setup();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("InstrumentAllocation: donut and legend", () => {
  it("lists all eight classes, ascending by allocation by default, Mutual Funds last", () => {
    setup();
    expect(rowIds()).toEqual(KEYS_ASC);
  });

  it("makes the live class a link to its page and the coming-soon classes inert", () => {
    setup();
    const mutual = screen.getByTestId("legend-mutual-funds");
    expect(within(mutual).getByRole("link")).toHaveAttribute("href", "/portfolio/mutual-funds");
    expect(mutual).toHaveTextContent("100.0%");
    const gold = screen.getByTestId("legend-gold");
    expect(gold).toHaveAttribute("aria-disabled", "true");
    expect(gold).toHaveAttribute("tabindex", "0");
    expect(within(gold).queryByRole("link")).toBeNull();
    expect(gold).toHaveTextContent("Coming soon");
    expect(gold).toHaveTextContent("—");
    expect(screen.queryByRole("link", { name: /Gold/ })).toBeNull();
    expect(within(mutual).queryByText("Coming soon")).toBeNull();
  });

  it("gives every row its class colour", () => {
    setup();
    expect(screen.getByTestId("legend-mutual-funds")).toHaveAttribute("data-color", "var(--c1)");
    expect(screen.getByTestId("legend-debt")).toHaveAttribute("data-color", "var(--c2)");
    expect(screen.getByTestId("legend-others")).toHaveAttribute("data-color", "var(--ui-text-muted)");
  });

  it("draws one slice for the one live class and shows the total in the centre", () => {
    setup();
    expect(screen.getAllByTestId(/^slice-/)).toHaveLength(1);
    expect(screen.getByTestId("slice-mutual-funds")).toBeInTheDocument();
    expect(screen.getByTestId("donut-center-label")).toHaveTextContent("Total Portfolio");
    expect(screen.getByTestId("donut-center-value")).toHaveTextContent("₹5,212");
  });

  it("shows a member's total in the centre", () => {
    setup({ data: fixture<PortfolioAllocationResponse>("allocation_member") });
    expect(screen.getByTestId("donut-center-value")).toHaveTextContent("₹3,012");
  });

  it("shows an empty portfolio as a bare ring with zeros, still listing the eight classes", () => {
    setup({ data: fixture<PortfolioAllocationResponse>("allocation_empty") });
    expect(screen.queryAllByTestId(/^slice-/)).toHaveLength(0);
    expect(screen.getByTestId("donut-center-value")).toHaveTextContent("₹0");
    expect(screen.getByTestId("legend-mutual-funds")).toHaveTextContent("0.0%");
    expect(rowIds()).toHaveLength(8);
  });
});

describe("InstrumentAllocation: hover popup", () => {
  it("is hidden until a row is hovered", () => {
    setup();
    const popup = screen.getByTestId("alloc-popup");
    expect(popup).toHaveAttribute("data-visible", "false");
    expect(popup).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the live class's figures and swaps the centre, then restores both", () => {
    setup();
    const row = screen.getByTestId("legend-mutual-funds");
    fireEvent.mouseEnter(row);
    const popup = screen.getByTestId("alloc-popup");
    expect(popup).toHaveAttribute("data-visible", "true");
    expect(popup).toHaveAttribute("aria-hidden", "false");
    expect(within(popup).getByText("Mutual Funds")).toBeInTheDocument();
    expect(screen.getByTestId("popup-allocation")).toHaveTextContent("100.0%");
    expect(screen.getByTestId("popup-value")).toHaveTextContent("₹5,212");
    expect(screen.getByTestId("popup-invested")).toHaveTextContent("₹5,000");
    expect(screen.getByTestId("popup-gain")).toHaveTextContent("+₹212");
    expect(screen.getByTestId("popup-xirr")).toHaveTextContent("34.9%");
    expect(screen.getByTestId("donut-center-label")).toHaveTextContent("Mutual Funds");
    expect(screen.getByTestId("donut-center-value")).toHaveTextContent("₹5,212");
    expect(screen.getByTestId("donut-center-pct")).toHaveTextContent("100.0%");
    expect(screen.getByTestId("slice-mutual-funds")).toHaveAttribute("data-active", "true");

    fireEvent.mouseLeave(row);
    expect(screen.getByTestId("alloc-popup")).toHaveAttribute("data-visible", "false");
    expect(screen.getByTestId("donut-center-label")).toHaveTextContent("Total Portfolio");
    expect(screen.queryByTestId("donut-center-pct")).toBeNull();
  });

  it("says a coming-soon class is not tracked yet and shows no figures", () => {
    setup();
    fireEvent.mouseEnter(screen.getByTestId("legend-gold"));
    const popup = screen.getByTestId("alloc-popup");
    expect(popup).toHaveAttribute("data-visible", "true");
    expect(within(popup).getByText("Gold")).toBeInTheDocument();
    expect(screen.getByTestId("popup-soon")).toHaveTextContent("Not tracked yet — coming soon.");
    expect(screen.queryByTestId("popup-invested")).toBeNull();
    expect(screen.getByTestId("donut-center-label")).toHaveTextContent("Gold");
    expect(screen.getByTestId("donut-center-value")).toHaveTextContent("—");
  });

  it("opens from the keyboard focus on a row and closes when focus leaves", () => {
    setup();
    const gold = screen.getByTestId("legend-gold");
    fireEvent.focus(gold);
    expect(screen.getByTestId("alloc-popup")).toHaveAttribute("data-visible", "true");
    fireEvent.blur(gold);
    expect(screen.getByTestId("alloc-popup")).toHaveAttribute("data-visible", "false");
  });

  it("follows a hovered slice too", () => {
    setup();
    fireEvent.mouseEnter(screen.getByTestId("slice-mutual-funds"));
    expect(screen.getByTestId("alloc-popup")).toHaveAttribute("data-visible", "true");
    expect(screen.getByTestId("popup-invested")).toHaveTextContent("₹5,000");
  });

  it("shows a dash for a figure that is missing", () => {
    const data = fixture<PortfolioAllocationResponse>("allocation_family");
    data.buckets[0].xirr = null;
    setup({ data });
    fireEvent.mouseEnter(screen.getByTestId("legend-mutual-funds"));
    expect(screen.getByTestId("popup-xirr")).toHaveTextContent("—");
  });
});

describe("InstrumentAllocation: filter and sort", () => {
  it("filters to the live classes and back", () => {
    setup();
    const filter = screen.getByRole("button", { name: "Filter" });
    expect(filter).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(filter);
    expect(filter).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "Filter asset classes" });
    expect(within(listbox).getByRole("option", { name: "All asset classes" })).toHaveAttribute("aria-selected", "true");
    expect(within(listbox).getByRole("option", { name: "Live only" })).toHaveAttribute("aria-selected", "false");

    fireEvent.click(within(listbox).getByRole("option", { name: "Live only" }));
    expect(rowIds()).toEqual(["mutual-funds"]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("option", { name: "All asset classes" }));
    expect(rowIds()).toHaveLength(8);
  });

  it("closes the filter list with Escape", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("flips the sort between ascending and descending, and says which", () => {
    setup();
    const sort = screen.getByRole("button", { name: "Sort: allocation low to high" });
    fireEvent.click(sort);
    expect(rowIds()).toEqual(["mutual-funds", "direct-stocks", "us-stocks", "fds-and-bonds", "debt", "gold", "real-estate", "others"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort: allocation high to low" }));
    expect(rowIds()).toEqual(KEYS_ASC);
  });

  it("keeps the donut when the filter hides rows", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("option", { name: "Live only" }));
    expect(screen.getByTestId("slice-mutual-funds")).toBeInTheDocument();
    expect(screen.getByTestId("donut-center-value")).toHaveTextContent("₹5,212");
  });
});
