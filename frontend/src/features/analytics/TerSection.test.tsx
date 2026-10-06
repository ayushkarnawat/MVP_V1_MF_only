import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TerSection } from "./TerSection";
import type { WeightedTerSummary } from "./types";

const summary = (weighted_ter: string | null): WeightedTerSummary => ({
  weighted_ter, covered_value: "1000", total_value: "1000", reference_period: "2026-09-01", uncovered_schemes: [],
});

describe("TerSection (#17)", () => {
  it("never claims a Direct saving from the two averages", () => {
    // The Direct and Regular groups hold different funds, so their gap isn't
    // a saving; per-fund savings live in Distributor Comparison (decided 6 Oct).
    render(<TerSection ter={summary("0.80")} comparison={{ direct: summary("0.60"), regular: summary("1.45") }} />);
    expect(screen.queryByText(/Save ~/)).not.toBeInTheDocument();
    expect(screen.getByText("Direct Plans TER")).toBeInTheDocument();
  });

  it("shows a dash, not ₹0, when there is no comparison", () => {
    render(<TerSection ter={null} comparison={null} />);
    expect(screen.getAllByText("— / —").length).toBeGreaterThan(0);
  });
});
