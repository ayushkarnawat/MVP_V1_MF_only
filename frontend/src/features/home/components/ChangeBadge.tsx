import { changeDirection, formatSignedPercent, formatSignedRupees } from "../homeFormat";

export interface ChangeBadgeProps {
  amount: string | null;
  pct?: string | null;
  hidden?: boolean;
}

export function ChangeBadge({ amount, pct, hidden }: ChangeBadgeProps) {
  const direction = changeDirection(amount);
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "–";

  const colorClass =
    direction === "up"
      ? "text-[var(--pos-text)]"
      : direction === "down"
        ? "text-[var(--neg-text)]"
        : "text-[var(--ui-text-muted)]";

  let content: string;
  if (hidden) {
    content = "••••••";
  } else if (amount === null) {
    content = "—";
  } else {
    const pctText = pct != null ? ` (${formatSignedPercent(pct)})` : "";
    content = `${arrow} ${formatSignedRupees(amount)}${pctText}`;
  }

  return (
    <span
      data-testid="change-badge"
      data-direction={direction}
      className={`font-semibold tabular-nums ${colorClass}`}
    >
      {content}
    </span>
  );
}
