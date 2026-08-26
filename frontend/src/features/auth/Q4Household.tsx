import { motion } from "motion/react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { MobileOnboardingScreen } from "./MobileOnboardingScreen";
import { cn } from "@/lib/utils";
import {
  MOTION_EASING_SMOOTH,
  onboardingContainerVariants,
  onboardingHeadingVariants,
  onboardingIllustrationVariants,
  onboardingOptionItemVariants,
  onboardingOptionsContainerVariants,
  onboardingSubtextVariants,
  onboardingFooterVariants,
} from "@/lib/motion";

interface Q4HouseholdProps {
  selectedChoice?: "solo" | "family" | null;
  onBack: () => void;
  onSkip?: () => void;
  onChooseSolo: () => void;
  onChooseFamily: () => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}

export function Q4Household({
  selectedChoice,
  onBack,
  onSkip,
  onChooseSolo,
  onChooseFamily,
  isMobile = false,
  currentStepIndex = 4,
  totalSteps = 5,
}: Q4HouseholdProps) {
  const choicesContent = (
    <motion.div
      variants={onboardingOptionsContainerVariants}
      initial="hidden"
      animate="visible"
      className="divide-y divide-[var(--color-border)]/35 -mx-1"
    >
      {/* Solo Choice */}
      <motion.button
        variants={onboardingOptionItemVariants}
        whileHover={{
          x: 2,
          transition: { duration: 0.18, ease: MOTION_EASING_SMOOTH },
        }}
        whileTap={{ scale: 0.99 }}
        type="button"
        className={cn(
          "w-full py-3.5 sm:py-4 px-2.5 sm:px-3 rounded-xl flex items-center gap-3.5 text-left transition-all duration-150 cursor-pointer group select-none min-h-[54px]",
          selectedChoice === "solo"
            ? "bg-[#10B981]/[0.08] dark:bg-[#10B981]/[0.12]"
            : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035]"
        )}
        onClick={onChooseSolo}
      >
        <div
          className={cn(
            "h-10 w-10 sm:h-11 sm:w-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150",
            selectedChoice === "solo"
              ? "bg-[#10B981]/20 text-[#10B981] dark:text-[#34D399]"
              : "bg-[#10B981]/10 text-[var(--color-ink)] group-hover:bg-[#10B981]/15 group-hover:text-[#10B981] dark:group-hover:text-[#34D399]"
          )}
        >
          <svg viewBox="0 0 48 48" className="w-8 h-8 select-none" fill="none">
            <path d="M24 4 V8 M14 7 L17 10 M34 7 L31 10" stroke="#10B981" strokeWidth="1.75" strokeLinecap="round" />
            <rect x="10" y="13" width="28" height="26" rx="5" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2" />
            <path d="M10 20 H38" stroke="var(--color-border)" strokeWidth="1.5" />
            <rect x="14" y="16" width="8" height="2" rx="1" fill="#10B981" />
            <circle cx="24" cy="27" r="4.5" fill="#10B981" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="24" cy="27" r="1.75" fill="#10B981" />
            <path d="M17 37 C17 33.5 20 32 24 32 C28 32 31 33.5 31 37" fill="#10B981" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <circle cx="33" cy="16.5" r="2" fill="#10B981" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
          <strong
            className={cn(
              "block font-display font-bold text-xs sm:text-[14px] transition-colors",
              selectedChoice === "solo"
                ? "text-[#10B981] dark:text-[#34D399]"
                : "text-[var(--color-ink)] group-hover:text-[#10B981] dark:group-hover:text-[#34D399]"
            )}
          >
            Just Me
          </strong>
          <span className="block text-[11px] sm:text-xs text-[#5C5C5C] dark:text-[#A3A3A3] leading-snug font-normal">
            I&apos;m tracking my own personal mutual fund portfolio.
          </span>
        </div>
        <div
          className={cn(
            "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150",
            selectedChoice === "solo"
              ? "bg-[#10B981]/15 text-[#10B981] dark:text-[#34D399]"
              : "text-[#5C5C5C]/50 dark:text-[#A3A3A3]/50 group-hover:text-[#10B981] dark:group-hover:text-[#34D399] group-hover:translate-x-0.5"
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </div>
      </motion.button>

      {/* Family Choice */}
      <motion.button
        variants={onboardingOptionItemVariants}
        whileHover={{
          x: 2,
          transition: { duration: 0.18, ease: MOTION_EASING_SMOOTH },
        }}
        whileTap={{ scale: 0.99 }}
        type="button"
        className={cn(
          "w-full py-3.5 sm:py-4 px-2.5 sm:px-3 rounded-xl flex items-center gap-3.5 text-left transition-all duration-150 cursor-pointer group select-none min-h-[54px]",
          selectedChoice === "family"
            ? "bg-[#10B981]/[0.08] dark:bg-[#10B981]/[0.12]"
            : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035]"
        )}
        onClick={onChooseFamily}
      >
        <div
          className={cn(
            "h-10 w-10 sm:h-11 sm:w-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150",
            selectedChoice === "family"
              ? "bg-[#10B981]/20 text-[#10B981] dark:text-[#34D399]"
              : "bg-[#10B981]/10 text-[var(--color-ink)] group-hover:bg-[#10B981]/15 group-hover:text-[#10B981] dark:group-hover:text-[#34D399]"
          )}
        >
          <svg viewBox="0 0 48 48" className="w-8 h-8 select-none" fill="none">
            <path d="M24 4 V8 M14 7 L17 10 M34 7 L31 10" stroke="#10B981" strokeWidth="1.75" strokeLinecap="round" />
            <path d="M11 21 L24 10 L37 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 19 L24 11.5 L34 19" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="18" cy="27" r="4" fill="#10B981" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="18" cy="27" r="1.5" fill="#10B981" />
            <path d="M12 37 C12 34 14.5 32.5 18 32.5 C20 32.5 21.8 33.2 22.8 34.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <circle cx="30" cy="27" r="4" fill="#10B981" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="30" cy="27" r="1.5" fill="#10B981" />
            <path d="M25.2 34.5 C26.2 33.2 28 32.5 30 32.5 C33.5 32.5 36 34 36 37" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <path d="M18 27 H30" stroke="#10B981" strokeWidth="1.5" strokeDasharray="2 2" />
            <circle cx="24" cy="35" r="2.5" fill="#10B981" fillOpacity="0.2" stroke="#10B981" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
          <strong
            className={cn(
              "block font-display font-bold text-xs sm:text-[14px] transition-colors",
              selectedChoice === "family"
                ? "text-[#10B981] dark:text-[#34D399]"
                : "text-[var(--color-ink)] group-hover:text-[#10B981] dark:group-hover:text-[#34D399]"
            )}
          >
            Family Too
          </strong>
          <span className="block text-[11px] sm:text-xs text-[#5C5C5C] dark:text-[#A3A3A3] leading-snug font-normal">
            I want to track investments for spouse, parents, or children together.
          </span>
        </div>
        <div
          className={cn(
            "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150",
            selectedChoice === "family"
              ? "bg-[#10B981]/15 text-[#10B981] dark:text-[#34D399]"
              : "text-[#5C5C5C]/50 dark:text-[#A3A3A3]/50 group-hover:text-[#10B981] dark:group-hover:text-[#34D399] group-hover:translate-x-0.5"
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </div>
      </motion.button>
    </motion.div>
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

  // Desktop (isMobile === false) renders inside OnboardingCardStack
  return (
    <motion.div
      variants={onboardingContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full space-y-3 sm:space-y-5 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={onboardingIllustrationVariants}>
        <OnboardingIllustration variant="household" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={onboardingHeadingVariants} className="space-y-1">
        <h1 className="font-display font-bold text-lg sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          Just you, or tracking for family too?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Unifolio allows tracking individual portfolios or aggregating family members into one combined view.
        </p>
      </motion.div>

      {/* 2. Choice Cards Grid */}
      <motion.div variants={onboardingSubtextVariants}>
        {choicesContent}
      </motion.div>

      {/* 3. Navigation Controls */}
      <motion.div variants={onboardingFooterVariants} className="flex items-center justify-start gap-3 pt-1">
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
