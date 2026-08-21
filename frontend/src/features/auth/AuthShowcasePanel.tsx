import type { AuthStep } from "./AuthShell";
import authIllustrationBg from "@/assets/auth-illustration-bg.png";

interface AuthShowcasePanelProps {
  step?: AuthStep;
}

export function AuthShowcasePanel({ step: _step = "landing" }: AuthShowcasePanelProps) {
  return (
    <div className="relative w-full h-full min-h-0 overflow-hidden bg-[#ECECE8] flex flex-col justify-between px-6 sm:px-8 lg:px-9 pt-6 sm:pt-8 lg:pt-9 pb-4 sm:pb-5 lg:pb-5 select-none">
      {/* Background / Upper Visual Artwork */}
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        <img
          src={authIllustrationBg}
          alt="Unifolio Wealth Architecture"
          className="w-full h-full object-cover select-none"
          draggable={false}
        />
      </div>

      {/* Spacer to push content to bottom */}
      <div className="flex-1" />

      {/* Premium Integrated Typography Overlay (positioned cleanly below artwork elements) */}
      <div className="relative z-10 text-left w-full max-w-full mb-1">
        <h2 className="font-serif font-bold text-lg sm:text-xl lg:text-[1.42rem] xl:text-[1.52rem] text-[var(--color-accent)] tracking-tight leading-[1.22] whitespace-nowrap overflow-visible">
          Unify. Consolidate. Build Wealth.
        </h2>
        <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#9CA3AF] leading-relaxed font-body mt-2 tracking-normal font-normal">
          Your fragmented investments, curated into one complete picture.
        </p>
      </div>
    </div>
  );
}
