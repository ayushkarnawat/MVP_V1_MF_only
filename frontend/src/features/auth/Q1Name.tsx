import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { User, ArrowLeft, ArrowRight } from "lucide-react";
import { MobileOnboardingScreen } from "./MobileOnboardingScreen";
import {
  MOTION_EASING,
  MOTION_EASING_FLOAT,
  MOTION_EASING_SMOOTH,
  onboardingContainerVariants,
  onboardingHeadingVariants,
  onboardingIllustrationVariants,
  onboardingOptionItemVariants,
  onboardingSubtextVariants,
  onboardingFooterVariants,
} from "@/lib/motion";

interface Q1NameProps {
  value: string;
  onBack?: () => void;
  onSkip: () => void;
  onSubmit: (name: string) => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}

/** Unified Name Screen Artwork across Mobile & Desktop */
function NameIllustration() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.55, ease: MOTION_EASING }}
      className="relative flex items-center justify-center select-none w-48 h-48 sm:w-56 sm:h-56 mx-auto my-1"
      aria-label="Name onboarding illustration"
      role="img"
    >
      <motion.img
        animate={{ y: [0, -3.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: MOTION_EASING_FLOAT }}
        src="/illustrations/mobile_name_screen.png"
        alt="Name onboarding illustration"
        className="relative z-10 w-full h-full object-contain filter drop-shadow-sm transition-all dark:hidden"
        loading="eager"
        decoding="async"
      />
      <motion.img
        animate={{ y: [0, -3.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: MOTION_EASING_FLOAT }}
        src="/illustrations/mobile_name_screen_dark.png"
        alt="Name onboarding illustration"
        className="relative z-10 w-full h-full object-contain filter drop-shadow-[0_0_14px_rgba(74,222,128,0.2)] transition-all hidden dark:block"
        loading="eager"
        decoding="async"
      />
    </motion.div>
  );
}

export function Q1Name({
  value,
  onBack,
  onSkip,
  onSubmit,
  isMobile = false,
  currentStepIndex = 0,
  totalSteps = 5,
}: Q1NameProps) {
  const [name, setName] = useState(value);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim()) {
      onSubmit(name);
    }
  };

  const nameInputContent = (
    <div className="space-y-1.5 text-left relative">
      <label
        htmlFor="name-input"
        className="text-xs font-semibold text-[var(--color-ink)] block font-body"
      >
        Your full name or first name
      </label>
      <div className="relative flex items-center rounded-2xl bg-white/90 dark:bg-[var(--color-surface)] border border-[var(--color-border)] focus-within:border-[#10B981] focus-within:ring-2 focus-within:ring-[#10B981]/20 transition-all duration-200 overflow-hidden h-13 sm:h-14 min-h-[50px] sm:min-h-[54px] px-4 gap-3 shadow-xs">
        <div className="h-7 w-7 rounded-lg bg-[#10B981]/10 text-[#10B981] flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4" />
        </div>
        <input
          id="name-input"
          type="text"
          value={name}
          placeholder="e.g. Ayush Karnawat"
          autoComplete="name"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck="false"
          onChange={(event) => setName(event.target.value)}
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-[var(--color-ink)] placeholder:text-[#5C5C5C]/50 dark:placeholder:text-[#A3A3A3]/50 focus:outline-none focus:ring-0 focus:border-none border-none outline-none ring-0 shadow-none appearance-none selection:bg-[#10B981]/20 selection:text-[var(--color-ink)] caret-[#10B981]"
          autoFocus
        />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <form onSubmit={handleSubmit} className="w-full h-full flex flex-col justify-between">
        <MobileOnboardingScreen
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
          onBack={onBack}
          onSkip={onSkip}
          title="What should we call you?"
          customIllustration={<NameIllustration />}
          subtext="Personalizing your mutual fund summaries, portfolio reports, and tax statements."
          ctaLabel="Next"
          ctaDisabled={!name.trim()}
          onCtaClick={() => {
            if (name.trim()) onSubmit(name);
          }}
          ctaIcon={<ArrowRight className="h-4 w-4" />}
        >
          {nameInputContent}
        </MobileOnboardingScreen>
      </form>
    );
  }

  // Desktop (isMobile === false) renders inside OnboardingCardStack
  return (
    <motion.form
      variants={onboardingContainerVariants}
      initial="hidden"
      animate="visible"
      onSubmit={handleSubmit}
      className="w-full space-y-5 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={onboardingIllustrationVariants}>
        <NameIllustration />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={onboardingHeadingVariants} className="space-y-1">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          What should we call you?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Personalizing your mutual fund summaries, portfolio reports, and tax statements.
        </p>
      </motion.div>

      {/* 2. Name Input Group */}
      <motion.div variants={onboardingOptionItemVariants}>
        {nameInputContent}
      </motion.div>

      {/* 3. Navigation Controls */}
      <motion.div variants={onboardingFooterVariants} className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>

        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.985 }}>
          <Button
            variant="primary"
            type="submit"
            disabled={!name.trim()}
            className="h-11 sm:h-12 px-6 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer transition-all min-h-[44px] sm:min-h-[48px]"
          >
            <span>Next</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>
      </motion.div>
    </motion.form>
  );
}
