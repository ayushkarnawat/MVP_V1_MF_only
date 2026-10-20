import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryRankingSection } from "./CategoryRankingSection";
import type { CategoryRankRow } from "./types";

const periodFund: CategoryRankRow = {
  scheme_id: "period-fund", scheme_name: "Period Fund", sebi_category: "Flexi Cap",
  category_unavailable: false, insufficient_history: false, thin_category: false,
  scheme_return: "0.12", category_avg_return: "0.08", category_rank: 2, category_size: 10, percentile: "80",
};

describe("category return periods", () => {
  it("names the rank basis", () => {
    render(<CategoryRankingSection ranking={{ funds: [periodFund] }} />);
    expect(screen.getByText("Ranked on the blended 3Y/5Y return.")).toBeInTheDocument();
  });

  it.each([["direct", "Direct"], ["regular", "Regular"]])("names the %s plan type of the peers", (plan_type, label) => {
    render(<CategoryRankingSection ranking={{ funds: [{ ...periodFund, plan_type }] }} />);
    expect(screen.getByText(`Compared with ${label} plan peers`)).toBeInTheDocument();
  });

  it("shows the 1Y/3Y/5Y table when periods are present", () => {
    render(<CategoryRankingSection ranking={{ funds: [{ ...periodFund, periods: {
      "1y": { fund_return: "0.124", category_avg: "0.10", peers: 10 },
      "3y": { fund_return: "0.12", category_avg: "0.08", peers: 10 },
      "5y": { fund_return: null, category_avg: "0.09", peers: 8 },
    } }] }} />);
    for (const name of ["1Y", "3Y", "5Y"]) expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    expect(screen.getByText("+12.40%")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("renders an old payload without periods and without plan type", () => {
    const { container } = render(<CategoryRankingSection ranking={{ funds: [periodFund] }} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/Compared with .* plan peers/)).not.toBeInTheDocument();
    expect(screen.getByText("+12.00%")).toBeInTheDocument();
    expect(screen.getByText("+8.00%")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it("keeps the shortfall line consistent with exponent-form backend returns", () => {
    render(<CategoryRankingSection ranking={{ funds: [{ ...periodFund, scheme_return: "0E-27", category_avg_return: "1E-3" }] }} />);
    expect(screen.getByText(/Trailing the category average by/)).toHaveTextContent("Trailing the category average by 0.10%");
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getByText("+0.10%")).toBeInTheDocument();
  });
});

describe("CategoryRankingSection", () => {
  it("displays raw fraction returns and their difference as percentages", () => {
    const { container } = render(
      <CategoryRankingSection
        ranking={{
          funds: [
            {
              scheme_id: "scheme-1",
              scheme_name: "Test Flexi Cap Fund",
              sebi_category: "Equity Scheme - Flexi Cap Fund",
              category_unavailable: false,
              insufficient_history: false,
              scheme_return: "0.12",
              category_rank: 1,
              category_size: 10,
              percentile: "90",
              category_avg_return: "0.08",
              thin_category: false,
            },
          ],
        }}
      />
    );

    expect(screen.getByText("+12.00%")).toBeInTheDocument();
    expect(screen.getByText("+8.00%")).toBeInTheDocument();
    expect(screen.getByText("+4.00%")).toBeInTheDocument();
    expect(screen.queryByText("+0.12%")).not.toBeInTheDocument();
    expect(container.querySelector(".lucide-trending-up")).not.toBeNull();
  });

  it("writes a shortfall without a second minus and with a falling arrow", () => {
    const { container } = render(<CategoryRankingSection ranking={{ funds: [{
      scheme_id: "shortfall", scheme_name: "Trailing Fund", sebi_category: "Flexi Cap",
      category_unavailable: false, insufficient_history: false, thin_category: false,
      scheme_return: "0.0503", category_avg_return: "0.08", category_rank: 8,
      category_size: 10, percentile: "20",
    }] }} />);
    expect(screen.getByText(/Trailing the category average by/)).toHaveTextContent("Trailing the category average by 2.97%");
    expect(screen.queryByText("-2.97%")).toBeNull();
    expect(container.querySelector(".lucide-trending-down")).not.toBeNull();
  });
});
