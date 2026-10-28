import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sumDecimalStrings } from "@/lib/decimal";
import { fixture } from "../fixtures";
import type { OverlapResponse } from "../types";
import { DistributionBar } from "./DistributionBar";

const distribution = () => fixture<OverlapResponse>("overlap_fund").distribution;
const group = () => screen.getByRole("group", { name: "Overlap distribution" });
const row = (key: string) => screen.getByTestId(`distribution-row-${key}`);
const segment = (key: string) => screen.getByTestId(`distribution-segment-${key}`);

describe("DistributionBar", () => {
  it("test_distribution_segments_sum_to_100: three segments with the backend's strings, summing to exactly 100", () => {
    render(<DistributionBar distribution={distribution()} />);
    const keys = ["unique_to_fund", "common", "unique_to_others"];
    const pcts = keys.map(key => segment(key).getAttribute("data-pct")!);
    expect(pcts).toEqual(["75.0000", "25.0000", "0.0000"]);
    expect(sumDecimalStrings(pcts)).toBe("100.0000");
    expect(keys.map(key => segment(key).style.width)).toEqual(["75%", "25%", "0%"]);
    expect(keys.map(key => segment(key).getAttribute("title"))).toEqual([
      "Unique to this fund: 9 stocks, 75.0%",
      "Common to your other funds: 3 stocks, 25.0%",
      "Unique to your other funds: 0 stocks, 0.0%",
    ]);
  });

  it("lists the three rows with their label, count and share", () => {
    render(<DistributionBar distribution={distribution()} />);
    expect(within(group()).getAllByRole("button").map(button => button.textContent)).toEqual([
      "Unique to this fund9 stocks · 75.0%", "Common to your other funds3 stocks · 25.0%", "Unique to your other funds0 stocks · 0.0%",
    ]);
    expect(within(group()).getAllByRole("button").map(button => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
    expect(screen.getByTestId("distribution-selected")).toHaveTextContent("");
  });

  it("a click on a row selects it persistently, dims the others and says what it is; a second click clears it", () => {
    render(<DistributionBar distribution={distribution()} />);
    fireEvent.click(row("common"));
    expect(row("common")).toHaveAttribute("aria-pressed", "true");
    expect(row("unique_to_fund")).toHaveAttribute("aria-pressed", "false");
    expect(segment("common")).toHaveAttribute("data-selected", "true");
    expect(segment("common")).toHaveAttribute("data-dimmed", "false");
    expect(segment("unique_to_fund")).toHaveAttribute("data-dimmed", "true");
    expect(segment("unique_to_others")).toHaveAttribute("data-dimmed", "true");
    expect(screen.getByTestId("distribution-selected")).toHaveTextContent("Common to your other funds: 3 stocks, 25.0% of the stocks across all your funds.");
    expect(screen.getByTestId("distribution-selected")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(row("unique_to_fund"));
    expect(row("unique_to_fund")).toHaveAttribute("aria-pressed", "true");
    expect(row("common")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(row("unique_to_fund"));
    expect(row("unique_to_fund")).toHaveAttribute("aria-pressed", "false");
    expect(segment("common")).toHaveAttribute("data-dimmed", "false");
    expect(screen.getByTestId("distribution-selected")).toHaveTextContent("");
  });

  it("a click on a bar segment selects the same state as its row", () => {
    render(<DistributionBar distribution={distribution()} />);
    fireEvent.click(segment("unique_to_fund"));
    expect(row("unique_to_fund")).toHaveAttribute("aria-pressed", "true");
    expect(segment("unique_to_fund")).toHaveAttribute("data-selected", "true");
    expect(segment("common")).toHaveAttribute("data-dimmed", "true");
  });

  it("the bar itself is hidden from assistive technology (the rows say everything) and zero counts read as 0 stocks", () => {
    render(<DistributionBar distribution={{ ...distribution(), unique_to_fund_count: 1, unique_to_fund_pct: "100.0000", common_count: 0, common_pct: "0.0000" }} />);
    expect(segment("common").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(["unique_to_fund", "common", "unique_to_others"].map(key => segment(key).style.width)).toEqual(["100%", "0%", "0%"]);
    expect(row("unique_to_fund")).toHaveTextContent("1 stock · 100.0%");
    expect(row("common")).toHaveTextContent("0 stocks · 0.0%");
  });
});
