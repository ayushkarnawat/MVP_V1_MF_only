import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import { toneChipClass } from "../fundFormat";
import type { Fact, InsightsResponse, Tone } from "../types";
import { FactRow, ToneIcon } from "./FactRow";

const facts = () => fixture<InsightsResponse>("insights_full");
const fact = (over: Partial<Fact> = {}): Fact => ({ ...facts().key[0], ...over });

describe("ToneIcon (M4)", () => {
  it.each([
    ["pos", "trending-up"], ["warn", "triangle-alert"], ["neg", "circle-alert"], ["info", "info"], ["neu", "minus"],
  ] as const)("%s draws the %s icon in its own tint", (tone, icon) => {
    render(<ToneIcon tone={tone} />);
    const disc = screen.getByTestId("tone-icon");
    expect(disc).toHaveAttribute("data-tone", tone);
    expect(disc).toHaveAttribute("data-icon", icon);
    expect(disc).toHaveAttribute("aria-hidden", "true");
    expect(disc.className).toContain(toneChipClass(tone));
    expect(disc.querySelector("svg")).not.toBeNull();
  });

  it("an unknown tone is drawn as neutral", () => {
    render(<ToneIcon tone={"bogus" as Tone} />);
    expect(screen.getByTestId("tone-icon")).toHaveAttribute("data-tone", "neu");
    expect(screen.getByTestId("tone-icon")).toHaveAttribute("data-icon", "minus");
  });
});

describe("FactRow", () => {
  const mount = (f: Fact, onOpen = vi.fn()) => {
    render(<ul><FactRow fact={f} onOpen={onOpen} /></ul>);
    return onOpen;
  };

  it("is a list item holding a button row with the tone icon and the sentence", () => {
    mount(fact());
    const row = screen.getByTestId("fact-expense_ratio_vs_category");
    expect(row.closest("li")).not.toBeNull();
    expect(row).toHaveAttribute("role", "button");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute("aria-haspopup", "dialog");
    expect(row).toHaveAttribute("data-tone", "pos");
    expect(row).toHaveTextContent("Expense ratio is 0.62%, against a category average of 0.95%.");
    expect(within(row).getByTestId("tone-icon")).toHaveAttribute("data-icon", "trending-up");
    expect(within(row).queryByTestId("overlap-link")).toBeNull();
  });

  it("opens the fact on click, Enter and Space, and ignores any other key", () => {
    const f = fact();
    const onOpen = mount(f);
    const row = screen.getByTestId(`fact-${f.id}`);
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
    const spaceNotPrevented = fireEvent.keyDown(row, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(spaceNotPrevented).toBe(false);
    fireEvent.keyDown(row, { key: "a" });
    fireEvent.keyDown(row, { key: "Tab" });
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenLastCalledWith(f);
  });

  it("test_overlap_row_links_to_greyed_overlap_with_tooltip: the overlap fact still opens its evidence, and carries a greyed See Overlap link", () => {
    const overlap = facts().considerations[0];
    expect(overlap.id).toBe("overlap");
    const onOpen = mount(overlap);
    const row = screen.getByTestId("fact-overlap");
    const link = within(row).getByTestId("overlap-link");
    expect(link).toHaveTextContent("See Overlap");
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("title", "Coming soon");
    expect(link.className).toContain("cursor-not-allowed");
    expect(link.closest("a")).toBeNull();
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith(overlap);
  });
});
