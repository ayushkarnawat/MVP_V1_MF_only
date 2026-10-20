import { describe, expect, it } from "vitest";
import { PORTFOLIO_VERDICT_COLOURS, portfolioVerdict, tierBadgeStyle } from "./tierStyle";

describe("tierBadgeStyle", () => {
  it("uses a distinct background and matching foreground token for each tier", () => {
    const styles = [1, 2, 3, 4, 5].map(tierBadgeStyle);
    expect(new Set(styles.map(style => style.backgroundColor)).size).toBe(5);
    expect(styles[0]).toEqual({ backgroundColor: "var(--tier-1-bg)", color: "var(--tier-1-fg)" });
    expect(styles[4]).toEqual({ backgroundColor: "var(--tier-5-bg)", color: "var(--tier-5-fg)" });
  });

  it("clamps tiers outside the display range", () => {
    expect(tierBadgeStyle(0)).toEqual(tierBadgeStyle(1));
    expect(tierBadgeStyle(9)).toEqual(tierBadgeStyle(5));
  });

});

describe("portfolioVerdict", () => {
  it.each([
    [70, "High Quality Portfolio", "var(--color-positive)"],
    [69.9, "Moderate Quality Portfolio", "var(--color-text-secondary)"],
    [50, "Moderate Quality Portfolio", "var(--color-text-secondary)"],
    [49.9, "Needs Review", "var(--color-warning)"],
  ])("labels and colours a score of %s", (score, label, color) => {
    expect(portfolioVerdict(score)).toEqual({ label, color });
    expect(Object.values(PORTFOLIO_VERDICT_COLOURS)).toContain(color);
  });
});
