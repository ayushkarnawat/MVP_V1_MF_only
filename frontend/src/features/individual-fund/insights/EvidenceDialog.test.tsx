import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { Fact, InsightsResponse } from "../types";
import { EvidenceDialog } from "./EvidenceDialog";

const facts = () => fixture<InsightsResponse>("insights_full");
// The market-cap fact has the most evidence in the golden: three rows (Large, Mid and Small, 33.3333% each).
const top5 = () => facts().strengths.find(fact => fact.id === "market_cap_spread")!;
const SENTENCE = "Market-cap shares are Large 33.3333%, Mid 33.3333%, and Small 33.3333%.";

describe("EvidenceDialog", () => {
  it("renders nothing without a fact", () => {
    const { container } = render(<EvidenceDialog fact={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is a dialog titled Evidence, with one label and value row per evidence item and the sentence under them", () => {
    render(<EvidenceDialog fact={top5()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Evidence" });
    const rows = within(dialog).getAllByTestId("evidence-row");
    expect(rows.map(row => [within(row).getByRole("term").textContent, within(row).getByRole("definition").textContent])).toEqual([
      ["Large", "33.3333%"], ["Mid", "33.3333%"], ["Small", "33.3333%"],
    ]);
    expect(within(dialog).getByTestId("evidence-text")).toHaveTextContent(SENTENCE);
    expect(dialog.querySelector("dl")).not.toBeNull();
  });

  it("a fact with no evidence still shows its sentence, and no empty list", () => {
    const bare: Fact = { ...top5(), evidence: [] };
    render(<EvidenceDialog fact={bare} onClose={vi.fn()} />);
    expect(screen.getByTestId("evidence-text")).toHaveTextContent(SENTENCE);
    expect(screen.queryAllByTestId("evidence-row")).toHaveLength(0);
    expect(document.querySelector("dl")).toBeNull();
  });

  it("closes with the Close button and with Escape", () => {
    const onClose = vi.fn();
    render(<EvidenceDialog fact={top5()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
