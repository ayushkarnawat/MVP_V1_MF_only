import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import type { IllustrationVariant } from "./OnboardingIllustration";
import { MobileAuthBackground } from "./MobileAuthBackground";
import { UnifolioLogo } from "@/components/UnifolioLogo";
import {
  isTestEnv,
  MOTION_EASING,
  MOTION_EASING_SMOOTH,
  onboardingContainerVariants,
  onboardingHeadingVariants,
  onboardingIllustrationVariants,
  onboardingSubtextVariants,
} from "@/lib/motion";

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

  return (
    <div className="h-dvh max-h-dvh w-full bg-[#F8FAF9] dark:bg-[var(--color-bg)] text-[var(--color-ink)] flex flex-col justify-between px-5 sm:px-6 pt-2.5 sm:pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)] box-border overflow-hidden relative selection:bg-[#10B981]/20">
      {/* Soft Painterly Atmospheric Background Lighting */}
      <div
        className="absolute top-0 left-0 w-80 h-80 pointer-events-none opacity-60 dark:opacity-20 transition-opacity z-0"
        style={{
          background:
            "radial-gradient(circle at 10% 10%, rgba(16, 185, 129, 0.12) 0%, rgba(241, 247, 244, 0) 70%)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 right-0 w-96 h-96 pointer-events-none opacity-60 dark:opacity-20 transition-opacity z-0"
        style={{
          background:
            "radial-gradient(circle at 90% 90%, rgba(16, 185, 129, 0.08) 0%, rgba(52, 211, 153, 0.04) 40%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Restrained Ethereal Geometric Background Layer */}
      <MobileAuthBackground />

      {/* 1. Top Bar: Back Button, Persistent Unifolio Logo + Refined Story Progress Indicator */}
      <header className="relative z-20 flex flex-col gap-1 w-full flex-shrink-0 pt-0.5">
        <div className="flex items-center justify-between h-9 w-full">
          {/* Left: Back Chevron */}
          <div className="w-10 flex items-center justify-start">
            {onBack ? (
              <motion.button
                whileTap={{ scale: 0.92 }}
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="h-8.5 w-8.5 rounded-full flex items-center justify-center text-[#5C5C5C] dark:text-[#A3A3A3] hover:text-[var(--color-ink)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-5 w-5" />
              </motion.button>
            ) : null}
          </div>

          {/* Center: Small Persistent Unifolio Logo/Wordmark */}
          <div className="flex items-center justify-center select-none">
            <UnifolioLogo className="h-4.5 sm:h-5" />
          </div>

          {/* Right: Symmetrical spacer */}
          <div className="w-10" aria-hidden="true" />
        </div>

        {/* Story Progress Indicator */}
        <div
          className="flex items-center gap-1.5 justify-center mx-auto w-full max-w-[120px]"
          aria-label={`Step ${currentStepIndex + 1} of ${totalSteps}`}
        >
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx === currentStepIndex
                  ? "flex-1 bg-[#10B981] dark:bg-[#34D399]"
                  : idx < currentStepIndex
                  ? "w-2.5 sm:w-3 bg-[#10B981]/40 dark:bg-[#34D399]/40"
                  : "w-2.5 sm:w-3 bg-black/10 dark:bg-white/15"
              }`}
            />
          ))}
        </div>
      </header>

      {/* 2. Main Content Column: Progressive Hierarchical Motion */}
      <motion.main
        key={currentStepIndex}
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: MOTION_EASING }}
        className="relative z-10 flex-1 flex flex-col justify-center my-auto w-full max-w-sm sm:max-w-md mx-auto text-center py-1"
      >
        <motion.div
          variants={shouldReduceMotion ? undefined : onboardingContainerVariants}
          initial={shouldReduceMotion ? undefined : "hidden"}
          animate={shouldReduceMotion ? undefined : "visible"}
          className="space-y-2.5 sm:space-y-3.5 w-full"
        >
          {/* 1. Heading reveals first */}
          <motion.div variants={shouldReduceMotion ? undefined : onboardingHeadingVariants}>
            <h1 className="font-display font-bold text-[24px] xs:text-[26px] sm:text-[30px] text-[var(--color-ink)] tracking-tight leading-[1.12]">
              {title}
            </h1>
          </motion.div>

          {/* 2. Original Artwork Illustration gently fades/floats into place */}
          {(illustrationVariant || customIllustration) && (
            <motion.div
              variants={shouldReduceMotion ? undefined : onboardingIllustrationVariants}
              className="flex justify-center py-0.5 sm:py-1 relative flex-shrink-0"
            >
              {customIllustration ? (
                customIllustration
              ) : illustrationVariant ? (
                <OnboardingIllustration
                  variant={illustrationVariant}
                  className="w-36 h-36 sm:w-44 sm:h-44 mx-auto max-h-[220px]"
                />
              ) : null}
            </motion.div>
          )}

          {/* 3. Subtext appears progressively */}
          {subtext && (
            <motion.div variants={shouldReduceMotion ? undefined : onboardingSubtextVariants}>
              <p className="text-[12.5px] xs:text-[13px] sm:text-[14px] text-[#5C5C5C] dark:text-[#A3A3A3] leading-relaxed max-w-[340px] mx-auto font-normal font-body">
                {subtext}
              </p>
            </motion.div>
          )}

          {/* 4. Content Slot (Inputs / Choice Cards) */}
          {children && (
            <motion.div
              variants={shouldReduceMotion ? undefined : onboardingSubtextVariants}
              className="w-full pt-0.5"
            >
              {children}
            </motion.div>
          )}
        </motion.div>
      </motion.main>

      {/* 3. Bottom Action Bar: Skip & Primary CTA with Safe-Area Inset */}
      {(onSkip || (ctaLabel && onCtaClick)) && (
        <motion.footer
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 6 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.12, ease: MOTION_EASING }}
          className="relative z-20 w-full max-w-sm sm:max-w-md mx-auto pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] flex-shrink-0 flex items-center justify-between gap-3"
        >
          {/* Skip Button */}
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs sm:text-[13px] font-bold text-[#10B981] dark:text-[#34D399] hover:underline transition-all cursor-pointer py-2 px-3 select-none flex-shrink-0"
            >
              Skip
            </button>
          ) : <div className="w-2" />}

          {/* Primary CTA Button */}
          {ctaLabel && onCtaClick ? (
            <motion.button
              whileHover={{ scale: 1.008, transition: { duration: 0.2, ease: MOTION_EASING_SMOOTH } }}
              whileTap={{ scale: 0.985 }}
              type="button"
              disabled={ctaDisabled}
              onClick={onCtaClick}
              className="flex-1 h-13.5 sm:h-14 px-8 rounded-full font-bold text-[15px] sm:text-base bg-[#10B981] hover:bg-[#059669] dark:bg-[#10B981] dark:hover:bg-[#059669] text-white shadow-xl shadow-[#10B981]/25 dark:shadow-[#10B981]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-2 border border-[#10B981]/40 min-h-[50px]"
            >
              <span>{ctaLabel}</span>
              {ctaIcon}
            </motion.button>
          ) : null}
        </motion.footer>
      )}
    </div>
  );
}
