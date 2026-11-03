import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Armchair, Check, GraduationCap, House, Plane, Receipt, TrendingUp, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GOAL_OPTIONS } from "@/features/profile-v2/lib/onboardingOptions";
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
  selectedValues: PrimaryGoal[];
  onBack: () => void;
  onSkip: () => void;
  /** Staging-QA fix 2 (2026-09-30): multi-select, saved on Continue rather than on tap. */
  onContinue: (values: PrimaryGoal[]) => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}

const GOAL_ICONS: Record<PrimaryGoal, LucideIcon> = {
  wealth_creation: TrendingUp,
  retirement: Armchair,
  childrens_education: GraduationCap,
  buy_home: House,
  financial_freedom: Plane,
  tax_planning: Receipt,
};

const OPTIONS = GOAL_OPTIONS.map((option) => ({ ...option, Icon: GOAL_ICONS[option.value] }));

export const ALL_GOALS: PrimaryGoal[] = OPTIONS.map((o) => o.value);

export function Q3Purpose({
  selectedValues,
  onBack,
  onSkip,
  onContinue,
  isMobile = false,
  currentStepIndex = 2,
  totalSteps = 4,
}: Q3PurposeProps) {
  const [picked, setPicked] = useState<PrimaryGoal[]>(selectedValues);
  const allPicked = ALL_GOALS.every((g) => picked.includes(g));
  // "Why choose? All of it." is purely a UI shortcut: it saves the six real goal values, no seventh value (decision Q7).
  const toggleAll = () => setPicked(allPicked ? [] : [...ALL_GOALS]);
  const toggle = (v: PrimaryGoal) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const choicesContent = (
    <motion.div
      role="group"
      aria-label="What brings you to Unifolio?"
      variants={onboardingOptionsContainerVariants}
      initial="hidden"
      animate="visible"
      className="divide-y divide-[var(--color-border)]/35 -mx-1"
    >
      {OPTIONS.map((option) => {
        const isSelected = picked.includes(option.value);
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
            role="checkbox"
            aria-checked={isSelected}
            className={cn(
              "w-full py-3 sm:py-3.5 px-2.5 sm:px-3 rounded-xl flex items-center gap-3.5 text-left transition-all duration-150 cursor-pointer group select-none min-h-[50px]",
              isSelected
                ? "bg-[#22C55E]/[0.08] dark:bg-[#22C55E]/[0.12]"
                : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035]"
            )}
            onClick={() => toggle(option.value)}
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
              <option.Icon className="h-5 w-5" aria-hidden="true" />
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
            </div>

            {/* Right check mark */}
            <div
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150",
                isSelected
                  ? "bg-[#22C55E]/15 text-[#22C55E]"
                  : "text-[#5C5C5C]/50 dark:text-[#A3A3A3]/50 group-hover:text-[#22C55E] group-hover:translate-x-0.5"
              )}
            >
              {isSelected ? <Check className="h-4 w-4" /> : null}
            </div>
          </motion.button>
        );
      })}
      <motion.button
        key="all_of_it"
        variants={onboardingOptionItemVariants}
        whileHover={{ x: 2, transition: { duration: 0.18, ease: MOTION_EASING_SMOOTH } }}
        whileTap={{ scale: 0.99 }}
        type="button"
        role="checkbox"
        aria-checked={allPicked}
        className={cn(
          "w-full py-3 sm:py-3.5 px-2.5 sm:px-3 rounded-xl flex items-center gap-3.5 text-left transition-all duration-150 cursor-pointer group select-none min-h-[50px] border-t border-[var(--color-border)]/60 mt-1 pt-1",
          allPicked
            ? "bg-[#22C55E]/[0.08] dark:bg-[#22C55E]/[0.12]"
            : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035]"
        )}
        onClick={toggleAll}
      >
        <div
          className={cn(
            "h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150",
            allPicked
              ? "bg-[#22C55E]/20 text-[#22C55E]"
              : "bg-[#22C55E]/10 text-[var(--color-ink)] group-hover:bg-[#22C55E]/15 group-hover:text-[#22C55E]"
          )}
        >
          <Check className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <strong
            className={cn(
              "block font-display font-bold text-xs sm:text-[13.5px] transition-colors",
              allPicked ? "text-[#22C55E]" : "text-[var(--color-ink)] group-hover:text-[#22C55E]"
            )}
          >
            Why choose? All of it.
          </strong>
          <span className="block text-[11px] sm:text-xs text-[#5C5C5C] dark:text-[#A3A3A3] leading-snug font-normal">
            The full picture, the true returns, the whole family, the fine print.
          </span>
        </div>
        <div
          className={cn(
            "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150",
            allPicked ? "bg-[#22C55E]/15 text-[#22C55E]" : "text-[#5C5C5C]/50 dark:text-[#A3A3A3]/50"
          )}
        >
          {allPicked ? <Check className="h-4 w-4" /> : null}
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
        title="What brings you to Unifolio?"
        illustrationVariant="purpose"
        subtext="Pick all that apply, and we'll tailor your dashboard around them"
        ctaLabel="Continue"
        onCtaClick={() => onContinue(picked)}
        ctaDisabled={picked.length === 0}
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
        <p className="text-[11px] sm:text-[12px] tracking-tight text-[var(--color-text-secondary)] leading-relaxed whitespace-nowrap">
          Pick all that apply, and we'll tailor your dashboard around them
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
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer min-h-[44px]"
        >
          Skip
        </button>
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.985 }}>
          <Button
            variant="primary"
            type="button"
            disabled={picked.length === 0}
            onClick={() => onContinue(picked)}
            className="h-11 sm:h-12 px-6 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer transition-all min-h-[44px] sm:min-h-[48px]"
          >
            <span>Continue</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
