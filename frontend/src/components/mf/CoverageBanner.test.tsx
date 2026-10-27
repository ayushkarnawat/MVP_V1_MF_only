import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageBanner } from "./CoverageBanner";
import { sampleStockHoldings } from "@/features/analytics/stockHoldingsTestData";

describe("CoverageBanner", () => {
  it("names separate coverage reasons, missing values and age tags", () => {
    render(<CoverageBanner coverage={{ ...sampleStockHoldings.coverage, covered_value_pct: "39.949",
      not_published_yet: [{ scheme_id: "d", scheme_name: "Unpublished Fund" }],
      not_available_from_amc: [{ scheme_id: "e", scheme_name: "Manual Fund" }],
      missing_value_schemes: [{ scheme_id: "f", scheme_name: "Unpriced Fund" }],
    }} excludedShare="-18" />);
    expect(screen.getByText("Based on 39.9% of your portfolio")).toBeInTheDocument();
    expect(screen.getByText(/Unpublished Fund.*not published yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Manual Fund.*not available from this AMC/i)).toBeInTheDocument();
    expect(screen.getByText(/Unpriced Fund.*value unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Fund B.*older than 60 days/)).toBeInTheDocument();
    expect(screen.getByText(/Fund C.*on its half-yearly cycle/)).toBeInTheDocument();
    expect(screen.getByText(/Derivative and other.*-18.00%/)).toBeInTheDocument();
  });

  it("shows full coverage without inventing missing funds", () => {
    render(<CoverageBanner coverage={{ ...sampleStockHoldings.coverage, funds: [] }} excludedShare="0" />);
    expect(screen.getByText("Based on 100.0% of your portfolio")).toBeInTheDocument();
    expect(screen.queryByText(/not published yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not available from this AMC/i)).not.toBeInTheDocument();
  });
});
