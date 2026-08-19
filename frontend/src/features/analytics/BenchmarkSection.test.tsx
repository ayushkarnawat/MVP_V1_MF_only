import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BenchmarkSection } from "./BenchmarkSection";
import type { PortfolioBenchmarkSummary, FundVsBenchmarkSummary } from "./types";

// Backend XIRR values are raw decimal fractions (e.g. "0.1645" for 16.45%,
// see backend/app/services/analytics/xirr.py's xirr() / benchmark.py's
// str(rate) serialization) — these fixtures use that real shape, not
// already-scaled percentages.
const samplePortfolioBenchmark: PortfolioBenchmarkSummary = {
  portfolio_xirr: "0.1645",
  benchmarks: [
    { index: "nifty_50", xirr: "0.1230" },
    { index: "nifty_500", xirr: "0.1410" },
    { index: "nifty_largemidcap_250", xirr: "0.1500" },
    { index: "nifty_midcap_150", xirr: "0.1720" },
  ],
};

const sampleFundBenchmark: FundVsBenchmarkSummary = {
  funds: [
    {
      scheme_id: "scheme-1",
      scheme_name: "HDFC Mid-Cap Opportunities Fund",
      benchmark_index: "nifty_midcap_150",
      fund_xirr: "0.1950",
      benchmark_xirr: "0.1720",
    },
    {
      scheme_id: "scheme-2",
      scheme_name: "Recent New Fund",
      benchmark_index: "nifty_50",
      fund_xirr: null,
      benchmark_xirr: "0.1230",
    },
  ],
  overall_portfolio_xirr: "0.1645",
  overall_broad_market_xirr: "0.1410",
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
    expect(screen.getByText("Nifty 50 (Price Return)")).toBeInTheDocument();
    expect(screen.getByText("Nifty 500 (Price Return)")).toBeInTheDocument();
    expect(screen.getByText("Nifty LargeMidcap 250 (Price Return)")).toBeInTheDocument();
    expect(screen.getByText("Nifty Midcap 150 (Price Return)")).toBeInTheDocument();
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
