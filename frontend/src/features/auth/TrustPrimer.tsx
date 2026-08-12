import { Button } from "@/components/ui/button";
import { EyeOff, ShieldCheck, Lock } from "lucide-react";

interface TrustPrimerProps {
  onContinue: () => void;
}

export function TrustPrimer({ onContinue }: TrustPrimerProps) {
  return (
    <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center p-3 sm:p-6 lg:p-8 box-border overflow-y-auto">
      <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto p-5 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/80 shadow-lg space-y-5 sm:space-y-6 text-center box-border animate-in fade-in zoom-in-95 duration-200">
        {/* 1. Official Brand Arc Header */}
        <div className="space-y-3">
          <div className="mx-auto h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_24%,transparent)] text-[var(--color-accent)] flex items-center justify-center">
            <svg
              viewBox="0 0 100 100"
              className="w-5 h-5 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
              aria-label="Unifolio Logo Mark"
            >
              <path d="M 50 10 A 40 40 0 0 1 90 50" />
            </svg>
          </div>
          <div className="overflow-hidden px-0.5">
            <h1 className="font-display font-bold text-base sm:text-lg md:text-xl text-[var(--color-ink)] tracking-tight">
              Your privacy &amp; data safety come first
            </h1>
          </div>
        </div>

        {/* 2. Editorial Privacy Guarantees */}
        <div className="space-y-4 text-left py-1">
          <div className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 mt-0.5">
              <EyeOff className="h-3.5 w-3.5" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <p className="font-medium text-xs sm:text-sm text-[var(--color-ink)]">
                Read-only portfolio access
              </p>
              <p className="text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-relaxed">
                Unifolio only parses holdings and transactions to show analytics. Nothing is ever bought, sold, or transferred.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 mt-0.5">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <p className="font-medium text-xs sm:text-sm text-[var(--color-ink)]">
                No raw CAS PDF storage
              </p>
              <p className="text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-relaxed">
                Statements are processed in-memory. Your raw CAS PDF and PAN are never permanently stored.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Primary Action */}
        <div className="space-y-2.5 pt-1">
          <Button
            onClick={onContinue}
            className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
            type="button"
          >
            Continue
          </Button>
        </div>

        {/* 4. Trust & Security Footnote */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-1 select-none">
          <Lock className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <span>256-bit encrypted · Read-only access · No spam</span>
        </div>
      </div>
    </div>
  );
}
