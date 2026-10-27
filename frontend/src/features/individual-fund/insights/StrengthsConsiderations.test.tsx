import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { InsightsResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { StrengthsConsiderations } from "./StrengthsConsiderations";

const section = (over: Partial<FundSection<InsightsResponse>> = {}): FundSection<InsightsResponse> => ({
  status: "ready", data: fixture<InsightsResponse>("insights_full"), reason: null, error: null, retry: vi.fn(), ...over,
});
const mount = (s: FundSection<InsightsResponse> = section()) => render(<StrengthsConsiderations insights={s} />);

describe("StrengthsConsiderations", () => {
  it("test_strengths_and_considerations_sections_with_spacing_and_evidence: two lists with their own headings, spaced apart, each row opening its evidence", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Strengths and Considerations" })).toBeInTheDocument();
    const lists = screen.getByTestId("sc-lists");
    expect(lists.className).toContain("space-y-5");
    expect(within(lists).getByRole("heading", { name: "Strengths" })).toBeInTheDocument();
    expect(within(lists).getByRole("heading", { name: "Considerations" })).toBeInTheDocument();
    const strengths = within(screen.getByTestId("sc-strengths")).getByRole("list", { name: "Strengths" });
    const considerations = within(screen.getByTestId("sc-considerations")).getByRole("list", { name: "Considerations" });
    expect(within(strengths).getAllByRole("button").map(row => row.getAttribute("data-testid"))).toEqual(["fact-long_term_vs_category", "fact-manager_tenure"]);
    expect(within(considerations).getAllByRole("button").map(row => row.getAttribute("data-testid"))).toEqual(["fact-overlap", "fact-volatility_vs_category"]);
    expect(screen.getByTestId("sc-strengths").compareDocumentPosition(screen.getByTestId("sc-considerations")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(considerations).getByTestId("fact-volatility_vs_category"));
    const dialog = screen.getByRole("dialog", { name: "Evidence" });
    expect(within(dialog).getAllByTestId("evidence-row").map(row => row.textContent)).toEqual(["This fund14.2%", "Category median14.0%"]);
    expect(within(dialog).getByTestId("evidence-text")).toHaveTextContent("Volatility is above the category median.");
  });

  it("each row carries the icon of its own tone, and the overlap consideration has the greyed Overlap link", () => {
    mount();
    const icon = (id: string) => within(screen.getByTestId(`fact-${id}`)).getByTestId("tone-icon").getAttribute("data-icon");
    expect(icon("long_term_vs_category")).toBe("trending-up");
    expect(icon("overlap")).toBe("triangle-alert");
    expect(icon("volatility_vs_category")).toBe("circle-alert");
    expect(within(screen.getByTestId("fact-overlap")).getByTestId("overlap-link")).toHaveAttribute("title", "Coming soon");
    expect(screen.getAllByTestId("overlap-link")).toHaveLength(1);
  });

  it("a list with no facts is left out, the other stays", () => {
    const data = fixture<InsightsResponse>("insights_full");
    data.strengths = [];
    const { unmount } = mount(section({ data }));
    expect(screen.queryByTestId("sc-strengths")).toBeNull();
    expect(screen.getByTestId("sc-considerations")).toBeInTheDocument();
    expect(screen.queryByTestId("sc-empty")).toBeNull();
    unmount();
    const other = fixture<InsightsResponse>("insights_full");
    other.considerations = [];
    mount(section({ data: other }));
    expect(screen.getByTestId("sc-strengths")).toBeInTheDocument();
    expect(screen.queryByTestId("sc-considerations")).toBeNull();
  });

  it("test_no_facts_shows_not_enough_data_message: both lists empty says so", () => {
    mount(section({ data: fixture<InsightsResponse>("insights_sparse") }));
    expect(screen.getByTestId("sc-empty")).toHaveTextContent("Not enough data to draw insights yet");
    expect(screen.queryByTestId("sc-lists")).toBeNull();
  });

  it("is a card with 20 px padding, and loading, unavailable and error have their own text", () => {
    const retry = vi.fn();
    const a = mount();
    expect(screen.getByRole("heading", { name: "Strengths and Considerations" }).closest("section")!.className).toContain("p-5");
    a.unmount();
    const b = mount(section({ status: "loading", data: null }));
    expect(screen.getByRole("status", { name: "Loading strengths and considerations" })).toBeInTheDocument();
    b.unmount();
    const c = mount(section({ status: "unavailable", data: null, reason: "no_history" }));
    expect(screen.getByTestId("section-unavailable")).toHaveTextContent("No price history yet for this fund.");
    c.unmount();
    mount(section({ status: "error", data: null, error: new Error("x"), retry }));
    expect(screen.getByText("Couldn't load strengths and considerations.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
