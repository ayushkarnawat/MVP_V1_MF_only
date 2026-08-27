import { motion } from "motion/react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { InvestorType } from "./types";
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

interface Q2InvestingProps {
  selectedValue?: InvestorType | null;
  onBack: () => void;
  onSkip: () => void;
  onSelect: (value: InvestorType) => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}

interface InvestingOption {
  value: InvestorType;
  title: string;
  subtitle: string;
  renderIllustration: () => React.ReactNode;
}

const OPTIONS: InvestingOption[] = [
  {
    value: "self_directed",
    title: "Mostly on my own",
    subtitle: "Direct SIPs, mutual funds, maybe some stocks",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        <path d="M35 9 L39 6 M41 13 L45 12 M37 19 L41 20" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="21" cy="27" r="11" stroke="currentColor" strokeWidth="2" fill="color-mix(in srgb, var(--color-accent) 8%, transparent)" />
        <circle cx="21" cy="27" r="3.5" stroke="currentColor" strokeWidth="1.75" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" />
        <path d="M21 12 V16 M21 38 V42 M6 27 H10 M32 27 H36 M10.5 16.5 L13.5 19.5 M28.5 34.5 L31.5 37.5 M10.5 37.5 L13.5 34.5 M28.5 19.5 L31.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M19 25 L39 9 L29 27 L25 21 Z" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M25 21 L39 9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    value: "advisor_assisted",
    title: "Through an advisor or distributor",
    subtitle: "Distributor, bank RM, or family office, alongside my own tracking",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        <path d="M24 4 V8 M14 7 L17 10 M34 7 L31 10" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M12 14 H36 M15 11 H33" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <rect x="14" y="14" width="20" height="3" rx="1.5" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" />
        <line x1="18" y1="17" x2="18" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="24" y1="17" x2="24" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="30" y1="17" x2="30" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <rect x="13" y="35" width="22" height="4" rx="1.5" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" />
        <path d="M11 39 H37" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="34" cy="27" r="6" fill="color-mix(in srgb, var(--color-accent) 30%, transparent)" stroke="currentColor" strokeWidth="1.75" />
        <path d="M34 23.5 L35 25.5 H37 L35.5 27 L36 29 L34 28 L32 29 L32.5 27 L31 25.5 H33 Z" fill="var(--color-accent)" />
      </svg>
    ),
  },
  {
    value: "mixed",
    title: "A mix of both",
    subtitle: "Direct plans + Regular distributor plans",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        <path d="M8 18 C8 12 14 8 20 8 M40 30 C40 36 34 40 28 40" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
        <circle cx="18" cy="24" r="9" fill="color-mix(in srgb, var(--color-accent) 25%, transparent)" stroke="currentColor" strokeWidth="2" />
        <circle cx="15" cy="21" r="2.5" fill="var(--color-accent)" />
        <circle cx="30" cy="24" r="9" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="2" />
        <circle cx="33" cy="21" r="2.5" fill="var(--color-accent)" />
        <path d="M24 17.5 C26 19.5 27 22 27 24 C27 26 26 28.5 24 30.5 C22 28.5 21 26 21 24 C21 22 22 19.5 24 17.5 Z" fill="var(--color-accent)" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M24 6 V10 M22 8 H26" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "beginner",
    title: "Just getting started",
    subtitle: "Haven't invested much yet, building my portfolio",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        <path d="M34 10 L37 7 M40 15 L44 14 M36 21 L40 22" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="38" cy="12" r="3" fill="color-mix(in srgb, var(--color-accent) 30%, transparent)" />
        <path d="M14 26 H34 L31 40 H17 L14 26 Z" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <rect x="12" y="23" width="24" height="4" rx="2" fill="color-mix(in srgb, var(--color-accent) 15%, transparent)" stroke="currentColor" strokeWidth="1.75" />
        <path d="M24 23 V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M24 18 C20 18 17 15 17 12 C20 12 23 15 24 18 Z" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M24 14 C28 14 31 11 31 8 C28 8 25 11 24 14 Z" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <circle cx="21" cy="33" r="1" fill="currentColor" />
        <circle cx="27" cy="35" r="1" fill="currentColor" />
      </svg>
    ),
  },
];

export function Q2Investing({
  selectedValue,
  onBack,
  onSkip,
  onSelect,
  isMobile = false,
  currentStepIndex = 1,
  totalSteps = 5,
}: Q2InvestingProps) {
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
                ? "bg-[#22C55E]/[0.08] dark:bg-[#22C55E]/[0.12]"
                : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035]"
            )}
            onClick={() => onSelect(option.value)}
          >
            {/* Left Icon */}
            <div
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150",
                isSelected
                  ? "bg-[#22C55E]/20 text-[#22C55E]"
                  : "bg-[#22C55E]/10 text-[var(--color-ink)] group-hover:bg-[#22C55E]/15 group-hover:text-[#22C55E]"
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
                    ? "text-[#22C55E]"
                    : "text-[var(--color-ink)] group-hover:text-[#22C55E]"
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
                  ? "bg-[#22C55E]/15 text-[#22C55E]"
                  : "text-[#5C5C5C]/50 dark:text-[#A3A3A3]/50 group-hover:text-[#22C55E] group-hover:translate-x-0.5"
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
        title="How are you investing right now?"
        illustrationVariant="investing"
        subtext="Select the option that best describes your current investment approach."
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
        <OnboardingIllustration variant="investing" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={onboardingHeadingVariants} className="space-y-1">
        <h1 className="font-display font-bold text-lg sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          How are you investing right now?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Select the option that best describes your current investment approach.
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
