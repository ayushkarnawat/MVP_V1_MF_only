import React from "react";
import { cn } from "@/lib/utils";

export interface MobileDeviceFrameProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileDeviceFrame({
  children,
  className,
}: MobileDeviceFrameProps) {
  return (
    <div className="h-dvh w-full bg-[var(--color-bg)] text-[var(--color-ink)] flex items-center justify-center md:py-8 md:px-4 transition-colors duration-200 overflow-hidden">
      <div
        className={cn(
          "w-full max-w-md h-full md:h-[880px] md:max-h-[92vh] bg-[var(--color-bg)] text-[var(--color-ink)] md:rounded-[36px] md:border md:border-[var(--color-border)] md:shadow-2xl overflow-hidden flex flex-col relative transition-colors duration-200 md:ring-1 md:ring-black/5 md:dark:ring-white/10",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
