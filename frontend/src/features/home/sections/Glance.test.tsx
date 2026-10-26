import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { MoversResponse, SummaryResponse } from "../types";
import { Glance } from "./Glance";

const summary = () => fixture<SummaryResponse>("summary_family");
const movers = () => fixture<MoversResponse>("movers_sector");

describe("Glance", () => {
  it("shows a loading placeholder", () => {
    render(<Glance status="loading" summary={null} movers={null} onOpen={() => {}} />);
    expect(screen.getByRole("status", { name: "Loading summary" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing on an error, without a summary, or with no holdings (it never shows a sentence that could disagree with the headline)", () => {
    for (const props of [
      { status: "error" as const, summary: null, movers: null },
      { status: "data" as const, summary: null, movers: null },
      { status: "data" as const, summary: fixture<SummaryResponse>("summary_empty"), movers: null },
    ]) {
      const { container, unmount } = render(<Glance {...props} onOpen={() => {}} />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });

  it("shows the title, the link text, the sentence and the small print in one clickable card", () => {
    render(<Glance status="data" summary={summary()} movers={movers()} onOpen={() => {}} />);
    const card = screen.getByRole("button", { name: /Your money, at a glance/ });
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(card.textContent).toContain("Understand today's change");
    expect(card.textContent).toContain("Your portfolio gained ₹12 today, with banks contributing the most.");
    expect(card.textContent).toContain("Based on available investment data");
  });

  it("works without movers (the sentence loses its clause)", () => {
    render(<Glance status="data" summary={summary()} movers={null} onOpen={() => {}} />);
    expect(screen.getByRole("button").textContent).toContain("Your portfolio gained ₹12 today.");
  });

  it("opens on click, on Enter and on Space, and prevents the page from scrolling on Space", () => {
    const onOpen = vi.fn();
    render(<Glance status="data" summary={summary()} movers={movers()} onOpen={onOpen} />);
    const card = screen.getByRole("button");
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    card.dispatchEvent(space);
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(space.defaultPrevented).toBe(true);
    fireEvent.keyDown(card, { key: "a" });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it("uses the shared click-card styling and palette variables only", () => {
    const { container } = render(<Glance status="data" summary={summary()} movers={movers()} onOpen={() => {}} />);
    expect(container.innerHTML).toContain("cursor-pointer");
    expect(container.innerHTML).toContain("var(--ui-divider)");
    expect(container.innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});
