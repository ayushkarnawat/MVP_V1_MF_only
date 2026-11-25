import { motion } from "motion/react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { INVESTOR_TYPE_ICONS } from "./onboardingIcons";
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
}

const OPTIONS: InvestingOption[] = [
  {
    value: "self_directed",
    title: "Mostly on my own",
    subtitle: "Direct SIPs, mutual funds, maybe some stocks",
  },
  {
    value: "advisor_assisted",
    title: "Through an advisor or distributor",
    subtitle: "Distributor, bank advisor or family office, alongside my own tracking",
  },
  {
    value: "mixed",
    title: "A mix of both",
    subtitle: "A bit of self-directed investing and a bit through an advisor",
  },
  {
    value: "beginner",
    title: "Just getting started",
    subtitle: "Haven't invested much yet, building my portfolio",
  },
];

export function Q2Investing({
  selectedValue,
  onBack,
  onSkip,
  onSelect,
  isMobile = false,
  currentStepIndex = 1,
  totalSteps = 4,
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
        const Icon = INVESTOR_TYPE_ICONS[option.value];
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
                ? "bg-[color-mix(in_srgb,var(--pos)_8%,transparent)] dark:bg-[color-mix(in_srgb,var(--pos)_12%,transparent)]"
                : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035]"
            )}
            onClick={() => onSelect(option.value)}
          >
            {/* Left Icon */}
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-[var(--ui-card)] text-[var(--pos)] [&>svg]:h-1/2 [&>svg]:w-1/2">
              <Icon aria-hidden="true" />
            </div>

            {/* Title & Subtitle */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <strong
                className={cn(
                  "block font-display font-bold text-xs sm:text-[13.5px] transition-colors",
                  isSelected
                    ? "text-[var(--pos)]"
                    : "text-[var(--color-ink)] group-hover:text-[var(--pos)]"
                )}
              >
                {option.title}
              </strong>
              <span className="block text-[11px] sm:text-xs text-[var(--ui-text-muted)] leading-snug font-normal">
                {option.subtitle}
              </span>
            </div>

            {/* Right Arrow */}
            <div
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150",
                isSelected
                  ? "bg-[color-mix(in_srgb,var(--pos)_15%,transparent)] text-[var(--pos)]"
                  : "text-[var(--ui-text-muted)]/50 group-hover:text-[var(--pos)] group-hover:translate-x-0.5"
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
        subtext="Choose what best describes how you invest today"
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
          Choose what best describes how you invest today
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
