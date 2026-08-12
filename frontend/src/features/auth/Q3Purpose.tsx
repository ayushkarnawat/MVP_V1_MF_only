import { PieChart, Activity, Users, Scale, ArrowLeft, ArrowRight } from "lucide-react";
import type { PrimaryGoal } from "./types";

interface Q3PurposeProps {
  onBack: () => void;
  onSkip: () => void;
  onSelect: (value: PrimaryGoal) => void;
}

const OPTIONS: { value: PrimaryGoal; title: string; subtitle: string; icon: typeof PieChart }[] = [
  {
    value: "consolidated_view",
    title: "Consolidated portfolio view",
    subtitle: "See all my mutual funds across brokers and AMCs in one place",
    icon: PieChart,
  },
  {
    value: "understand_holdings",
    title: "Understand true performance",
    subtitle: "Realized vs unrealized gains, direct vs regular returns",
    icon: Activity,
  },
  {
    value: "family_management",
    title: "Family wealth tracking",
    subtitle: "Managing investments for family members under one dashboard",
    icon: Users,
  },
  {
    value: "performance_comparison",
    title: "Compare distributor fees",
    subtitle: "Compare returns and commissions across ARNs and channels",
    icon: Scale,
  },
];

export function Q3Purpose({ onBack, onSkip, onSelect }: Q3PurposeProps) {
  return (
    <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center p-3.5 sm:p-6 lg:p-8 box-border overflow-y-auto">
      <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto p-5 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/80 shadow-lg space-y-6 text-left box-border animate-in fade-in zoom-in-95 duration-200">
        {/* 1. Header with Eyebrow */}
        <div className="space-y-1.5">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
            YOUR GOALS
          </span>
          <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
            What brings you to Unifolio?
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Choose your primary goal so we can highlight the most relevant views for you.
          </p>
        </div>

        {/* 2. Choice Cards Grid */}
        <div className="space-y-2.5">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                className="w-full p-3.5 sm:p-4 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-bg))] flex items-center gap-3.5 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] group shadow-xs select-none"
                onClick={() => onSelect(option.value)}
              >
                <div className="h-9 w-9 rounded-xl bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <strong className="block font-semibold text-xs sm:text-sm text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                    {option.title}
                  </strong>
                  <span className="block text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-tight">
                    {option.subtitle}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--color-text-secondary)]/40 group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>
            );
          })}
        </div>

        {/* 3. Navigation Controls */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
