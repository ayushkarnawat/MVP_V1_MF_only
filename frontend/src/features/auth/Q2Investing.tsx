import { motion } from "motion/react";
import { TrendingUp, Briefcase, Layers, Sparkles, ArrowLeft, ArrowRight } from "lucide-react";
import type { InvestorType } from "./types";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface Q2InvestingProps {
  onBack: () => void;
  onSkip: () => void;
  onSelect: (value: InvestorType) => void;
}

const OPTIONS: { value: InvestorType; title: string; subtitle: string; icon: typeof TrendingUp }[] = [
  {
    value: "self_directed",
    title: "Mostly on my own",
    subtitle: "Direct SIPs, mutual funds, maybe some stocks",
    icon: TrendingUp,
  },
  {
    value: "advisor_assisted",
    title: "Through an advisor or distributor",
    subtitle: "Distributor, bank RM, or family office, alongside my own tracking",
    icon: Briefcase,
  },
  {
    value: "mixed",
    title: "A mix of both",
    subtitle: "Direct plans + Regular distributor plans",
    icon: Layers,
  },
  {
    value: "beginner",
    title: "Just getting started",
    subtitle: "Haven't invested much yet, building my portfolio",
    icon: Sparkles,
  },
];

export function Q2Investing({ onBack, onSkip, onSelect }: Q2InvestingProps) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full space-y-6 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="investing" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
          YOUR INVESTING STYLE
        </span>
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          How are you investing right now?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Select the option that best describes your current investment approach.
        </p>
      </motion.div>

      {/* 2. Choice Cards Grid */}
      <motion.div variants={staggerItemVariants} className="space-y-2.5">
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
      </motion.div>

      {/* 3. Navigation Controls */}
      <motion.div variants={staggerItemVariants} className="flex items-center justify-between gap-3 pt-2">
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
      </motion.div>
    </motion.div>
  );
}
