import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { InsightsResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { InsightList } from "./InsightList";

const section = (over: Partial<FundSection<InsightsResponse>> = {}): FundSection<InsightsResponse> => ({
  status: "ready", data: fixture<InsightsResponse>("insights_full"), reason: null, error: null, retry: vi.fn(), ...over,
});
const mount = (s: FundSection<InsightsResponse> = section()) => render(<InsightList insights={s} />);
const rows = () => within(screen.getByRole("list", { name: "Key insights" })).getAllByRole("button");

describe("InsightList", () => {
  it("has the heading Key Insights and one row per key fact, in the API order", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Key Insights" })).toBeInTheDocument();
    expect(rows().map(row => row.getAttribute("data-testid"))).toEqual([
      "fact-overlap", "fact-expense_ratio_vs_category", "fact-top5_weight",
    ]);
    expect(rows()[2]).toHaveTextContent("The five largest disclosed holdings account for 38%.");
  });

  it("test_key_insights_rows_have_tone_icon_and_open_evidence_with_enter: info info, pos trending-up, neu minus", () => {
    mount();
    expect(rows().map(row => within(row).getByTestId("tone-icon").getAttribute("data-icon"))).toEqual(["info", "trending-up", "minus"]);
    expect(rows().map(row => within(row).getByTestId("tone-icon").getAttribute("data-tone"))).toEqual(["info", "pos", "neu"]);
    fireEvent.keyDown(rows()[1], { key: "Enter" });
    const dialog = screen.getByRole("dialog", { name: "Evidence" });
    expect(within(dialog).getAllByTestId("evidence-row").map(row => row.textContent)).toEqual(["Expense ratio0.7%", "Category average1.033333333333333333333333333%"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close modal" }));
    fireEvent.click(rows()[2]);
    expect(screen.getByTestId("evidence-text")).toHaveTextContent("The five largest disclosed holdings account for 38%.");
  });

  it("a negative fact is drawn with the circle-alert icon", () => {
    const data = fixture<InsightsResponse>("insights_full");
    data.key[0] = { ...data.key[0], tone: "neg" };
    mount(section({ data }));
    expect(within(rows()[0]).getByTestId("tone-icon")).toHaveAttribute("data-icon", "circle-alert");
  });

  it("test_overlap_row_links_to_greyed_overlap_with_tooltip: an overlap fact in the key list keeps its evidence and shows the greyed link", () => {
    // In the real golden the overlap fact is already in the key list (list "key", tone "info", priority 20).
    mount();
    const row = screen.getByTestId("fact-overlap");
    expect(within(row).getByTestId("overlap-link")).toHaveAttribute("aria-disabled", "true");
    expect(within(row).getByTestId("overlap-link")).toHaveAttribute("title", "Coming soon");
    expect(screen.getAllByTestId("overlap-link")).toHaveLength(1);
    fireEvent.click(row);
    expect(screen.getByTestId("evidence-text")).toHaveTextContent("Portfolio overlap with Golden Peer 1 Fund is 35%.");
    expect(within(screen.getByRole("dialog")).getAllByTestId("evidence-row").map(item => item.textContent)).toEqual(["Golden Peer 1 Fund35%"]);
  });

  it("test_no_facts_shows_not_enough_data_message: an empty key list says so", () => {
    const data = fixture<InsightsResponse>("insights_full");
    data.key = [];
    mount(section({ data }));
    expect(screen.getByTestId("key-empty")).toHaveTextContent("Not enough data to draw insights yet");
    expect(screen.queryByRole("list", { name: "Key insights" })).toBeNull();
  });

  it("is a card with 20 px padding", () => {
    mount();
    const card = screen.getByRole("heading", { name: "Key Insights" }).closest("section")!;
    expect(card.className).toContain("p-5");
    expect(card.className).toContain("rounded-xl");
  });

  it("loading, unavailable and error each have their own text", () => {
    const retry = vi.fn();
    const a = mount(section({ status: "loading", data: null }));
    expect(screen.getByRole("status", { name: "Loading key insights" })).toBeInTheDocument();
    a.unmount();
    const b = mount(section({ status: "unavailable", data: null, reason: "peers_unavailable" }));
    expect(screen.getByTestId("section-unavailable")).toHaveTextContent("Category comparison is not available for this fund yet.");
    b.unmount();
    mount(section({ status: "error", data: null, error: new Error("x"), retry }));
    expect(screen.getByText("Couldn't load key insights.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
