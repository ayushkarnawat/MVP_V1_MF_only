import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface HandDrawnUnderlineProps {
  children: ReactNode;
  className?: string;
  strokeClassName?: string;
}

/**
 * A double-stroke, hand-drawn ink/scratch underline component matching Unifolio's editorial aesthetic.
 * Recreates the authentic double pen-stroke effect with an overlapping offset scratch line.
 */
export function HandDrawnUnderline({
  children,
  className,
  strokeClassName,
}: HandDrawnUnderlineProps) {
  return (
    <span className={cn("relative inline-block group/underline cursor-pointer select-none", className)}>
      <span className="relative z-10">{children}</span>
      <svg
        className={cn(
          "absolute -bottom-[11px] left-0 w-full h-[10px] sm:h-[11px] pointer-events-none overflow-visible text-[var(--color-accent)] transition-transform duration-200 ease-out group-hover/underline:scale-x-[1.04]",
          strokeClassName
        )}
        viewBox="0 0 140 18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Top primary sweeping stroke spanning full text width */}
        <path
          d="M 4 8.5 C 35 4.0, 75 4.5, 136 6.0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Secondary offset scratch stroke starting ~20% in and merging toward the right */}
        <path
          d="M 28 13.5 C 55 11.0, 92 10.0, 132 8.0"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}
