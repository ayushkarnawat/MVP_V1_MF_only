import { useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Variants, Transition } from "motion/react";
import { TransitionPanel } from "@/components/core/transition-panel";
import type { HistoryState } from "./onboardingHistory";
import { currentStep } from "./onboardingHistory";
import { getStepIndex } from "./onboardingSteps";
import { isTestEnv, MOTION_EASING } from "@/lib/motion";

interface OnboardingCardStackProps {
  history: HistoryState;
  children: ReactNode;
  className?: string;
  currentStepIndex?: number;
  totalSteps?: number;
}

// Directional slide & fade variants matching refined calm motion
const cardTransitionVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 32 : -32,
    scale: 0.985,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    scale: 1,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 32 : -32,
    scale: 0.985,
    opacity: 0,
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
  }),
};

// Fluid, understated transition
const cardTransition: Transition = {
  x: { duration: 0.38, ease: MOTION_EASING },
  scale: { duration: 0.38, ease: MOTION_EASING },
  opacity: { duration: 0.28, ease: MOTION_EASING },
};

export function OnboardingCardStack({
  history,
  children,
  className = "",
  currentStepIndex,
  totalSteps = 5,
}: OnboardingCardStackProps) {
  const step = currentStep(history);
  const prevCursorRef = useRef(history.cursor);
  const direction = history.cursor >= prevCursorRef.current ? 1 : -1;
  const shouldReduceMotion = useReducedMotion() || isTestEnv;
  const activeStepIdx = currentStepIndex ?? getStepIndex(step);

  useEffect(() => {
    prevCursorRef.current = history.cursor;
  }, [history.cursor]);

  const cardHeader = (
    <header className="flex items-center justify-end pb-3.5 mb-4 border-b border-[var(--color-border)]/50 select-none">
      {/* Desktop Progress Story Indicator */}
      <div
        className="flex items-center gap-1.5"
        aria-label={`Step ${activeStepIdx + 1} of ${totalSteps}`}
      >
        {Array.from({ length: totalSteps }).map((_, idx) => (
          <div
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === activeStepIdx
                ? "w-6 bg-[#22C55E]"
                : idx < activeStepIdx
                ? "w-2.5 bg-[#22C55E]/40"
                : "w-2.5 bg-black/10 dark:bg-white/15"
            }`}
          />
        ))}
      </div>
    </header>
  );

  return (
    <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 py-3.5 box-border overflow-x-hidden overflow-y-auto selection:bg-[var(--color-accent)]/20">
      {/* Outer Card Deck Container with stationary background placeholder cards with narrow-width safety padding */}
      <div className={`w-full max-w-sm sm:max-w-md mx-auto my-auto relative pt-4 pb-2 px-3 sm:px-1 lg:px-0 ${className}`}>
        {/* Stationary Card 2 (Bottom silhouette) with subtle depth reaction */}
        <motion.div
          data-testid="card-stack-placeholder"
          aria-hidden="true"
          animate={{
            rotate: -3,
            y: -10,
            scale: 0.94,
          }}
          transition={{ duration: 0.32, ease: MOTION_EASING }}
          className="absolute inset-x-0 inset-y-0 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/60 shadow-md pointer-events-none opacity-40 select-none z-0"
        />

        {/* Stationary Card 1 (Middle silhouette) with subtle depth reaction */}
        <motion.div
          data-testid="card-stack-placeholder"
          aria-hidden="true"
          animate={{
            rotate: 2,
            y: -5,
            scale: 0.97,
          }}
          transition={{ duration: 0.32, ease: MOTION_EASING }}
          className="absolute inset-x-0 inset-y-0 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/80 shadow-md pointer-events-none opacity-70 select-none z-1"
        />

        {/* Active Dealt Card (Top) with TransitionPanel */}
        <div className="relative z-10 w-full">
          {shouldReduceMotion ? (
            <div
              key={step}
              className="w-full rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl p-5 sm:p-8 text-left box-border"
            >
              {cardHeader}
              {children}
            </div>
          ) : (
            <TransitionPanel
              activeIndex={history.cursor}
              custom={direction}
              variants={cardTransitionVariants}
              transition={cardTransition}
            >
              <div className="w-full rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl p-5 sm:p-8 text-left box-border">
                {cardHeader}
                {children}
              </div>
            </TransitionPanel>
          )}
        </div>
      </div>
    </div>
  );
}
