import { useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Variants, Transition } from "motion/react";
import { TransitionPanel } from "@/components/core/transition-panel";
import type { HistoryState } from "./onboardingHistory";
import { currentStep } from "./onboardingHistory";
import { isTestEnv, MOTION_EASING } from "@/lib/motion";

interface OnboardingCardStackProps {
  history: HistoryState;
  children: ReactNode;
  className?: string;
}

// Directional slide & fade variants matching Motion Primitives reference
const cardTransitionVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 364 : -364,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 364 : -364,
    opacity: 0,
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
  }),
};

// Directional spring transition matching Motion Primitives reference:
// x: spring stiffness 300, damping 30; opacity: 0.2s
const cardTransition: Transition = {
  x: { type: "spring", stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};

export function OnboardingCardStack({
  history,
  children,
  className = "",
}: OnboardingCardStackProps) {
  const step = currentStep(history);
  const prevCursorRef = useRef(history.cursor);
  const direction = history.cursor >= prevCursorRef.current ? 1 : -1;
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  useEffect(() => {
    prevCursorRef.current = history.cursor;
  }, [history.cursor]);

  return (
    <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center p-3.5 sm:p-6 lg:p-8 box-border overflow-x-hidden overflow-y-auto selection:bg-[var(--color-accent)]/20">
      {/* Outer Card Deck Container with stationary background placeholder cards */}
      <div className={`w-full max-w-sm sm:max-w-md mx-auto my-auto relative pt-4 pb-2 ${className}`}>
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
                {children}
              </div>
            </TransitionPanel>
          )}
        </div>
      </div>
    </div>
  );
}
