import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { Fact, InsightsResponse } from "../types";
import { EvidenceDialog } from "./EvidenceDialog";

const facts = () => fixture<InsightsResponse>("insights_full");
const top5 = () => facts().key[1];

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
      ["Top 5", "30.0%"], ["Top 10", "46.0%"], ["As of", "2026-09-30"],
    ]);
    expect(within(dialog).getByTestId("evidence-text")).toHaveTextContent("Top 5 holdings make up 30% of the fund.");
    expect(dialog.querySelector("dl")).not.toBeNull();
  });

  it("a fact with no evidence still shows its sentence, and no empty list", () => {
    const bare: Fact = { ...top5(), evidence: [] };
    render(<EvidenceDialog fact={bare} onClose={vi.fn()} />);
    expect(screen.getByTestId("evidence-text")).toHaveTextContent("Top 5 holdings make up 30% of the fund.");
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
