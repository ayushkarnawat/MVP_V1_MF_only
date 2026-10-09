// frontend/src/features/analytics/FundRankingSection.test.tsx
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundRankingSection } from "./FundRankingSection";
import type { FundRankingSummary } from "./types";

const summary: FundRankingSummary = {
  funds: [
    {
      scheme_id: "s8", scheme_name: "HDFC Flexi Cap Fund", category_name: "Flexi Cap",
      category_unavailable: false, insufficient_history: false, thin_category: false, too_few_peers: false,
      composite_score: "81.40", category_rank: 8, category_size: 62, category_universe_size: 70, percentile: "87.10",
      return_1y: "0.15", ranked_as: null,
      neighbors: [
        { scheme_id: "s6", scheme_name: "Parag Parikh Flexi Cap", category_rank: 6, composite_score: "83.90" },
        { scheme_id: "s7", scheme_name: "Quant Flexi Cap", category_rank: 7, composite_score: "82.70" },
        { scheme_id: "s9", scheme_name: "JM Flexi Cap", category_rank: 9, composite_score: "79.80" },
        { scheme_id: "s10", scheme_name: "Franklin Flexi Cap", category_rank: 10, composite_score: "78.10" },
      ],
      components: {
        return_3y: { percentile: "92", raw: "0.241" },
        return_5y: { percentile: "88", raw: "0.198" },
        category_relative: { percentile: "70", raw: "0.02" },
        low_volatility: { percentile: "60", raw: "0.08" },
        low_ter: { percentile: null, raw: null },
      },
    },
    {
      scheme_id: "sT", scheme_name: "Alpha Contra Fund", category_name: "Equity Scheme - Contra Fund",
      category_unavailable: false, insufficient_history: false, thin_category: true, too_few_peers: false,
      composite_score: "64.00", category_rank: 2, category_size: 3, category_universe_size: 5, percentile: "33.33",
      return_1y: null, ranked_as: null, neighbors: [],
      components: { return_3y: { percentile: "33", raw: "0.18" }, return_5y: { percentile: null, raw: null }, category_relative: { percentile: null, raw: null }, low_volatility: { percentile: null, raw: null }, low_ter: { percentile: "66", raw: "0.75" } },
    },
    {
      scheme_id: "sF", scheme_name: "Lone Duration Fund", category_name: "Debt Scheme - Long Duration Fund",
      category_unavailable: false, insufficient_history: false, thin_category: true, too_few_peers: true,
      composite_score: null, category_rank: null, category_size: 1, category_universe_size: 1, percentile: null,
      return_1y: null, ranked_as: null, neighbors: [],
      components: { return_3y: { percentile: null, raw: "0.071" }, return_5y: { percentile: null, raw: null }, category_relative: { percentile: null, raw: null }, low_volatility: { percentile: null, raw: null }, low_ter: { percentile: null, raw: "0.62" } },
    },
    {
      scheme_id: "sN", scheme_name: "New Fund", category_name: "Flexi Cap", category_unavailable: false,
      insufficient_history: true, thin_category: false, composite_score: null, category_rank: null,
      category_size: 0, category_universe_size: 70, percentile: null, return_1y: null,
      too_few_peers: false, ranked_as: null, neighbors: [],
      components: { return_3y: { percentile: null, raw: null }, return_5y: { percentile: null, raw: null }, category_relative: { percentile: null, raw: null }, low_volatility: { percentile: null, raw: null }, low_ter: { percentile: null, raw: null } },
    },
  ],
};

