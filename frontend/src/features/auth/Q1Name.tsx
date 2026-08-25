import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { User, ArrowLeft, ArrowRight } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { MobileOnboardingScreen } from "./MobileOnboardingScreen";
import { DoodleSparkle } from "./OnboardingDoodles";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface Q1NameProps {
  value: string;
  onBack?: () => void;
  onSkip: () => void;
  onSubmit: (name: string) => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}

/** Custom Editorial Illustration rendering the mobile name screen artwork */
function MobileNameIllustration() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.34, 1.2, 0.64, 1] }}
      className="relative flex items-center justify-center select-none w-56 h-56 sm:w-64 sm:h-64 mx-auto my-1"
      aria-label="Name onboarding illustration"
      role="img"
    >
      <motion.img
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        src="/illustrations/mobile_name_screen.png"
        alt="Name onboarding illustration"
        className="relative z-10 w-full h-full object-contain filter drop-shadow-sm transition-all dark:hidden"
        loading="eager"
        decoding="async"
      />
      <motion.img
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
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
  currentStepIndex = 1,
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
    <div className="space-y-2 text-left relative">
      <label
        htmlFor="name-input"
        className="text-xs font-semibold text-[var(--color-ink)] block"
      >
        Your Full Name or First Name
      </label>
      <div className="relative flex items-center rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent)]/20 transition-all overflow-hidden h-12 sm:h-13 min-h-[48px] px-4 gap-3 shadow-xs">
        <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0">
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
          className="flex-1 bg-transparent text-xs sm:text-sm font-medium text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none focus:ring-0 focus:border-none border-none outline-none ring-0 shadow-none appearance-none selection:bg-[var(--color-accent)]/20 selection:text-[var(--color-ink)] caret-[var(--color-accent)]"
          autoFocus
        />
        {name.trim() && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <DoodleSparkle className="w-3.5 h-3.5 text-[var(--color-accent)] opacity-80" />
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <form onSubmit={handleSubmit} className="w-full">
        <MobileOnboardingScreen
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
          onBack={onBack}
          onSkip={onSkip}
          title="What should we call you?"
          customIllustration={<MobileNameIllustration />}
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

  // Desktop (isMobile === false) renders unchanged
  return (
    <motion.form
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      onSubmit={handleSubmit}
      className="w-full space-y-6 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="name" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          What should we call you?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Personalizing your mutual fund summaries, portfolio reports, and tax statements.
        </p>
      </motion.div>

      {/* 2. Name Input Group */}
      <motion.div variants={staggerItemVariants}>
        {nameInputContent}
      </motion.div>

      {/* 3. Navigation Controls */}
      <motion.div variants={staggerItemVariants} className="flex items-center justify-between gap-3 pt-2">
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

        <Button
          variant="primary"
          type="submit"
          disabled={!name.trim()}
          className="h-11 sm:h-12 px-6 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          <span>Next</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </motion.div>
    </motion.form>
  );
}
