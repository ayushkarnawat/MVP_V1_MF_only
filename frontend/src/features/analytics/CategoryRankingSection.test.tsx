import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryRankingSection } from "./CategoryRankingSection";

describe("CategoryRankingSection", () => {
  it("displays raw fraction returns and their difference as percentages", () => {
    render(
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
  });
});