describe("FundRankingSection", () => {
  it("renders the leaderboard with (you) tagged and all 4 neighbors in rank order", () => {
    render(<FundRankingSection data={summary} isLoading={false} />);
    expect(screen.getAllByText(/HDFC Flexi Cap Fund/)).toHaveLength(2);
    expect(screen.getByText("#8 HDFC Flexi Cap Fund (you)")).toBeInTheDocument();
    expect(screen.getByText(/Parag Parikh Flexi Cap/)).toBeInTheDocument();
    expect(screen.getByText(/Franklin Flexi Cap/)).toBeInTheDocument();
    expect(screen.getByText("#8 of 62 ranked · 70 in category · Top 13%")).toBeInTheDocument();
  });

  it("a thin category reads as plain words with both counts and no percentile (D1)", () => {
    render(<FundRankingSection data={summary} isLoading={false} />);
    expect(screen.getByText("2nd of 3 ranked Contra funds · 5 in category")).toBeInTheDocument();
    expect(screen.getByText(/Only 3 Contra funds have a 3-year record/)).toBeInTheDocument();
    expect(screen.getByText("Thin Category (3 peers)")).toBeInTheDocument();
  });

  it("fewer than 3 ranked funds shows no rank, only the fund's own numbers (D2)", () => {
    render(<FundRankingSection data={summary} isLoading={false} />);
    expect(screen.getByText("Not enough peers")).toBeInTheDocument();
    expect(screen.getByText(/1 fund in this category has a 3-year record \(1 in category\)/)).toBeInTheDocument();
    expect(screen.getByText("3Y return 7.10% · Expense ratio 0.62%")).toBeInTheDocument();
  });

  it("shows the Insufficient History badge and hides the leaderboard for an unranked fund", () => {
    render(<FundRankingSection data={summary} isLoading={false} />);
    expect(screen.getByText("Insufficient History")).toBeInTheDocument();
  });

  it("tap-through reveals the 5-factor breakdown with a dash for a missing component", () => {
    render(<FundRankingSection data={summary} isLoading={false} />);
    fireEvent.click(screen.getByRole("button", { name: /HDFC Flexi Cap Fund/ }));
    expect(screen.getByText(/92nd/)).toBeInTheDocument();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows TER as a percent as stored, returns as fractions converted", () => {
    render(<FundRankingSection data={summary} isLoading={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Alpha Contra Fund/ }));
    expect(screen.getByText(/· 0\.75%/)).toBeInTheDocument();
    expect(screen.getByText(/· 18\.00%/)).toBeInTheDocument();
  });
});


describe("Fund Ranking edge states", () => {
  it("shows the empty state for missing data and hides it while loading", () => {
    const { rerender } = render(<FundRankingSection data={null} />);
    expect(screen.getByText("No fund ranking data available")).toBeInTheDocument();
    rerender(<FundRankingSection data={null} isLoading />);
    expect(screen.queryByText("No fund ranking data available")).not.toBeInTheDocument();
  });

  it("shows Category Unavailable without a rank or neighbors", () => {
    const fund = { ...summary.funds[0], category_unavailable: true };
    render(<FundRankingSection data={{ funds: [fund] }} />);
    expect(screen.getByText("Category Unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/\(you\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Parag Parikh/)).not.toBeInTheDocument();
  });

  it("keeps missing 5Y and TER as dashes and exposes expanded state", () => {
    const fund = { ...summary.funds[0], components: { ...summary.funds[0].components, return_5y: { percentile: null, raw: null } } };
    render(<FundRankingSection data={{ funds: [fund] }} />);
    const button = screen.getByRole("button", { name: /HDFC Flexi Cap Fund/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    for (const label of ["5Y return (25%)", "Low TER (15%)"]) {
      expect(within(screen.getByText(label).parentElement!).getByText("—")).toBeInTheDocument();
    }
    fireEvent.click(button);
    expect(screen.queryByText("5Y return (25%)")).not.toBeInTheDocument();
  });

  it("uses ranked counts for thin copy and omits Top percentile", () => {
    render(<FundRankingSection data={{ funds: [summary.funds[1]] }} />);
    expect(screen.getByText("2nd of 3 ranked Contra funds · 5 in category")).toBeInTheDocument();
    expect(screen.queryByText(/Top \d+%/)).not.toBeInTheDocument();
  });

  it.each([1, 10])("renders supplied neighbors at boundary rank %s without wrapping", (rank) => {
    const neighbors = rank === 1 ? summary.funds[0].neighbors.slice(0, 2).map((n, i) => ({ ...n, category_rank: i + 2 })) : summary.funds[0].neighbors.slice(0, 2).map((n, i) => ({ ...n, category_rank: i + 8 }));
    render(<FundRankingSection data={{ funds: [{ ...summary.funds[0], category_rank: rank, neighbors }] }} />);
    expect(screen.getByText(`#${rank} HDFC Flexi Cap Fund (you)`)).toBeInTheDocument();
    for (const n of neighbors) expect(screen.getByText(`#${n.category_rank} ${n.scheme_name}`)).toBeInTheDocument();
    expect(screen.getByText("81.40")).toBeInTheDocument();
  });

  it("leaves out the Top % rather than showing Top 100% when no percentile is sent", () => {
    const fund = { ...summary.funds[0], percentile: null };
    render(<FundRankingSection data={{ funds: [fund] }} isLoading={false} />);
    expect(screen.getByText("#8 of 62 ranked · 70 in category")).toBeInTheDocument();
  });
});
