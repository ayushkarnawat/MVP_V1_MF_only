import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[color-mix(in_srgb,var(--color-border)_60%,transparent)]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
