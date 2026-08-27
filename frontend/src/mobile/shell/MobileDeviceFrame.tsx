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
    <div className="h-dvh w-full bg-[#F8FAF9] dark:bg-[var(--color-bg)] text-[var(--color-ink)] flex items-center justify-center md:py-8 md:px-4 transition-colors duration-200 overflow-hidden relative selection:bg-[#22C55E]/20">
      {/* Soft Painterly Atmospheric Background Lighting */}
      <div
        className="absolute top-0 left-0 w-80 h-80 pointer-events-none opacity-60 dark:opacity-20 transition-opacity z-0"
        style={{
          background:
            "radial-gradient(circle at 10% 10%, rgba(34, 197, 94, 0.12) 0%, rgba(241, 247, 244, 0) 70%)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 right-0 w-96 h-96 pointer-events-none opacity-60 dark:opacity-20 transition-opacity z-0"
        style={{
          background:
            "radial-gradient(circle at 90% 90%, rgba(168, 85, 247, 0.08) 0%, rgba(56, 189, 248, 0.06) 40%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div
        className={cn(
          "w-full max-w-md h-full md:h-[880px] md:max-h-[92vh] bg-[#F8FAF9] dark:bg-[var(--color-bg)] text-[var(--color-ink)] md:rounded-[36px] md:border md:border-[var(--color-border)] md:shadow-2xl overflow-hidden flex flex-col relative transition-colors duration-200 md:ring-1 md:ring-black/5 md:dark:ring-white/10 z-10",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
