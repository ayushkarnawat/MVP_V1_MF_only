import { describe, expect, it } from "vitest";
import { CLICK_CARD, CLICK_FIGURE, CLICK_ROW, DISABLED } from "./clickable";

describe("click affordance class strings", () => {
  it("gives every clickable kind a pointer and a visible keyboard focus ring", () => {
    for (const classes of [CLICK_CARD, CLICK_ROW, CLICK_FIGURE]) {
      expect(classes).toContain("cursor-pointer");
      expect(classes).toContain("focus-visible:outline-2");
      expect(classes).toContain("focus-visible:outline-[var(--ui-focus)]");
    }
  });

  it("lifts a card by 1 px with a shadow and a darker border, and turns the movement off for reduced motion", () => {
    expect(CLICK_CARD).toContain("hover:-translate-y-px");
    expect(CLICK_CARD).toContain("hover:shadow-md");
    expect(CLICK_CARD).toContain("hover:border-[var(--ui-border-hover)]");
    expect(CLICK_CARD).toContain("motion-reduce:hover:translate-y-0");
    expect(CLICK_CARD).toContain("motion-reduce:transition-none");
  });

  it("changes a row's background on hover and underlines a figure with dots", () => {
    expect(CLICK_ROW).toContain("hover:bg-[var(--ui-row-hover)]");
    expect(CLICK_FIGURE).toContain("decoration-dotted");
    expect(CLICK_FIGURE).toContain("underline");
  });

  it("styles a disabled target as muted with a not-allowed cursor and no lift", () => {
    expect(DISABLED).toContain("cursor-not-allowed");
    expect(DISABLED).toContain("text-[var(--ui-disabled-text)]");
    expect(DISABLED).toContain("border-[var(--ui-disabled-border)]");
    expect(DISABLED).toContain("hover:translate-y-0");
    expect(DISABLED).not.toContain("cursor-pointer");
  });

  it("uses only palette variables, never a literal colour or a shell variable", () => {
    for (const classes of [CLICK_CARD, CLICK_ROW, CLICK_FIGURE, DISABLED]) {
      expect(classes).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(classes).not.toContain("--shell-");
    }
  });
});
