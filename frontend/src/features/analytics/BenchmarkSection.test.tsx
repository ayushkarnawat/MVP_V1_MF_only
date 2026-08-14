import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BenchmarkSection } from "./BenchmarkSection";
import type { PortfolioBenchmarkSummary, FundVsBenchmarkSummary } from "./types";

const samplePortfolioBenchmark: PortfolioBenchmarkSummary = {
  portfolio_xirr: "16.45",
  benchmarks: [
    { index: "nifty_50", xirr: "12.30" },
    { index: "nifty_500", xirr: "14.10" },
    { index: "nifty_largemidcap_250", xirr: "15.00" },
    { index: "nifty_midcap_150", xirr: "17.20" },
  ],
};

const sampleFundBenchmark: FundVsBenchmarkSummary = {
  funds: [
    {
      scheme_id: "scheme-1",
      scheme_name: "HDFC Mid-Cap Opportunities Fund",
      benchmark_index: "nifty_midcap_150",
      fund_xirr: "19.50",
      benchmark_xirr: "17.20",
    },
    {
      scheme_id: "scheme-2",
      scheme_name: "Recent New Fund",
      benchmark_index: "nifty_50",
      fund_xirr: null,
      benchmark_xirr: "12.30",
    },
  ],
  overall_portfolio_xirr: "16.45",
  overall_broad_market_xirr: "14.10",
};

describe("BenchmarkSection", () => {
  it("renders portfolio broad market benchmark XIRR bars", () => {
    render(
      <BenchmarkSection
        portfolioBenchmark={samplePortfolioBenchmark}
        fundBenchmark={sampleFundBenchmark}
      />
    );

    expect(screen.getByText("Benchmark Comparison (XIRR)")).toBeInTheDocument();
    // "+16.45%" is shown twice by design: the hero stat and the portfolio bar row label.
    expect(screen.getAllByText("+16.45%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Nifty 50")).toBeInTheDocument();
    expect(screen.getByText("Nifty 500")).toBeInTheDocument();
    expect(screen.getByText("Nifty LargeMidcap 250")).toBeInTheDocument();
    expect(screen.getByText("Nifty Midcap 150")).toBeInTheDocument();
  });

  it("switches to Per-Fund vs Benchmark tab and handles null XIRR explicitly", () => {
    render(
      <BenchmarkSection
        portfolioBenchmark={samplePortfolioBenchmark}
        fundBenchmark={sampleFundBenchmark}
      />
    );

    const perFundBtn = screen.getByText("Per-Fund vs Benchmark");
    fireEvent.click(perFundBtn);

    expect(screen.getByText("HDFC Mid-Cap Opportunities Fund")).toBeInTheDocument();
    expect(screen.getByText("+2.30% vs Benchmark")).toBeInTheDocument();
    expect(screen.getByText("Recent New Fund")).toBeInTheDocument();
    expect(screen.getByText("Insufficient history for fund XIRR")).toBeInTheDocument();
  });
});
