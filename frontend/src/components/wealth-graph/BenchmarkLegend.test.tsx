import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { benchmarkColor } from "./benchmarkColors";
import { BenchmarkLegend, type BenchmarkLegendItem } from "./BenchmarkLegend";

const ITEMS: BenchmarkLegendItem[] = [
  { id: "nifty_50", label: "Nifty 50", color: benchmarkColor("nifty_50") },
  { id: "nifty_500", label: "Nifty 500", color: benchmarkColor("nifty_500") },
  {
    id: "nifty_largemidcap_250",
    label: "Nifty LargeMidcap 250",
    color: benchmarkColor("nifty_largemidcap_250"),
  },
];

beforeEach(() => {
  localStorage.clear();
});

describe("BenchmarkLegend", () => {
  it("one chip per benchmark in its colour", () => {
    const { container } = render(
      <BenchmarkLegend items={ITEMS} hidden={new Set()} onToggle={vi.fn()} />,
    );

    for (const item of ITEMS) {
      const chip = screen.getByTestId(`legend-chip-${item.id}`);
      expect(chip.tagName).toBe("BUTTON");
      expect(chip).toHaveAttribute("type", "button");
      expect(chip).toHaveAttribute("aria-pressed", "true");
      expect(chip).toHaveTextContent(item.label);

      const swatch = screen.getByTestId(`legend-swatch-${item.id}`);
      expect(chip).toContainElement(swatch);
      expect(swatch).toHaveStyle({ backgroundColor: benchmarkColor(item.id) });
    }

    expect(container.innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it("clicking a chip calls onToggle with its id", () => {
    const onToggle = vi.fn();
    render(<BenchmarkLegend items={ITEMS} hidden={new Set()} onToggle={onToggle} />);

    fireEvent.click(screen.getByTestId("legend-chip-nifty_500"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("nifty_500");

    fireEvent.click(screen.getByTestId("legend-chip-nifty_largemidcap_250"));
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenLastCalledWith("nifty_largemidcap_250");

    expect(localStorage.length).toBe(0);
  });

  it("a hidden chip has aria-pressed false and keeps its name", () => {
    render(
      <BenchmarkLegend items={ITEMS} hidden={new Set(["nifty_500"])} onToggle={vi.fn()} />,
    );

    const hiddenChip = screen.getByTestId("legend-chip-nifty_500");
    const visibleChip = screen.getByTestId("legend-chip-nifty_50");

    expect(hiddenChip).toHaveAttribute("aria-pressed", "false");
    expect(hiddenChip).toHaveTextContent("Nifty 500");
    expect(screen.getByTestId("legend-swatch-nifty_500")).toHaveStyle({
      backgroundColor: benchmarkColor("nifty_500"),
    });
    expect(hiddenChip.className).not.toBe(visibleChip.className);
    expect(visibleChip).toHaveAttribute("aria-pressed", "true");
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(
      <BenchmarkLegend items={[]} hidden={new Set()} onToggle={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("works with the keyboard (Tab, Space, Enter)", () => {
    const onToggle = vi.fn();
    render(<BenchmarkLegend items={ITEMS} hidden={new Set()} onToggle={onToggle} />);

    const chips = ITEMS.map(item => screen.getByTestId(`legend-chip-${item.id}`));

    for (const chip of chips) {
      expect(chip.tagName).toBe("BUTTON");
      expect(chip).toHaveAttribute("type", "button");
      expect(chip).toBeEnabled();
      expect(chip.tabIndex).toBe(0);
      expect(chip.className).toContain("focus-visible:outline-[var(--ui-focus)]");
    }

    chips[0].focus();
    expect(chips[0]).toHaveFocus();
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    chips[0].dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);

    chips[1].focus();
    expect(chips[1]).toHaveFocus();
    const spaceEvent = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    chips[1].dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(false);
    fireEvent.click(chips[1]);
    expect(onToggle).toHaveBeenCalledWith("nifty_500");

    chips[2].focus();
    expect(chips[2]).toHaveFocus();
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    chips[2].dispatchEvent(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(false);
    fireEvent.click(chips[2]);
    expect(onToggle).toHaveBeenCalledWith("nifty_largemidcap_250");
  });
});
