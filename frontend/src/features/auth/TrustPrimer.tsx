import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
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

interface TrustPrimerProps {
  onContinue: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}

/** Custom Editorial Illustration rendering the exact cropped mobile privacy screen artwork */
function ShortStayPrivacyIllustration() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.55, ease: MOTION_EASING }}
      className="relative flex items-center justify-center select-none w-56 h-56 sm:w-64 sm:h-64 mx-auto my-1"
      aria-label="Privacy illustration showing CAS statement safely dissolving into temporary insights"
      role="img"
    >
      <motion.img
        animate={{ y: [0, -3.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: MOTION_EASING_FLOAT }}
        src="/illustrations/mobile_privacy_screen.png"
        alt="Privacy illustration showing statement dissolving into temporary insights"
        className="relative z-10 w-full h-full object-contain filter drop-shadow-sm transition-all dark:hidden"
        loading="eager"
        decoding="async"
      />
      <motion.img
        animate={{ y: [0, -3.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: MOTION_EASING_FLOAT }}
        src="/illustrations/mobile_privacy_screen_dark.png"
        alt="Privacy illustration showing statement dissolving into temporary insights"
        className="relative z-10 w-full h-full object-contain filter drop-shadow-[0_0_14px_rgba(74,222,128,0.2)] transition-all hidden dark:block"
        loading="eager"
        decoding="async"
      />
    </motion.div>
  );
}

export function TrustPrimer({
  onContinue,
  onBack,
  isMobile = false,
  currentStepIndex = 3,
  totalSteps = 5,
}: TrustPrimerProps) {
  if (isMobile) {
    return (
      <MobileOnboardingScreen
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        onBack={onBack}
        title={
          <span>
            {"We keep your "}
            <span className="text-[#10B981] dark:text-[#34D399]">insights,</span>{" "}
            <br />
            not your files.
          </span>
        }
        customIllustration={<ShortStayPrivacyIllustration />}
        subtext="Your CAS is processed instantly and never saved. Built under the RBI Account Aggregator framework — you can disconnect anytime."
        ctaLabel="Next"
        ctaIcon={<ArrowRight className="h-4 w-4" />}
        onCtaClick={onContinue}
      />
    );
  }

  // Desktop (isMobile === false) renders inside OnboardingCardStack
  return (
    <motion.div
      variants={onboardingContainerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-4 sm:space-y-5 text-center box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={onboardingIllustrationVariants}>
        <OnboardingIllustration variant="trust" />
      </motion.div>

      {/* 1. Standardized Official Brand Header */}
      <motion.div variants={onboardingHeadingVariants} className="space-y-1 px-0.5 text-center">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          {"We keep your "}
          <span className="text-[#10B981] dark:text-[#34D399]">insights,</span>{" "}
          not your files.
        </h1>
      </motion.div>

      {/* 2. Editorial Privacy Guarantee Cards */}
      <motion.div variants={onboardingSubtextVariants} className="space-y-2 text-left">
        <motion.div
          variants={onboardingOptionItemVariants}
          whileHover={{ y: -1.5, scale: 1.004, transition: { duration: 0.2, ease: MOTION_EASING_SMOOTH } }}
          className="p-3 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-1 transition-all"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 32 32" className="w-4 h-4 select-none" fill="none">
                <path d="M16 2 V4 M25 5 L23 7 M7 5 L9 7" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
                <path
                  d="M16 6 L26 10 V17 C26 23 21 27 16 29 C11 27 6 23 6 17 V10 L16 6 Z"
                  fill="color-mix(in srgb, var(--color-accent) 20%, transparent)"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                <rect x="10" y="18" width="2.5" height="5" rx="0.75" fill="currentColor" />
                <rect x="14.75" y="15" width="2.5" height="8" rx="0.75" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1" />
                <rect x="19.5" y="12" width="2.5" height="11" rx="0.75" fill="var(--color-accent)" />
              </svg>
            </div>
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
              Read-only portfolio access
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-snug sm:leading-relaxed pl-9.5">
            Unifolio only parses holdings and transactions to show analytics. Nothing is ever bought, sold, or transferred.
          </p>
        </motion.div>

        <motion.div
          variants={onboardingOptionItemVariants}
          whileHover={{ y: -1.5, scale: 1.004, transition: { duration: 0.2, ease: MOTION_EASING_SMOOTH } }}
          className="p-3 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-1 transition-all"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 32 32" className="w-4 h-4 select-none" fill="none">
                <path d="M26 4 L28 2 M28 8 L30 8" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
                <path
                  d="M7 6 C7 4.5 8 4 9.5 4 H19 L25 10 V25 C25 26.5 24 27 22.5 27 H9.5 C8 27 7 26.5 7 25 V6 Z"
                  fill="var(--color-surface)"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                <path d="M19 4 V10 H25" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M11 14 H18 M11 18 H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="21" cy="21" r="5.5" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="21" cy="21" r="2.5" fill="var(--color-accent)" />
                <path d="M21 16.5 V18" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
              No raw CAS PDF storage
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-snug sm:leading-relaxed pl-9.5">
            Statements are processed instantly and never saved. Your raw CAS PDF and PAN are never permanently stored.
          </p>
        </motion.div>

        {/* 3. Regulatory Anchor & Disconnect Anytime */}
        <motion.div
          variants={onboardingOptionItemVariants}
          whileHover={{ scale: 1.004, transition: { duration: 0.2, ease: MOTION_EASING_SMOOTH } }}
          className="p-2.5 sm:p-3 rounded-2xl bg-[#10B981]/[0.06] dark:bg-[#10B981]/[0.10] border border-[#10B981]/25 flex items-center gap-2.5"
        >
          <ShieldCheck className="h-4 w-4 text-[#10B981] dark:text-[#34D399] flex-shrink-0" />
          <p className="text-[11px] sm:text-xs text-[var(--color-ink)] leading-tight font-medium">
            Operates under the <strong className="text-[#10B981] dark:text-[#34D399]">Account Aggregator framework</strong>. You can disconnect anytime.
          </p>
        </motion.div>
      </motion.div>

      {/* 4. Primary Action & Back Controls */}
      <motion.div variants={onboardingFooterVariants} className="flex items-center justify-between gap-3 pt-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer min-h-[44px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
        )}

        <motion.div className="flex-1" whileHover={{ scale: 1.008 }} whileTap={{ scale: 0.985 }}>
          <Button
            onClick={onContinue}
            className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer transition-all min-h-[44px] sm:min-h-[48px]"
            type="button"
          >
            <span>Next</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
