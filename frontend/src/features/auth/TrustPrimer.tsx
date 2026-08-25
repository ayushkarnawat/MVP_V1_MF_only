import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { MobileOnboardingScreen } from "./MobileOnboardingScreen";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface TrustPrimerProps {
  onContinue: () => void;
  onSkip?: () => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}



/** Custom Editorial Illustration rendering the exact cropped mobile privacy screen artwork */
function ShortStayPrivacyIllustration() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.34, 1.2, 0.64, 1] }}
      className="relative flex items-center justify-center select-none w-64 h-64 sm:w-72 sm:h-72 mx-auto my-1"
      aria-label="Privacy illustration showing CAS statement safely dissolving into temporary insights"
      role="img"
    >
      <motion.img
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        src="/illustrations/mobile_privacy_screen.png"
        alt="Privacy illustration showing statement dissolving into temporary insights"
        className="relative z-10 w-full h-full object-contain filter drop-shadow-sm transition-all dark:hidden"
        loading="eager"
        decoding="async"
      />
      <motion.img
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
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
  isMobile = false,
  currentStepIndex = 0,
  totalSteps = 5,
}: TrustPrimerProps) {
  if (isMobile) {
    return (
      <MobileOnboardingScreen
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        title={
          <span>
            {"We keep your "}
            <span className="text-[var(--color-accent)]">insights,</span>{" "}
            <br />
            not your files.
          </span>
        }
        customIllustration={<ShortStayPrivacyIllustration />}
        subtext="Your CAS is processed in memory to understand your holdings and transactions. Your original PDF and PAN are never permanently stored."
        ctaLabel="Continue"
        ctaIcon={<span className="text-base font-bold ml-0.5">→</span>}
        onCtaClick={onContinue}
      />
    );
  }

  // Desktop (isMobile === false) renders unchanged
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-3 sm:space-y-5 text-center box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="trust" />
      </motion.div>

      {/* 1. Official Brand Header */}
      <motion.div variants={staggerItemVariants} className="space-y-0.5 px-0.5">
        <h1 className="font-display font-bold text-base sm:text-xl md:text-2xl text-[var(--color-ink)] tracking-tight">
          Your privacy &amp; data safety come first
        </h1>
      </motion.div>

      {/* 2. Editorial Privacy Guarantee Cards */}
      <motion.div variants={staggerItemVariants} className="space-y-2 text-left">
        <div className="p-2.5 sm:p-3.5 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-1 transition-all">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 32 32" className="w-4 h-4 sm:w-5 sm:h-5 select-none" fill="none">
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
        </div>

        <div className="p-2.5 sm:p-3.5 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-1 transition-all">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 32 32" className="w-4 h-4 sm:w-5 sm:h-5 select-none" fill="none">
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
            Statements are processed in-memory. Your raw CAS PDF and PAN are never permanently stored.
          </p>
        </div>
      </motion.div>

      {/* 3. Primary Action */}
      <motion.div variants={staggerItemVariants} className="space-y-2 pt-0.5">
        <Button
          onClick={onContinue}
          className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
          type="button"
        >
          Continue
        </Button>
      </motion.div>
    </motion.div>
  );
}
