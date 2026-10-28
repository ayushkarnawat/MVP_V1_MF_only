import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ComparisonTabs } from "./ComparisonTabs";
import type { ComparisonTabId } from "./overlapLogic";

const LABELS = ["Overview", "Common Holdings", "Unique Holdings", "Sector Comparison", "Market Cap Comparison", "Performance Comparison"];

function Harness({ renderPanel, onSelect }: { renderPanel: (tab: ComparisonTabId) => string; onSelect?: (tab: ComparisonTabId) => void }) {
  const [selected, setSelected] = useState<ComparisonTabId>("overview");
  return <ComparisonTabs selected={selected} onSelect={tab => { onSelect?.(tab); setSelected(tab); }} renderPanel={tab => <p>{renderPanel(tab)}</p>} />;
}
const tabs = () => within(screen.getByRole("tablist", { name: "Comparison views" })).getAllByRole("tab");

describe("ComparisonTabs", () => {
  it("test_six_comparison_subtabs_with_persistent_selection: six real tabs in order, the first selected, one panel per tab", () => {
    render(<Harness renderPanel={tab => `panel ${tab}`} />);
    expect(tabs().map(tab => tab.textContent)).toEqual(LABELS);
    expect(tabs().map(tab => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false", "false", "false"]);
    expect(tabs().map(tab => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1", "-1"]);
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(6);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel", { name: "Overview" })).toHaveTextContent("panel overview");
  });

  it("clicking a tab selects it and keeps it selected, and shows only its panel", () => {
    render(<Harness renderPanel={tab => `panel ${tab}`} />);
    fireEvent.click(tabs()[3]);
    expect(tabs()[3]).toHaveAttribute("aria-selected", "true");
    expect(tabs()[0]).toHaveAttribute("aria-selected", "false");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel", { name: "Sector Comparison" })).toHaveTextContent("panel sector");
    fireEvent.click(tabs()[3]);
    expect(tabs()[3]).toHaveAttribute("aria-selected", "true");
  });

  it("every tab points at a panel that exists, and every panel is labelled by its tab", () => {
    render(<Harness renderPanel={tab => tab} />);
    for (const tab of tabs()) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute("role", "tabpanel");
      expect(panel).toHaveAttribute("aria-labelledby", tab.id);
    }
  });

  it("only the selected panel is rendered: renderPanel is never called for the other five (nothing loads before it is opened)", () => {
    const renderPanel = vi.fn((tab: ComparisonTabId) => tab);
    render(<Harness renderPanel={renderPanel} />);
    expect(renderPanel.mock.calls.map(call => call[0])).toEqual(["overview"]);
    fireEvent.click(tabs()[5]);
    expect(renderPanel.mock.calls.map(call => call[0]).at(-1)).toBe("performance");
    expect(renderPanel.mock.calls.map(call => call[0])).not.toContain("sector");
  });

  it("arrow keys move and select (wrapping), Home and End jump, and focus follows", () => {
    const onSelect = vi.fn();
    render(<Harness renderPanel={tab => tab} onSelect={onSelect} />);
    tabs()[0].focus();
    fireEvent.keyDown(tabs()[0], { key: "ArrowRight" });
    expect(tabs()[1]).toHaveFocus();
    expect(tabs()[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs()[1], { key: "ArrowLeft" });
    fireEvent.keyDown(tabs()[0], { key: "ArrowLeft" });
    expect(tabs()[5]).toHaveFocus();
    expect(tabs()[5]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs()[5], { key: "ArrowRight" });
    expect(tabs()[0]).toHaveFocus();
    fireEvent.keyDown(tabs()[0], { key: "End" });
    expect(tabs()[5]).toHaveFocus();
    fireEvent.keyDown(tabs()[5], { key: "Home" });
    expect(tabs()[0]).toHaveFocus();
    expect(onSelect.mock.calls.map(call => call[0])).toEqual(["common", "overview", "performance", "overview", "performance", "overview"]);
    const prevented = fireEvent.keyDown(tabs()[0], { key: "ArrowRight" });
    expect(prevented).toBe(false);
    fireEvent.keyDown(tabs()[1], { key: "a" });
    expect(onSelect).toHaveBeenCalledTimes(7);
  });

  it("is a controlled component: it shows the selection it is given", () => {
    render(<ComparisonTabs selected="market_cap" onSelect={() => {}} renderPanel={tab => <p>{tab}</p>} />);
    expect(tabs()[4]).toHaveAttribute("aria-selected", "true");
    expect(tabs()[4]).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tabpanel", { name: "Market Cap Comparison" })).toHaveTextContent("market_cap");
  });
});
