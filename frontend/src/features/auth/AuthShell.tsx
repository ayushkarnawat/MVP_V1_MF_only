import { useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { isTestEnv } from "@/lib/motion";
import { MobileAuthBackground } from "./MobileAuthBackground";

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
    <div className="min-h-dvh lg:h-dvh lg:max-h-dvh w-full bg-[var(--color-bg)] text-[var(--color-ink)] flex items-center justify-center p-3 sm:p-5 lg:p-5 xl:p-8 relative box-border overflow-x-hidden selection:bg-[var(--color-accent)]/20">
      {/* Editorial Minimal Vector Background for Mobile */}
      <MobileAuthBackground />

      {/* Theme Toggle (Discreet Canvas Top-Right) */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-30">
        <ThemeToggle />
      </div>

      {/* Auth Card Container: Compact, Clean Surface on Mobile; 2-Column Grid on Desktop */}
      <div className="w-full max-w-[350px] sm:max-w-md lg:max-w-[980px] lg:max-h-[calc(100vh-2.5rem)] rounded-3xl bg-[var(--color-surface)] shadow-xl shadow-black/[0.06] dark:shadow-black/70 border border-[var(--color-border)] overflow-hidden lg:flex lg:flex-row lg:h-[min(640px,calc(100vh-2.5rem))] relative z-10 my-auto">
        {/* Left Section: Wealth Architecture Visual (Desktop Only) - Fits 1414x2000 (0.707 ratio) illustration 1:1 */}
        <div className="lg:w-[452px] lg:h-full hidden lg:flex flex-shrink-0 min-h-0 order-2 lg:order-1 border-r border-[var(--color-border)] bg-[#ECECE8] overflow-hidden">
          {visualSlot}
        </div>

        {/* Right / Mobile Main Section: Authentication Content */}
        <div className="flex-1 p-6 sm:p-8 lg:p-8 xl:p-10 flex flex-col justify-between h-full min-h-0 overflow-y-auto bg-[var(--color-surface)] order-1 lg:order-2">
          {/* Top Unifolio Brand Logo */}
          <div className="text-left select-none pb-4 sm:pb-6 flex items-center gap-2">
            <span className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight">
              Unifolio
            </span>
            <motion.svg
              layoutId="brand-mark"
              viewBox="0 0 100 100"
              className="w-4 h-4 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
              aria-label="Unifolio Logo Glyph"
            >
              <path d="M 50 10 A 40 40 0 0 1 90 50" />
            </motion.svg>
          </div>

          {/* Active Form Experience */}
          <div className="my-auto w-full relative overflow-hidden py-1">
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
