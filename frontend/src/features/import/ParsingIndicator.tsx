import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { OnboardingIllustration } from "@/features/auth/OnboardingIllustration";
import { MOTION_EASING } from "@/lib/motion";

const STEPS = [
  "Extracting folios & transactions…",
  "Matching scheme AMFI codes…",
  "Calculating cost basis & portfolio totals…",
  "Finalizing statement summary…",
];

const PROGRESS_PERCENTAGES = [25, 55, 80, 94];

export function ParsingIndicator() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const progress = PROGRESS_PERCENTAGES[currentStep];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: MOTION_EASING }}
      className="p-8 sm:p-10 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-md space-y-6 text-center max-w-md w-full mx-auto my-auto relative overflow-hidden box-border"
      role="status"
      aria-live="polite"
    >
      {/* Hand-Drawn Hero Illustration with Subtle Emerald Depth Glow */}
      <div className="relative flex justify-center py-1">
        <OnboardingIllustration variant="cas_upload" className="w-24 h-24 sm:w-28 sm:h-28 mx-auto" />
      </div>

      {/* Primary & Supporting Typography Messages */}
      <div className="space-y-1.5 max-w-xs mx-auto">
        <h3 className="font-display font-bold text-lg sm:text-xl text-[var(--color-ink)] tracking-tight">
          Importing Mutual Fund Statement
        </h3>
        <p
          key={currentStep}
          className="text-xs sm:text-sm text-[var(--color-text-secondary)] min-h-[22px] leading-relaxed animate-in fade-in duration-300"
        >
          {STEPS[currentStep]}
        </p>
      </div>

      {/* Polished, Understated Progress Bar Animation */}
      <div className="space-y-2 pt-1 max-w-[240px] mx-auto">
        <div className="w-full h-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_14%,var(--color-bg))] overflow-hidden relative border border-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]">
          <div
            className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(34,197,94,0.4)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Minimal Progress Percentage Badge */}
        <div className="flex justify-between items-center text-[10px] font-mono text-[var(--color-text-secondary)] px-0.5">
          <span>Processing</span>
          <span className="font-bold text-[var(--color-accent)]">{progress}%</span>
        </div>
      </div>
    </motion.div>
  );
}
