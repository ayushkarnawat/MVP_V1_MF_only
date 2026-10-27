import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NewsIconKey } from "../types";
import { NewsCategoryIcon } from "./NewsCategoryIcon";

// The fourteen icons the signed-off mockup approves, all from the app's icon set (lucide-react).
const ICONS: Record<NewsIconKey, string> = {
  banks_financials: "landmark",
  it_tech: "cpu",
  pharma_health: "pill",
  auto_ev: "car",
  consumer_fmcg: "shopping-basket",
  energy: "fuel",
  metals_mining: "pickaxe",
  realty_infra: "building-2",
  gold_silver: "coins",
  rates_rbi: "percent",
  funds_amc: "chart-pie",
  markets: "chart-candlestick",
  regulation: "scale",
  general: "newspaper",
};

describe("NewsCategoryIcon", () => {
  it.each(Object.entries(ICONS))("draws %s with the %s icon, decoratively", (key, name) => {
    render(<NewsCategoryIcon iconKey={key as NewsIconKey} />);
    const tile = screen.getByTestId("news-icon");
    expect(tile).toHaveAttribute("data-icon", name);
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile.querySelector("svg")).not.toBeNull();
  });

  it("uses a different icon for each of the fourteen keys", () => {
    expect(new Set(Object.values(ICONS)).size).toBe(14);
  });

  it("falls back to the newspaper icon for a key the front end does not know yet", () => {
    render(<NewsCategoryIcon iconKey={"cryptocurrency" as NewsIconKey} />);
    expect(screen.getByTestId("news-icon")).toHaveAttribute("data-icon", "newspaper");
  });
});
