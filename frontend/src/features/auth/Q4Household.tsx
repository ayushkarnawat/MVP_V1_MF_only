import { motion } from "motion/react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { MobileOnboardingScreen } from "./MobileOnboardingScreen";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface Q4HouseholdProps {
  onBack: () => void;
  onSkip?: () => void;
  onChooseSolo: () => void;
  onChooseFamily: () => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}

export function Q4Household({
  onBack,
  onSkip,
  onChooseSolo,
  onChooseFamily,
  isMobile = false,
  currentStepIndex = 4,
  totalSteps = 5,
}: Q4HouseholdProps) {
  const choicesContent = (
    <div className="space-y-3 sm:space-y-3.5">
      {/* Solo Choice */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        type="button"
        className="w-full p-3.5 sm:p-4 rounded-2xl bg-[var(--color-surface)] border border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] hover:border-[var(--color-accent)]/50 hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))] flex items-center gap-3.5 sm:gap-4 text-left transition-all duration-200 cursor-pointer group shadow-xs select-none min-h-[50px]"
        onClick={onChooseSolo}
      >
        <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:text-[var(--color-accent)] group-hover:scale-105 transition-all duration-200">
          <svg viewBox="0 0 48 48" className="w-8 h-8 sm:w-10 sm:h-10 select-none" fill="none">
            <path d="M24 4 V8 M14 7 L17 10 M34 7 L31 10" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
            <rect x="10" y="13" width="28" height="26" rx="5" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2" />
            <path d="M10 20 H38" stroke="var(--color-border)" strokeWidth="1.5" />
            <rect x="14" y="16" width="8" height="2" rx="1" fill="var(--color-accent)" />
            <circle cx="24" cy="27" r="4.5" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="24" cy="27" r="1.75" fill="var(--color-accent)" />
            <path d="M17 37 C17 33.5 20 32 24 32 C28 32 31 33.5 31 37" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <circle cx="33" cy="16.5" r="2" fill="var(--color-accent)" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
          <strong className="block font-display font-bold text-xs sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
            Just Me
          </strong>
          <span className="block text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-tight sm:leading-relaxed font-medium">
            I&apos;m tracking my own personal mutual fund portfolio.
          </span>
        </div>
        <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)] group-hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-all duration-150">
          <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all duration-150" />
        </div>
      </motion.button>

      {/* Family Choice */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        type="button"
        className="w-full p-3.5 sm:p-4 rounded-2xl bg-[var(--color-surface)] border border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] hover:border-[var(--color-accent)]/50 hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))] flex items-center gap-3.5 sm:gap-4 text-left transition-all duration-200 cursor-pointer group shadow-xs select-none min-h-[50px]"
        onClick={onChooseFamily}
      >
        <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:text-[var(--color-accent)] group-hover:scale-105 transition-all duration-200">
          <svg viewBox="0 0 48 48" className="w-8 h-8 sm:w-10 sm:h-10 select-none" fill="none">
            <path d="M24 4 V8 M14 7 L17 10 M34 7 L31 10" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
            <path d="M11 21 L24 10 L37 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 19 L24 11.5 L34 19" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="18" cy="27" r="4" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="18" cy="27" r="1.5" fill="var(--color-accent)" />
            <path d="M12 37 C12 34 14.5 32.5 18 32.5 C20 32.5 21.8 33.2 22.8 34.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <circle cx="30" cy="27" r="4" fill="color-mix(in srgb, var(--color-accent) 25%, transparent)" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="30" cy="27" r="1.5" fill="var(--color-accent)" />
            <path d="M25.2 34.5 C26.2 33.2 28 32.5 30 32.5 C33.5 32.5 36 34 36 37" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <path d="M18 27 H30" stroke="var(--color-accent)" strokeWidth="1.5" strokeDasharray="2 2" />
            <circle cx="24" cy="35" r="2.5" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="var(--color-accent)" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
          <strong className="block font-display font-bold text-xs sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
            Family Too
          </strong>
          <span className="block text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-tight sm:leading-relaxed font-medium">
            I want to track investments for spouse, parents, or children together.
          </span>
        </div>
        <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)] group-hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-all duration-150">
          <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all duration-150" />
        </div>
      </motion.button>
    </div>
  );

  if (isMobile) {
    return (
      <MobileOnboardingScreen
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        onBack={onBack}
        onSkip={onSkip}
        title="Just you, or tracking for family too?"
        illustrationVariant="household"
        subtext="Unifolio allows tracking individual portfolios or aggregating family members into one combined view."
      >
        {choicesContent}
      </MobileOnboardingScreen>
    );
  }

  // Desktop (isMobile === false) renders unchanged
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
        <h1 className="font-display font-bold text-lg sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          Just you, or tracking for family too?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Unifolio allows tracking individual portfolios or aggregating family members into one combined view.
        </p>
      </motion.div>

      {/* 2. Choice Cards Grid */}
      <motion.div variants={staggerItemVariants}>
        {choicesContent}
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
