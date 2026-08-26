import { motion } from "motion/react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { PrimaryGoal } from "./types";
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

interface Q3PurposeProps {
  selectedValue?: PrimaryGoal | null;
  onBack: () => void;
  onSkip: () => void;
  onSelect: (value: PrimaryGoal) => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}

interface PurposeOption {
  value: PrimaryGoal;
  title: string;
  subtitle: string;
  renderIllustration: () => React.ReactNode;
}

const OPTIONS: PurposeOption[] = [
  {
    value: "consolidated_view",
    title: "Consolidated portfolio view",
    subtitle: "See all my mutual funds across brokers and AMCs in one place",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        <path d="M24 5 V8 M12 8 L15 11 M36 8 L33 11" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
        <rect x="10" y="12" width="28" height="9" rx="3" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="2" />
        <circle cx="24" cy="16.5" r="1.5" fill="currentColor" />
        <rect x="10" y="21" width="28" height="9" rx="3" fill="color-mix(in srgb, var(--color-accent) 15%, transparent)" stroke="currentColor" strokeWidth="2" />
        <circle cx="24" cy="25.5" r="1.5" fill="var(--color-accent)" />
        <rect x="8" y="30" width="32" height="11" rx="3" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2" />
        <rect x="20" y="34" width="8" height="3" rx="1.5" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 34 H16" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "understand_holdings",
    title: "Understand true performance",
    subtitle: "Realized vs unrealized gains, direct vs regular returns",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        <path d="M16 26 L20 18 H28 L32 26 L24 34 Z" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M20 18 L24 26 L28 18 M16 26 H32 M24 26 V34" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="23" cy="21" r="11" stroke="currentColor" strokeWidth="2.25" fill="color-mix(in srgb, var(--color-accent) 15%, transparent)" />
        <path d="M16 16 C18 13 22 12 25 13" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M31 29 L41 39" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="40" cy="38" r="2" fill="var(--color-accent)" />
        <path d="M35 10 V14 M33 12 H37" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="11" cy="14" r="1.5" fill="var(--color-accent)" />
      </svg>
    ),
  },
  {
    value: "family_management",
    title: "Family wealth tracking",
    subtitle: "Managing investments for family members under one dashboard",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        <path d="M9 22 C9 13.5 15.5 8 24 8 C32.5 8 39 13.5 39 22 C34 20 29 22 24 20 C19 22 14 20 9 22 Z" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M24 5 V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M24 20 V33 C24 35.5 22 37 20 37 C18 37 16.5 35.5 16.5 34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="27" r="4.5" fill="color-mix(in srgb, var(--color-accent) 30%, transparent)" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="16" cy="27" r="1.5" fill="var(--color-accent)" />
        <circle cx="32" cy="27" r="4.5" fill="color-mix(in srgb, var(--color-accent) 25%, transparent)" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="32" cy="27" r="1.5" fill="var(--color-accent)" />
        <path d="M30 13 L33 11 M35 15 L38 14" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "performance_comparison",
    title: "Compare distributor fees",
    subtitle: "Compare returns and commissions across different distributors",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        <path d="M24 9 V37 M18 37 H30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="11" r="2.5" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" />
        <path d="M10 15 L38 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 15 L7 24 M10 15 L15 24" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 24 C6 24 11 27 16 24 Z" fill="color-mix(in srgb, var(--color-accent) 30%, transparent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <circle cx="11" cy="22" r="2" fill="var(--color-accent)" />
        <path d="M38 19 L33 30 M38 19 L43 30" stroke="currentColor" strokeWidth="1.5" />
        <path d="M32 30 C32 30 38 33 44 30 Z" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <rect x="36" y="26" width="4" height="4" rx="1" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.25" />
        <path d="M7 11 L5 9 M10 8 L9 5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Q3Purpose({
  selectedValue,
  onBack,
  onSkip,
  onSelect,
  isMobile = false,
  currentStepIndex = 2,
  totalSteps = 5,
}: Q3PurposeProps) {
  const choicesContent = (
    <motion.div
      variants={onboardingOptionsContainerVariants}
      initial="hidden"
      animate="visible"
      className="divide-y divide-[var(--color-border)]/35 -mx-1"
    >
      {OPTIONS.map((option) => {
        const isSelected = selectedValue === option.value;
        return (
          <motion.button
            key={option.value}
            variants={onboardingOptionItemVariants}
            whileHover={{
              x: 2,
              transition: { duration: 0.18, ease: MOTION_EASING_SMOOTH },
            }}
            whileTap={{ scale: 0.99 }}
            type="button"
            className={cn(
              "w-full py-3 sm:py-3.5 px-2.5 sm:px-3 rounded-xl flex items-center gap-3.5 text-left transition-all duration-150 cursor-pointer group select-none min-h-[50px]",
              isSelected
                ? "bg-[#10B981]/[0.08] dark:bg-[#10B981]/[0.12]"
                : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035]"
            )}
            onClick={() => onSelect(option.value)}
          >
            {/* Left Icon */}
            <div
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150",
                isSelected
                  ? "bg-[#10B981]/20 text-[#10B981] dark:text-[#34D399]"
                  : "bg-[#10B981]/10 text-[var(--color-ink)] group-hover:bg-[#10B981]/15 group-hover:text-[#10B981] dark:group-hover:text-[#34D399]"
              )}
            >
              {option.renderIllustration()}
            </div>

            {/* Title & Subtitle */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <strong
                className={cn(
                  "block font-display font-bold text-xs sm:text-[13.5px] transition-colors",
                  isSelected
                    ? "text-[#10B981] dark:text-[#34D399]"
                    : "text-[var(--color-ink)] group-hover:text-[#10B981] dark:group-hover:text-[#34D399]"
                )}
              >
                {option.title}
              </strong>
              <span className="block text-[11px] sm:text-xs text-[#5C5C5C] dark:text-[#A3A3A3] leading-snug font-normal">
                {option.subtitle}
              </span>
            </div>

            {/* Right Arrow */}
            <div
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150",
                isSelected
                  ? "bg-[#10B981]/15 text-[#10B981] dark:text-[#34D399]"
                  : "text-[#5C5C5C]/50 dark:text-[#A3A3A3]/50 group-hover:text-[#10B981] dark:group-hover:text-[#34D399] group-hover:translate-x-0.5"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );

  if (isMobile) {
    return (
      <MobileOnboardingScreen
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        onBack={onBack}
        onSkip={onSkip}
        title="What brings you to Unifolio?"
        illustrationVariant="purpose"
        subtext="Choose your primary goal so we can highlight the most relevant views for you."
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
        <OnboardingIllustration variant="purpose" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={onboardingHeadingVariants} className="space-y-1">
        <h1 className="font-display font-bold text-lg sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          What brings you to Unifolio?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Choose your primary goal so we can highlight the most relevant views for you.
        </p>
      </motion.div>

      {/* 2. Choice Cards Grid */}
      <motion.div variants={onboardingSubtextVariants}>
        {choicesContent}
      </motion.div>

      {/* 3. Navigation Controls */}
      <motion.div variants={onboardingFooterVariants} className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer min-h-[44px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer min-h-[44px]"
        >
          Skip
        </button>
      </motion.div>
    </motion.div>
  );
}
