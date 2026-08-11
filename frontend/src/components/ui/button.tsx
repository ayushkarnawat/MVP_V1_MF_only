import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-accent)] text-white hover:brightness-110 shadow-sm",
        primary:
          "bg-[var(--color-accent)] text-white hover:brightness-110 shadow-sm",
        secondary:
          "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)] shadow-sm",
        outline:
          "border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)]",
        destructive:
          "bg-[var(--color-negative)] text-white hover:brightness-110 shadow-sm",
        ghost:
          "text-[var(--color-ink)] hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)]",
        link:
          "text-[var(--color-accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm",
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-10 px-4 py-2 text-sm",
        lg: "h-12 rounded-xl px-6 text-base font-semibold",
        icon: "h-9 w-9 rounded-lg p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
