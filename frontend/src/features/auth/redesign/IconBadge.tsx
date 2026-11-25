import type { ReactNode } from "react";

export interface IconBadgeProps {
  icon: ReactNode;
  /** "strong" is the slightly deeper mint used inside option cards. */
  tone?: "soft" | "strong";
  className?: string;
}

/** The soft grey tile with a green line icon beside an option (the news-list style). Decorative. */
export function IconBadge({ icon, className = "" }: IconBadgeProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="icon-badge"
      className={`flex shrink-0 items-center justify-center rounded-[10px] bg-[var(--ui-card)] text-[var(--pos)] [&>svg]:h-1/2 [&>svg]:w-1/2 ${className}`}
      style={{ width: "var(--auth-badge-size)", height: "var(--auth-badge-size)" }}
    >
      {icon}
    </span>
  );
}
