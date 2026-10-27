import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("shows the caption, the value, the line and the note", () => {
    render(<StatTile tileKey="benchmark" caption="Nifty 50 return" value="−30.2%" tone="loss"
      line="Outperformed by 13.1 percentage points" lineTone="gain" note="Compared with an equity index." />);
    const tile = screen.getByRole("group", { name: "Nifty 50 return" });
    expect(tile).toHaveAttribute("data-testid", "tile-benchmark");
    expect(screen.getByText("Nifty 50 return")).toBeInTheDocument();
    expect(screen.getByTestId("tile-benchmark-value")).toHaveTextContent("−30.2%");
    expect(screen.getByTestId("tile-benchmark-line")).toHaveTextContent("Outperformed by 13.1 percentage points");
    expect(screen.getByTestId("tile-benchmark-note")).toHaveTextContent("Compared with an equity index.");
  });

  it("colours the value and the line by tone, with the text tokens", () => {
    render(<StatTile tileKey="a" caption="A" value="+1.0%" tone="gain" line="L" lineTone="loss" />);
    expect(screen.getByTestId("tile-a-value")).toHaveClass("text-[var(--pos-text)]");
    expect(screen.getByTestId("tile-a-value")).toHaveAttribute("data-tone", "gain");
    expect(screen.getByTestId("tile-a-line")).toHaveClass("text-[var(--neg-text)]");
  });

  it("uses the primary text colour for a neutral value and the muted colour for a neutral line", () => {
    render(<StatTile tileKey="b" caption="B" value="Based on ₹5,212" line="of your ₹5,212" />);
    expect(screen.getByTestId("tile-b-value")).toHaveClass("text-[var(--ui-text)]");
    expect(screen.getByTestId("tile-b-value")).toHaveAttribute("data-tone", "neutral");
    expect(screen.getByTestId("tile-b-line")).toHaveClass("text-[var(--ui-text-muted)]");
  });

  it("draws no line or note element when there is none", () => {
    render(<StatTile tileKey="c" caption="C" value="1" tone="neutral" line={null} note={null} />);
    expect(screen.queryByTestId("tile-c-line")).toBeNull();
    expect(screen.queryByTestId("tile-c-note")).toBeNull();
  });

  it("keeps long text inside the tile", () => {
    render(<StatTile tileKey="d" caption="D" value="Based on ₹12,34,56,789" line="x" />);
    expect(screen.getByTestId("tile-d")).toHaveClass("min-w-0");
    expect(screen.getByTestId("tile-d-value")).toHaveClass("break-words");
  });

  it("uses the card surface and the divider border", () => {
    render(<StatTile tileKey="e" caption="E" value="1" />);
    expect(screen.getByTestId("tile-e")).toHaveClass("rounded-xl", "border", "border-[var(--ui-divider)]", "bg-[var(--ui-card)]");
  });
});
