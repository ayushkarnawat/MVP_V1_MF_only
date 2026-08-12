import { Button } from "@/components/ui/button";
import { ShieldCheck, TrendingUp, Users, Layers } from "lucide-react";

interface LandingProps {
  onContinue: (mode?: "signup" | "login") => void;
}

export function Landing({ onContinue }: LandingProps) {
  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto p-5 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/80 shadow-lg space-y-6 text-center box-border animate-in fade-in zoom-in-95 duration-200">
      {/* 1. Refined Brand Header with Official Unifolio Arc Mark */}
      <div className="space-y-2.5">
        <div className="mx-auto h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_24%,transparent)] text-[var(--color-accent)] flex items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="w-5 h-5 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
            aria-label="Unifolio Logo Mark"
          >
            <path d="M 50 10 A 40 40 0 0 1 90 50" />
          </svg>
        </div>
        <div className="space-y-1">
          <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight">
            Unifolio
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed max-w-xs mx-auto">
            One place to understand, track, and grow your wealth.
          </p>
        </div>
      </div>

      {/* 2. Editorial Product Principles */}
      <div className="space-y-3.5 text-left py-1">
        <div className="flex items-start gap-3">
          <div className="h-5 w-5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 mt-0.5">
            <Layers className="h-3 w-3" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="font-medium text-xs text-[var(--color-ink)]">
              Unified Wealth View
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-normal">
              See your investments and overall financial picture in one place.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="h-5 w-5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 mt-0.5">
            <TrendingUp className="h-3 w-3" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="font-medium text-xs text-[var(--color-ink)]">
              Smarter Financial Decisions
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-normal">
              Understand performance, costs, and opportunities with greater clarity.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="h-5 w-5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 mt-0.5">
            <Users className="h-3 w-3" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="font-medium text-xs text-[var(--color-ink)]">
              Family Portfolio Hub
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-normal">
              Consolidate household portfolios under a unified dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Action Hierarchy */}
      <div className="space-y-2.5 pt-1">
        <Button
          onClick={() => onContinue("signup")}
          className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
          type="button"
        >
          Sign Up
        </Button>
        <Button
          variant="outline"
          onClick={() => onContinue("login")}
          className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
          type="button"
        >
          Log In
        </Button>
      </div>

      {/* 4. Trust & Security Footer */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-1 select-none">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </div>
    </div>
  );
}
