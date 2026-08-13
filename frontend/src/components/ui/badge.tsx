import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-[9px] py-[3px] font-body text-xs font-medium leading-[1.4] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-[color-mix(in_srgb,var(--color-neutral-badge)_18%,transparent)] text-[var(--color-neutral-badge)]",
        neutral:
          "bg-[color-mix(in_srgb,var(--color-neutral-badge)_18%,transparent)] text-[var(--color-neutral-badge)]",
        positive:
          "bg-[color-mix(in_srgb,var(--color-positive)_14%,transparent)] text-[var(--color-positive)]",
        negative:
          "bg-[color-mix(in_srgb,var(--color-negative)_14%,transparent)] text-[var(--color-negative)]",
        warning:
          "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)]",
        accent:
          "bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]",
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
