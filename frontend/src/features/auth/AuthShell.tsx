import { useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { isTestEnv } from "@/lib/motion";

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
    <div className="min-h-dvh w-full bg-[var(--color-bg)] text-[var(--color-ink)] flex items-center justify-center p-3 sm:p-6 md:p-8 lg:p-10 relative box-border overflow-x-hidden selection:bg-[var(--color-accent)]/20">
      {/* Theme Toggle (Discreet Canvas Top-Right) */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-30">
        <ThemeToggle />
      </div>

      {/* Main Single Centered Rounded Container */}
      <div className="w-full max-w-6xl rounded-3xl bg-[var(--color-surface)] shadow-xl shadow-black/[0.04] dark:shadow-black/50 border border-[var(--color-border)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px] relative">
        {/* Left ~58% Section: Deep Green Wealth Intelligence Visual Section (Desktop) */}
        <div className="lg:col-span-6 xl:col-span-7 p-3 sm:p-4 lg:p-4 hidden lg:flex h-full order-2 lg:order-1">
          {visualSlot}
        </div>

        {/* Right ~42% Section: Clean Light Authentication Area */}
        <div className="lg:col-span-6 xl:col-span-5 p-6 sm:p-10 md:p-12 lg:p-14 flex flex-col justify-between h-full bg-[var(--color-surface)] order-1 lg:order-2">
          {/* Top Unifolio Brand Logo */}
          <div className="text-left select-none pb-4 flex items-center gap-2">
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

          {/* Clean Bottom Assurance */}
          <div className="pt-4 text-left text-[11px] text-[var(--color-text-secondary)] select-none font-body">
            SEBI registered scheme universe · 256-bit AES encryption
          </div>
        </div>
      </div>
    </div>
  );
}
