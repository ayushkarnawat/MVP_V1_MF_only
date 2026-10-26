import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fixture } from "../fixtures";
import type { WorthCardOut, WorthResponse } from "../types";
import { WorthALook, type WorthALookProps } from "./WorthALook";

const expense: WorthCardOut = {
  kind: "high_expense", rank: 4, scheme_id: "s", scheme_name: "Summit Small Cap Fund",
  evidence: { ter: "0.95", category_avg_ter: "0.25", gap_pp: "0.70", plan_type: "direct", share_pct: "5.00" },
};

function setup(overrides: Partial<WorthALookProps> = {}) {
  const props: WorthALookProps = { status: "data", data: fixture<WorthResponse>("worth_three_cards"), ...overrides };
  return render(<WorthALook {...props} />);
}

describe("WorthALook: states", () => {
  it("shows a loading placeholder", () => {
    setup({ status: "loading", data: null });
    expect(screen.getByRole("status", { name: "Loading worth a look" })).toBeInTheDocument();
  });

  it("shows only the title and a line when the check failed (the section never blocks the page)", () => {
    setup({ status: "error", data: null });
    expect(screen.getByRole("heading", { name: "Worth a look" })).toBeInTheDocument();
    expect(screen.getByText("Could not check right now.")).toBeInTheDocument();
    expect(screen.queryByTestId(/^worth-card-/)).toBeNull();
  });

  it("treats data status without data like a failed check", () => {
    setup({ status: "data", data: null });
    expect(screen.getByText("Could not check right now.")).toBeInTheDocument();
  });

  it("says nothing needs attention, as plain text with no card", () => {
    setup({ data: fixture<WorthResponse>("worth_none") });
    expect(screen.getByText("Nothing needs attention.")).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^worth-card-/)).toHaveLength(0);
  });

  it("renders nothing at all when no stored analysis is available yet", () => {
    const { container } = setup({ data: fixture<WorthResponse>("worth_unavailable") });
    expect(container.innerHTML).toBe("");
  });
});

describe("WorthALook: the three cards of the golden fixture", () => {
  it("titles the section and shows the cards in rank order", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Worth a look" })).toBeInTheDocument();
    const cards = screen.getAllByTestId(/^worth-card-/);
    expect(cards.map(card => card.getAttribute("data-testid"))).toEqual([
      "worth-card-weak_fund", "worth-card-underperforming", "worth-card-concentration",
    ]);
  });

  it("shows the weak fund with its chip, score chip, headline, share and a greyed link", () => {
    setup();
    const card = screen.getByTestId("worth-card-weak_fund");
    expect(within(card).getByText("Performance")).toBeInTheDocument();
    expect(within(card).getByText("Score: Weak")).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Asha Large Cap is among the weakest in its category" })).toBeInTheDocument();
    expect(card.textContent).toContain("This fund is 23.2% of your portfolio and sits in the lowest group for its category.");
    const link = within(card).getByText("Review this fund").closest("[aria-disabled]") as HTMLElement;
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.getAttribute("title")).toBe("Coming soon");
  });

  it("shows the underperforming fund with two comparison bars over the last year", () => {
    setup();
    const card = screen.getByTestId("worth-card-underperforming");
    expect(within(card).getByRole("heading", { name: "Asha Flexi Cap is lagging its category" })).toBeInTheDocument();
    expect(within(card).getByText("Last 1 year")).toBeInTheDocument();
    expect(card.textContent).toContain("This fund");
    expect(card.textContent).toContain("+5.0%");
    expect(card.textContent).toContain("Category");
    expect(card.textContent).toContain("+12.0%");
    const fund = within(card).getByTestId("compare-fund");
    const category = within(card).getByTestId("compare-category");
    expect(category.style.width).toBe("50%");
    expect(fund.style.width).toBe("20.8%");
    expect(fund.getAttribute("data-side")).toBe("gain");
    expect(within(card).getByText("Review this fund")).toBeInTheDocument();
  });

  it("shows the concentration card with the share, the five stocks as a bar and a legend", () => {
    setup();
    const card = screen.getByTestId("worth-card-concentration");
    expect(within(card).getByText("Concentration")).toBeInTheDocument();
    expect(card.textContent).toContain("Approximate · holdings as of Sep 2026");
    expect(within(card).getByRole("heading", { name: "A large share of your portfolio sits in a few stocks" })).toBeInTheDocument();
    expect(within(card).getByTestId("concentration-pct").textContent).toBe("25%");
    expect(card.textContent).toContain("of your portfolio value sits in just 5 stocks");
    const segments = within(card).getAllByTestId(/^stock-segment-/);
    expect(segments).toHaveLength(5);
    expect(segments[0].style.width).toBe("5%");
    expect(segments[0].getAttribute("data-color")).toBe("var(--c1)");
    expect(segments[4].getAttribute("data-color")).toBe("var(--c5)");
    expect(within(card).getByText(/Top Stock 1/).textContent).toContain("5.0%");
    expect(within(card).queryByTestId("concentration-trend")).toBeNull();
    expect(within(card).getByText("See what is driving it").closest("[aria-disabled]")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("shows the earlier share and the trend chip when it is known", () => {
    setup({ data: fixture<WorthResponse>("worth_concentration_with_earlier") });
    const card = screen.getByTestId("worth-card-concentration");
    expect(within(card).getByRole("heading", { name: "Your portfolio is becoming more concentrated" })).toBeInTheDocument();
    expect(within(card).getByTestId("concentration-trend").textContent).toBe("▲ 15 pts");
    expect(card.textContent).toContain("10% earlier");
  });
});

describe("WorthALook: a cost card and edge cases", () => {
  it("shows the cost scale with the category average and the fund, and the gap in words", () => {
    const data = fixture<WorthResponse>("worth_three_cards");
    data.cards = [expense];
    setup({ data });
    const card = screen.getByTestId("worth-card-high_expense");
    expect(within(card).getByText("Cost")).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Summit Small Cap Fund costs more than its category" })).toBeInTheDocument();
    expect(card.textContent).toContain("Category average 0.25%");
    expect(card.textContent).toContain("This fund 0.95%");
    expect(within(card).getByTestId("cost-tick").style.left).toBe("16.7%");
    expect(within(card).getByTestId("cost-dot").style.left).toBe("63.3%");
    expect(card.textContent).toContain("0.70 percentage points above the average for the same plan type.");
    expect(within(card).getByText("See how costs compare")).toBeInTheDocument();
  });

  it("takes the score chip's colour from the kit's band and uses palette variables elsewhere", () => {
    const { container } = setup();
    const chip = within(screen.getByTestId("worth-card-weak_fund")).getByText("Score: Weak");
    expect(chip.getAttribute("data-score-color")).toBe("#EA580C");
    expect(container.innerHTML).toContain("var(--warn-bg)");
    expect(container.innerHTML).toContain("var(--ui-divider)");
  });

  it("shows at most the three cards it was given and never invents one", () => {
    const data = fixture<WorthResponse>("worth_three_cards");
    data.cards = data.cards.slice(0, 1);
    setup({ data });
    expect(screen.getAllByTestId(/^worth-card-/)).toHaveLength(1);
  });

  it("lets a card without a fund name still render a headline (never the word 'null')", () => {
    const data = fixture<WorthResponse>("worth_three_cards");
    data.cards = [{ ...data.cards[0], scheme_name: null }];
    setup({ data });
    expect(screen.getByTestId("worth-card-weak_fund").textContent).not.toContain("null");
  });
});
