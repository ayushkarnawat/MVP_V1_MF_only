import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fixture } from "../fixtures";
import type { OverlapResponse, OverlapSector } from "../types";
import { SectorOverlap } from "./SectorOverlap";

const sectors = () => fixture<OverlapResponse>("overlap_fund").by_sector;
const button = (sector: string) => screen.getByTestId(`sector-row-${sector}`);

// The golden has one stock per sector, so two sectors get a second stock by hand.
function richSectors(): OverlapSector[] {
  const base = sectors();
  base[0].stocks.push({ isin: "INEGOLD00099", name: "Golden Stock 99", weight: "1.5000" });
  return base;
}

describe("SectorOverlap", () => {
  it("lists every sector with its share, in the API order, collapsed", () => {
    render(<SectorOverlap sectors={sectors()} />);
    const list = screen.getByRole("list", { name: "Common holdings by sector" });
    expect(within(list).getAllByRole("button").map(b => b.textContent)).toEqual(["Industrials7.0%", "IT6.0%", "Financial Services5.0%"]);
    for (const b of within(list).getAllByRole("button")) {
      expect(b).toHaveAttribute("aria-expanded", "false");
      expect(b).toHaveAttribute("aria-controls");
    }
    expect(screen.queryByText("Golden Stock 3")).toBeNull();
  });

  it("bars are as wide as the sector's share of the widest sector", () => {
    render(<SectorOverlap sectors={sectors()} />);
    expect(screen.getByTestId("sector-bar-Industrials").style.width).toBe("100%");
    expect(screen.getByTestId("sector-bar-IT").style.width).toBe("85.71%");
    expect(screen.getByTestId("sector-bar-Financial Services").style.width).toBe("71.43%");
  });

  it("test_sector_row_expands_in_place_one_at_a_time: opening a sector shows its stocks, opening another closes the first", () => {
    render(<SectorOverlap sectors={richSectors()} />);
    fireEvent.click(button("Industrials"));
    expect(button("Industrials")).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region", { name: "Industrials stocks" });
    expect(region).not.toHaveAttribute("hidden");
    expect(button("Industrials")).toHaveAttribute("aria-controls", region.id);
    expect(within(region).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Golden Stock 37.0%", "Golden Stock 991.5%"]);
    fireEvent.click(button("IT"));
    expect(button("IT")).toHaveAttribute("aria-expanded", "true");
    expect(button("Industrials")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Golden Stock 3")).toBeNull();
    expect(within(screen.getByRole("region", { name: "IT stocks" })).getByText("Golden Stock 2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
  });

  it("a second click closes the open sector", () => {
    render(<SectorOverlap sectors={sectors()} />);
    fireEvent.click(button("IT"));
    fireEvent.click(button("IT"));
    expect(button("IT")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Golden Stock 2")).toBeNull();
  });

  it("an empty list says so", () => {
    render(<SectorOverlap sectors={[]} />);
    expect(screen.getByTestId("sector-empty")).toHaveTextContent("No common stocks to group by sector.");
    expect(screen.queryByRole("list")).toBeNull();
  });
});
