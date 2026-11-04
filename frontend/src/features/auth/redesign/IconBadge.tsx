import type { ReactNode } from "react";

export interface IconBadgeProps {
  icon: ReactNode;
  /** "strong" is the slightly deeper mint used inside option cards. */
  tone?: "soft" | "strong";
  className?: string;
}

/** The round mint circle with a green line icon that sits beside a feature row or an option. Decorative. */
export function IconBadge({ icon, tone = "soft", className = "" }: IconBadgeProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="icon-badge"
      className={`flex shrink-0 items-center justify-center rounded-full text-[var(--auth-green-ink)] [&>svg]:h-[46%] [&>svg]:w-[46%] [&>svg]:stroke-[1.7] ${className}`}
      style={{ width: "var(--auth-badge-size)", height: "var(--auth-badge-size)", background: tone === "strong" ? "var(--auth-badge-strong)" : "var(--auth-badge)" }}
    >
      {icon}
    </span>
  );
}
