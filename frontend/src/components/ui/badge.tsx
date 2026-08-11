import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-[color-mix(in_srgb,var(--color-neutral-badge)_15%,transparent)] text-[var(--color-neutral-badge)] border border-[color-mix(in_srgb,var(--color-neutral-badge)_30%,transparent)]",
        neutral:
          "bg-[color-mix(in_srgb,var(--color-neutral-badge)_15%,transparent)] text-[var(--color-neutral-badge)] border border-[color-mix(in_srgb,var(--color-neutral-badge)_30%,transparent)]",
        positive:
          "bg-[color-mix(in_srgb,var(--color-positive)_15%,transparent)] text-[var(--color-positive)] border border-[color-mix(in_srgb,var(--color-positive)_30%,transparent)]",
        negative:
          "bg-[color-mix(in_srgb,var(--color-negative)_15%,transparent)] text-[var(--color-negative)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)]",
        warning:
          "bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)] border border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]",
        accent:
          "bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] border border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)]",
        outline:
          "border border-[var(--color-border)] text-[var(--color-ink)] bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
