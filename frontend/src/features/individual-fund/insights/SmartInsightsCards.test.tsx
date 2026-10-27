import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { InsightsResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { SmartInsightsCards } from "./SmartInsightsCards";

const section = (over: Partial<FundSection<InsightsResponse>> = {}): FundSection<InsightsResponse> => ({
  status: "ready", data: fixture<InsightsResponse>("insights_full"), reason: null, error: null, retry: vi.fn(), ...over,
});
const mount = (s: FundSection<InsightsResponse> = section()) => render(<SmartInsightsCards insights={s} />);
const cards = () => screen.getAllByTestId(/^smart-card-\d+$/);

describe("SmartInsightsCards", () => {
  it("test_heading_is_smart_insights_with_beta_tag_not_from_mira (M11 A)", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Smart Insights Beta" })).toBeInTheDocument();
    expect(screen.getByTestId("smart-beta")).toHaveTextContent("Beta");
    expect(screen.getByText("Key insights, risks and opportunities based on your portfolio.")).toBeInTheDocument();
    expect(screen.queryByText(/from mira/i)).toBeNull();
  });

  it("test_three_cards_from_top_three_and_each_opens_evidence: title, sentence and tone icon per card, in the API order", () => {
    mount();
    expect(cards()).toHaveLength(3);
    expect(cards().map(card => card.getAttribute("data-fact"))).toEqual(["long_term_vs_category", "overlap", "manager_tenure"]);
    expect(cards().map(card => within(card).getByTestId("smart-card-title").textContent)).toEqual([
      "Long-term performance", "Overlap in your portfolio", "Fund management",
    ]);
    expect(cards()[0]).toHaveTextContent("Returned 14.2% a year over 3 years, against a category average of 13.0%.");
    expect(cards().map(card => within(card).getByTestId("tone-icon").getAttribute("data-tone"))).toEqual(["pos", "warn", "pos"]);
    expect(screen.getByRole("list", { name: "Top three insights" })).toBeInTheDocument();
    for (const card of cards()) {
      expect(card).toHaveAttribute("role", "button");
      expect(card).toHaveAttribute("tabindex", "0");
      expect(card).toHaveAttribute("aria-haspopup", "dialog");
    }
    fireEvent.click(cards()[1]);
    const dialog = screen.getByRole("dialog", { name: "Evidence" });
    expect(within(dialog).getByTestId("evidence-row")).toHaveTextContent("Beta Flexi Cap Fund51%");
    expect(within(dialog).getByTestId("evidence-text")).toHaveTextContent("51% overlap with Beta Flexi Cap Fund in your portfolio.");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a card opens with Enter and with Space, not with other keys", () => {
    mount();
    fireEvent.keyDown(cards()[0], { key: "x" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(cards()[0], { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Evidence" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    const spaceNotPrevented = fireEvent.keyDown(cards()[2], { key: " " });
    expect(spaceNotPrevented).toBe(false);
    expect(screen.getByTestId("evidence-text")).toHaveTextContent("The lead manager has managed the fund since 2019, 7.6 years.");
  });

  it("test_follow_up_button_opens_mira_popup: Ask Mira a follow-up opens the shell's coming-soon dialog", () => {
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ask Mira a follow-up" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ask Mira")).toBeInTheDocument();
    expect(within(dialog).getByText("Mira is coming soon. Your portfolio assistant will be here to help.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the Mira button is there while the facts load and when they fail", () => {
    const { unmount } = mount(section({ status: "loading", data: null }));
    expect(screen.getByRole("button", { name: "Ask Mira a follow-up" })).toBeInTheDocument();
    unmount();
    mount(section({ status: "error", data: null, error: new Error("x") }));
    expect(screen.getByRole("button", { name: "Ask Mira a follow-up" })).toBeInTheDocument();
  });

  it("test_fewer_than_three_facts_shows_fewer_cards: one fact, one card", () => {
    mount(section({ data: fixture<InsightsResponse>("insights_sparse") }));
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toHaveAttribute("data-fact", "expense_ratio_vs_category");
    expect(within(cards()[0]).getByTestId("smart-card-title")).toHaveTextContent("Fund costs");
  });

  it("test_no_facts_shows_not_enough_data_message: an empty top three says so and draws no card", () => {
    const data = fixture<InsightsResponse>("insights_full");
    data.top_three = [];
    mount(section({ data }));
    expect(screen.getByTestId("smart-empty")).toHaveTextContent("Not enough data to draw insights yet");
    expect(screen.queryAllByTestId(/^smart-card-\d+$/)).toHaveLength(0);
  });

  it("shows a loading status, the unavailable wording, and an error with Retry", () => {
    const loading = mount(section({ status: "loading", data: null }));
    expect(screen.getByRole("status", { name: "Loading smart insights" })).toBeInTheDocument();
    loading.unmount();
    const unavailable = mount(section({ status: "unavailable", data: null, reason: "no_history" }));
    expect(screen.getByTestId("section-unavailable")).toHaveTextContent("No price history yet for this fund.");
    unavailable.unmount();
    const retry = vi.fn();
    mount(section({ status: "error", data: null, error: new Error("x"), retry }));
    expect(screen.getByText("Couldn't load smart insights.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("an unknown fact id gets the generic title", () => {
    const data = fixture<InsightsResponse>("insights_full");
    data.top_three = [{ ...data.top_three[0], id: "brand_new_rule" }];
    mount(section({ data }));
    expect(screen.getByTestId("smart-card-title")).toHaveTextContent("Insight");
  });
});
