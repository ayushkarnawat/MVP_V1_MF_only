import { User, Users, ArrowLeft, ArrowRight } from "lucide-react";

interface Q4HouseholdProps {
  onBack: () => void;
  onChooseSolo: () => void;
  onChooseFamily: () => void;
}

export function Q4Household({ onBack, onChooseSolo, onChooseFamily }: Q4HouseholdProps) {
  return (
    <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center p-3.5 sm:p-6 lg:p-8 box-border overflow-y-auto">
      <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto p-5 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/80 shadow-lg space-y-6 text-left box-border animate-in fade-in zoom-in-95 duration-200">
        {/* 1. Header with Eyebrow */}
        <div className="space-y-1.5">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
            YOUR HOUSEHOLD
          </span>
          <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
            Just you, or tracking for family too?
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Unifolio allows tracking individual portfolios or aggregating family members into one combined view.
          </p>
        </div>

        {/* 2. Choice Cards Grid */}
        <div className="space-y-3">
          <button
            type="button"
            className="w-full p-4 sm:p-5 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-bg))] flex items-center gap-4 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] group shadow-xs select-none"
            onClick={onChooseSolo}
          >
            <div className="h-11 w-11 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <User className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <strong className="block font-semibold text-sm sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                Just Me
              </strong>
              <span className="block text-xs text-[var(--color-text-secondary)] leading-relaxed">
                I&apos;m tracking my own personal mutual fund portfolio.
              </span>
            </div>
            <ArrowRight className="h-4 w-4 text-[var(--color-text-secondary)]/40 group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </button>

          <button
            type="button"
            className="w-full p-4 sm:p-5 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-bg))] flex items-center gap-4 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] group shadow-xs select-none"
            onClick={onChooseFamily}
          >
            <div className="h-11 w-11 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <Users className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <strong className="block font-semibold text-sm sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                Family Too
              </strong>
              <span className="block text-xs text-[var(--color-text-secondary)] leading-relaxed">
                I want to track investments for spouse, parents, or children together.
              </span>
            </div>
            <ArrowRight className="h-4 w-4 text-[var(--color-text-secondary)]/40 group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </button>
        </div>

        {/* 3. Navigation Controls */}
        <div className="flex items-center justify-start gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
        </div>
      </div>
    </div>
  );
}
