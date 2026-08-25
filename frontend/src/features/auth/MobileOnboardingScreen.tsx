import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import type { IllustrationVariant } from "./OnboardingIllustration";
import { DoodleSparkle } from "./OnboardingDoodles";
import { isTestEnv, staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

export interface MobileOnboardingScreenProps {
  currentStepIndex: number; // 0-indexed
  totalSteps?: number; // default 5
  onBack?: () => void;
  onSkip?: () => void;
  title: ReactNode;
  illustrationVariant?: IllustrationVariant;
  customIllustration?: ReactNode;
  subtext?: string;
  children?: ReactNode;
  ctaLabel?: string;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  ctaIcon?: ReactNode;
}

/** Almost white backgrounds with extremely subtle screen-specific tints */
const STEP_CANVAS_CLASSES: Record<number, string> = {
  0: "bg-[#fcfdfc] dark:bg-[#0c120f]", // Almost white with subtle sage tint
  1: "bg-[#fdfcfc] dark:bg-[#140f11]", // Almost white with subtle blush tint
  2: "bg-[#fcfdfc] dark:bg-[#0c120f]", // Almost white with subtle emerald mint tint
  3: "bg-[#fdfdfb] dark:bg-[#14110e]", // Almost white with subtle sand tint
  4: "bg-[#fdfcfd] dark:bg-[#110e14]", // Almost white with subtle lavender tint
};

export function MobileOnboardingScreen({
  currentStepIndex,
  totalSteps = 5,
  onBack,
  onSkip,
  title,
  illustrationVariant,
  customIllustration,
  subtext,
  children,
  ctaLabel,
  onCtaClick,
  ctaDisabled,
  ctaIcon,
}: MobileOnboardingScreenProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;
  const canvasBgClass = STEP_CANVAS_CLASSES[currentStepIndex] || STEP_CANVAS_CLASSES[0];

  return (
    <div
      className={`min-h-dvh w-full ${canvasBgClass} flex flex-col justify-between p-4 sm:p-6 box-border overflow-y-auto relative transition-colors duration-500 selection:bg-[var(--color-accent)]/20`}
    >
      {/* Background Decorative Sparkle Accent (Restrained, subtle) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 select-none opacity-35 dark:opacity-25">
        <DoodleSparkle className="absolute top-14 right-6 w-4 h-4 text-[var(--color-accent)]" />
      </div>

      {/* 1. Top Bar & Low-Weight Story Progress Indicator */}
      <div className="relative z-10 flex items-center justify-between h-11 w-full flex-shrink-0 mb-2 pt-1">
        {/* Left: Back Chevron */}
        <div className="w-12 flex items-center justify-start">
          {onBack ? (
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="h-10 w-10 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)] transition-colors cursor-pointer min-h-[44px] min-w-[44px]"
            >
              <ChevronLeft className="h-5 w-5" />
            </motion.button>
          ) : null}
        </div>

        {/* Center: Reduced Weight & Width Progress Indicator */}
        <div
          className="flex items-center gap-1 justify-center flex-1 max-w-[100px] sm:max-w-[130px]"
          aria-label={`Step ${currentStepIndex + 1} of ${totalSteps}`}
        >
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx === currentStepIndex
                  ? "flex-1 bg-[var(--color-accent)]"
                  : idx < currentStepIndex
                  ? "w-2.5 bg-[color-mix(in_srgb,var(--color-accent)_40%,transparent)]"
                  : "w-2.5 bg-[color-mix(in_srgb,var(--color-border)_50%,transparent)]"
              }`}
            />
          ))}
        </div>

        {/* Right Spacer (Theme toggle is fixed at top right) */}
        <div className="w-12" />
      </div>

      {/* Main Content Column with Smooth Slide/Fade Transition */}
      <motion.div
        key={currentStepIndex}
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
        className="relative z-10 flex-1 flex flex-col justify-center space-y-4 my-auto py-3 w-full max-w-md mx-auto text-center sm:text-left"
      >
        <motion.div
          variants={shouldReduceMotion ? undefined : staggerContainerVariants}
          initial={shouldReduceMotion ? undefined : "hidden"}
          animate={shouldReduceMotion ? undefined : "visible"}
          className="space-y-4 w-full"
        >
          {/* 2. Headline with Strong Editorial Hierarchy */}
          <motion.div variants={shouldReduceMotion ? undefined : staggerItemVariants}>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[var(--color-ink)] tracking-tight leading-tight">
              {title}
            </h1>
          </motion.div>

          {/* 3. Main Illustration (Slightly enlarged with breathing room) */}
          {(illustrationVariant || customIllustration) && (
            <motion.div variants={shouldReduceMotion ? undefined : staggerItemVariants} className="flex justify-center py-3 sm:py-4 relative">
              {customIllustration ? (
                customIllustration
              ) : illustrationVariant ? (
                <OnboardingIllustration
                  variant={illustrationVariant}
                  className="w-36 h-36 sm:w-44 sm:h-44 mx-auto max-h-[240px]"
                />
              ) : null}
            </motion.div>
          )}

          {/* 4. Subtext */}
          {subtext && (
            <motion.div variants={shouldReduceMotion ? undefined : staggerItemVariants}>
              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed max-w-sm mx-auto sm:mx-0 font-medium">
                {subtext}
              </p>
            </motion.div>
          )}

          {/* 5. Content Slot (Choice Cards Grid / Input Form) */}
          {children && (
            <motion.div variants={shouldReduceMotion ? undefined : staggerItemVariants} className="w-full pt-1">
              {children}
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      {/* 6. Bottom Navigation Bar: Skip (Bottom-Left in Unifolio Green) & Next CTA */}
      {(onSkip || (ctaLabel && onCtaClick)) && (
        <div className="relative z-10 w-full max-w-md mx-auto pt-3 pb-1 flex-shrink-0 flex items-center justify-between gap-3">
          {/* Bottom Left: Subtle Unifolio Green Skip Button */}
          {onSkip ? (
            <motion.button
              whileTap={{ scale: 0.94 }}
              type="button"
              onClick={onSkip}
              className="text-xs sm:text-sm font-semibold text-[var(--color-accent)] hover:opacity-80 transition-all cursor-pointer py-2.5 px-3.5 min-h-[48px] rounded-xl border border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] flex items-center justify-center flex-shrink-0 select-none min-w-[72px]"
            >
              Skip
            </motion.button>
          ) : <div />}

          {/* Bottom Right / Spanning CTA */}
          {ctaLabel && onCtaClick ? (
            <motion.button
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={ctaDisabled}
              onClick={onCtaClick}
              className="flex-1 h-13 rounded-2xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm tracking-wide shadow-xs gap-2.5 cursor-pointer transition-all flex items-center justify-center min-h-[50px]"
            >
              <span>{ctaLabel}</span>
              {ctaIcon}
            </motion.button>
          ) : null}
        </div>
      )}
    </div>
  );
}
