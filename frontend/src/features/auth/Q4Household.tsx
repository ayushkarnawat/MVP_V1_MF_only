import { motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface Q4HouseholdProps {
  onBack: () => void;
  onChooseSolo: () => void;
  onChooseFamily: () => void;
}

export function Q4Household({ onBack, onChooseSolo, onChooseFamily }: Q4HouseholdProps) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full space-y-3 sm:space-y-5 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="household" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
          YOUR HOUSEHOLD
        </span>
        <h1 className="font-display font-bold text-lg sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          Just you, or tracking for family too?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Unifolio allows tracking individual portfolios or aggregating family members into one combined view.
        </p>
      </motion.div>

      {/* 2. Choice Cards Grid */}
      <motion.div variants={staggerItemVariants} className="space-y-2 sm:space-y-3">
        {/* Solo Choice */}
        <button
          type="button"
          className="w-full p-3 sm:p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 hover:bg-[color-mix(in_srgb,var(--color-accent)_3%,var(--color-surface))] flex items-center gap-3 sm:gap-4 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] group shadow-xs select-none min-h-[44px]"
          onClick={onChooseSolo}
        >
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:text-[var(--color-accent)] group-hover:scale-105 transition-all duration-200">
            <svg viewBox="0 0 48 48" className="w-8 h-8 sm:w-10 sm:h-10 select-none" fill="none">
              {/* Radiating personal focus spark ticks */}
              <path d="M24 4 V8 M14 7 L17 10 M34 7 L31 10" stroke="#F59E0B" strokeWidth="1.75" strokeLinecap="round" />
              {/* ID Card / Portfolio Frame */}
              <rect x="10" y="13" width="28" height="26" rx="5" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2" />
              {/* Top Accent Strip */}
              <path d="M10 20 H38" stroke="var(--color-border)" strokeWidth="1.5" />
              <rect x="14" y="16" width="8" height="2" rx="1" fill="var(--color-accent)" />
              {/* Single Investor Avatar Silhouette */}
              <circle cx="24" cy="27" r="4.5" fill="#FEF3C7" stroke="currentColor" strokeWidth="1.75" />
              <circle cx="24" cy="27" r="1.75" fill="var(--color-accent)" />
              <path d="M17 37 C17 33.5 20 32 24 32 C28 32 31 33.5 31 37" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              {/* Verified Accent Star */}
              <circle cx="33" cy="16.5" r="2" fill="#F59E0B" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
            <div className="flex items-center gap-2">
              <strong className="block font-display font-semibold text-xs sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                Just Me
              </strong>
              <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.2 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] group-hover:border-[var(--color-accent)]/40 group-hover:text-[var(--color-accent)] transition-colors">
                INDIVIDUAL
              </span>
            </div>
            <span className="block text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-tight sm:leading-relaxed">
              I&apos;m tracking my own personal mutual fund portfolio.
            </span>
          </div>
          <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)] group-hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-all duration-150">
            <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
        </button>

        {/* Family Choice */}
        <button
          type="button"
          className="w-full p-3 sm:p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 hover:bg-[color-mix(in_srgb,var(--color-accent)_3%,var(--color-surface))] flex items-center gap-3 sm:gap-4 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] group shadow-xs select-none min-h-[44px]"
          onClick={onChooseFamily}
        >
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:text-[var(--color-accent)] group-hover:scale-105 transition-all duration-200">
            <svg viewBox="0 0 48 48" className="w-8 h-8 sm:w-10 sm:h-10 select-none" fill="none">
              {/* Radiating kinship warm sparks */}
              <path d="M24 4 V8 M14 7 L17 10 M34 7 L31 10" stroke="#F59E0B" strokeWidth="1.75" strokeLinecap="round" />
              {/* Sheltering Roof Canopy */}
              <path d="M11 21 L24 10 L37 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 19 L24 11.5 L34 19" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
              {/* Member 1 (Primary / Gold) */}
              <circle cx="18" cy="27" r="4" fill="#FEF3C7" stroke="currentColor" strokeWidth="1.75" />
              <circle cx="18" cy="27" r="1.5" fill="#F59E0B" />
              <path d="M12 37 C12 34 14.5 32.5 18 32.5 C20 32.5 21.8 33.2 22.8 34.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              {/* Member 2 (Partner / Emerald) */}
              <circle cx="30" cy="27" r="4" fill="color-mix(in srgb, var(--color-accent) 25%, transparent)" stroke="currentColor" strokeWidth="1.75" />
              <circle cx="30" cy="27" r="1.5" fill="var(--color-accent)" />
              <path d="M25.2 34.5 C26.2 33.2 28 32.5 30 32.5 C33.5 32.5 36 34 36 37" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              {/* Connected Household Dotted Bond */}
              <path d="M18 27 H30" stroke="var(--color-accent)" strokeWidth="1.5" strokeDasharray="2 2" />
              {/* Small child token / center heart spark */}
              <circle cx="24" cy="35" r="2.5" fill="#FEF3C7" stroke="var(--color-accent)" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
            <div className="flex items-center gap-2">
              <strong className="block font-display font-semibold text-xs sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                Family Too
              </strong>
              <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.2 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] group-hover:border-[var(--color-accent)]/40 group-hover:text-[var(--color-accent)] transition-colors">
                AGGREGATE
              </span>
            </div>
            <span className="block text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-tight sm:leading-relaxed">
              I want to track investments for spouse, parents, or children together.
            </span>
          </div>
          <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)] group-hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-all duration-150">
            <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
        </button>
      </motion.div>

      {/* 3. Navigation Controls */}
      <motion.div variants={staggerItemVariants} className="flex items-center justify-start gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer min-h-[44px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>
      </motion.div>
    </motion.div>
  );
}
