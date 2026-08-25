import { useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { isTestEnv } from "@/lib/motion";
import leftPanelVisual from "@/assets/left-panel-visual.svg";

export type AuthStep = "landing" | "email" | "phone" | "otp" | "email_otp" | "link_account";

interface AuthShellProps {
  step: AuthStep;
  formSlot: ReactNode;
  visualSlot: ReactNode;
}

const STEP_ORDER: Record<AuthStep, number> = {
  landing: 0,
  email: 1,
  phone: 1,
  otp: 2,
  email_otp: 2,
  link_account: 3,
};

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 24 : -24,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -24 : 24,
    opacity: 0,
  }),
};

export function AuthShell({ step, formSlot, visualSlot }: AuthShellProps) {
  const prevStepRef = useRef<AuthStep>(step);
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  const prevOrder = STEP_ORDER[prevStepRef.current] ?? 0;
  const currentOrder = STEP_ORDER[step] ?? 0;
  // If moving between same order (e.g. phone <-> email), treat as forward if switching to email/phone
  const direction = currentOrder !== prevOrder ? (currentOrder >= prevOrder ? 1 : -1) : 1;

  useEffect(() => {
    prevStepRef.current = step;
  }, [step]);

  return (
    <div className="min-h-dvh lg:h-dvh lg:max-h-dvh w-full bg-[var(--color-bg)] text-[var(--color-ink)] flex flex-col lg:flex-row items-center justify-center p-0 sm:p-5 lg:p-5 xl:p-8 relative box-border overflow-x-hidden selection:bg-[var(--color-accent)]/20">
      {/* Theme Toggle (Discreet Canvas Top-Right) */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-40">
        <ThemeToggle />
      </div>

      {/* Outer Container Wrapper */}
      <div className="w-full max-w-full sm:max-w-md lg:max-w-[980px] lg:max-h-[calc(100vh-2.5rem)] rounded-none sm:rounded-3xl bg-[var(--color-surface)] shadow-2xl shadow-black/[0.08] dark:shadow-black/70 border-0 sm:border border-[var(--color-border)] overflow-hidden lg:flex lg:flex-row lg:h-[min(640px,calc(100vh-2.5rem))] relative z-10 my-auto min-h-dvh sm:min-h-0 flex flex-col">
        {/* 1. Mobile Hero Band (Below lg) — Large Prominent Hero Visual centered on central circular portfolio artwork */}
        <div className="w-full h-72 sm:h-80 lg:hidden relative overflow-hidden bg-[#ECECE8] dark:bg-[#161B22] border-b border-[var(--color-border)]/40 flex-shrink-0">
          <img
            src={leftPanelVisual}
            alt="Unifolio Wealth Architecture"
            className="w-full h-full object-cover object-[center_24%] scale-105 select-none pointer-events-none transition-all dark:brightness-[0.88] dark:contrast-[1.08]"
            draggable={false}
          />
          {/* Subtle bottom gradient transition to overlapping card */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/15 dark:from-black/40 to-transparent pointer-events-none" />
        </div>

        {/* 2. Left Section: Wealth Architecture Visual (Desktop Only) */}
        <div className="lg:w-[452px] lg:h-full hidden lg:flex flex-shrink-0 min-h-0 order-2 lg:order-1 border-r border-[var(--color-border)] bg-[#ECECE8] overflow-hidden">
          {visualSlot}
        </div>

        {/* 3. Right / Mobile Overlapping Section: Authentication Content Card */}
        <div className="-mt-8 sm:-mt-10 lg:mt-0 relative z-20 rounded-t-3xl sm:rounded-none bg-[var(--color-surface)] border-t border-[var(--color-border)]/60 lg:border-t-0 flex-1 p-5 sm:p-8 lg:p-8 xl:p-10 flex flex-col justify-between h-full min-h-0 overflow-y-auto order-1 lg:order-2 shadow-lg lg:shadow-none">
          {/* Brand Header & Headline Row */}
          <div className="text-left select-none pb-2 sm:pb-6">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <span className="font-display font-bold text-2xl sm:text-2xl text-[var(--color-ink)] tracking-tight">
                Unifolio
              </span>
              <motion.svg
                layoutId="brand-mark"
                viewBox="0 0 100 100"
                className="w-5 h-5 sm:w-4 sm:h-4 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
                aria-label="Unifolio Logo Glyph"
              >
                <path d="M 50 10 A 40 40 0 0 1 90 50" />
              </motion.svg>
            </div>

            {/* Mobile HTML Headline & Subtext matching live web copy */}
            <div className="block lg:hidden pt-0.5 space-y-1.5">
              <h2 className="font-display font-bold text-xl sm:text-xl text-[var(--color-ink)] tracking-tight leading-snug">
                Unify. Consolidate. Build Wealth.
              </h2>
              <p className="text-sm sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                Your fragmented investments, curated into one complete picture.
              </p>
            </div>
          </div>

          {/* Active Form Experience */}
          <div className="mt-2 mb-auto lg:my-auto w-full relative px-0.5 sm:px-1 py-1.5 overflow-visible">
            {shouldReduceMotion ? (
              <div key={step} className="w-full">
                {formSlot}
              </div>
            ) : (
              <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  className="w-full"
                >
                  {formSlot}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
