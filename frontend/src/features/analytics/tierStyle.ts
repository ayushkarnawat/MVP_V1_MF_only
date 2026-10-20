export function tierBadgeStyle(displayTier: number): { backgroundColor: string; color: string } {
  const tier = Math.min(5, Math.max(1, displayTier));
  return { backgroundColor: `var(--tier-${tier}-bg)`, color: `var(--tier-${tier}-fg)` };
}

export const PORTFOLIO_VERDICT_COLOURS = {
  high: "var(--color-positive)",
  moderate: "var(--color-text-secondary)",
  needsReview: "var(--color-warning)",
} as const;

export function portfolioVerdict(score: number): { label: string; color: string } {
  if (score >= 70) return { label: "High Quality Portfolio", color: PORTFOLIO_VERDICT_COLOURS.high };
  if (score >= 50) return { label: "Moderate Quality Portfolio", color: PORTFOLIO_VERDICT_COLOURS.moderate };
  return { label: "Needs Review", color: PORTFOLIO_VERDICT_COLOURS.needsReview };
}
