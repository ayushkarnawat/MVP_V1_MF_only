import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { freezeResult, standardResult } from "../testData";
import { AssetClassChart } from "./AssetClassChart";

const names = () => within(screen.getByRole("region", { name: "Impact by asset class" })).getAllByRole("listitem")
  .map(row => row.getAttribute("aria-label"));

describe("AssetClassChart", () => {
  it("renders nothing when there are no rows", () => {
    const { container } = render(<AssetClassChart rows={[]} coveredValue="100" totalValue="100" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is titled and keeps the groups in the order given", () => {
    const { by_asset_class, covered_value, total_value } = standardResult();
    render(<AssetClassChart rows={by_asset_class} coveredValue={covered_value} totalValue={total_value} />);
    expect(screen.getByRole("heading", { level: 3, name: "Impact by asset class" })).toBeInTheDocument();
    expect(names()).toEqual([
      "Equity, −₹757, −34.4%", "Debt, +₹20, +1.0%", "Gold and Silver, +₹81, +8.0%",
    ]);
  });

  it("prints the rupee impact with the percent beside it", () => {
    const { by_asset_class } = standardResult();
    render(<AssetClassChart rows={by_asset_class} coveredValue="5212.00" totalValue="5212.00" />);
    expect(screen.getByTestId("bar-text-equity")).toHaveTextContent("−₹757 −34.4%");
    expect(screen.getByTestId("bar-text-gold-and-silver")).toHaveTextContent("+₹81 +8.0%");
  });

  it("draws the bars in rupees from a shared zero line, in the sign's tone", () => {
    const { by_asset_class } = standardResult();
    render(<AssetClassChart rows={by_asset_class} coveredValue="5212.00" totalValue="5212.00" />);
    expect(screen.getByTestId("bar-zero-equity").style.left).toBe("90.35%");
    expect(screen.getByTestId("bar-fill-equity")).toHaveAttribute("data-side", "left");
    expect(screen.getByTestId("bar-fill-equity").style.width).toBe("90.35%");
    expect(screen.getByTestId("bar-fill-equity")).toHaveAttribute("data-tone", "loss");
    expect(screen.getByTestId("bar-fill-gold-and-silver")).toHaveAttribute("data-side", "right");
    expect(screen.getByTestId("bar-fill-gold-and-silver")).toHaveAttribute("data-tone", "gain");
  });

  it("says what it covers, in Indian grouping, and that funds with no data are left out", () => {
    const { by_asset_class } = freezeResult();
    render(<AssetClassChart rows={by_asset_class} coveredValue="3210.00" totalValue="5212.00" />);
    expect(screen.getByText("Covers ₹3,210 of ₹5,212. Funds with no data are left out.")).toBeInTheDocument();
    expect(names()).toEqual(["Equity, −₹200, −9.1%", "Gold and Silver, +₹20, +2.0%"]);
  });

  it("leaves the caption out when the coverage is unknown", () => {
    render(<AssetClassChart rows={standardResult().by_asset_class} coveredValue={null} totalValue={null} />);
    expect(screen.queryByText(/Covers/)).toBeNull();
    expect(names()).toHaveLength(3);
  });

  it("leaves the percent out of a group that has none", () => {
    render(<AssetClassChart rows={[{ bucket: "Other", rupee_impact: "-100.00", covered_value: "0.00", pct: null }]} coveredValue="0" totalValue="0" />);
    expect(names()).toEqual(["Other, −₹100"]);
    expect(screen.getByTestId("bar-text-other")).toHaveTextContent("−₹100");
    expect(screen.getByTestId("bar-text-other").textContent).not.toMatch(/null|NaN/);
  });

  it("does not offer a tooltip (L40)", () => {
    render(<AssetClassChart rows={standardResult().by_asset_class} coveredValue="1" totalValue="1" />);
    expect(document.querySelector("[title]")).toBeNull();
  });
});
