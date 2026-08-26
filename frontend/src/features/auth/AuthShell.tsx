import { useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { isTestEnv } from "@/lib/motion";
import { MobileAuthBackground } from "./MobileAuthBackground";
import { UnifolioLogo } from "@/components/UnifolioLogo";

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
    <div className="min-h-dvh lg:h-dvh lg:max-h-dvh w-full bg-[#F8FAF9] dark:bg-[var(--color-bg)] text-[var(--color-ink)] flex flex-col items-center justify-between lg:justify-center p-5 sm:p-6 lg:p-5 xl:p-8 relative box-border overflow-x-hidden selection:bg-[#10B981]/20">
      {/* Soft Painterly Atmospheric Background Lighting */}
      <div
        className="absolute top-0 left-0 w-80 h-80 pointer-events-none opacity-60 dark:opacity-20 transition-opacity"
        style={{
          background:
            "radial-gradient(circle at 10% 10%, rgba(16, 185, 129, 0.12) 0%, rgba(241, 247, 244, 0) 70%)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 right-0 w-96 h-96 pointer-events-none opacity-60 dark:opacity-20 transition-opacity"
        style={{
          background:
            "radial-gradient(circle at 90% 90%, rgba(16, 185, 129, 0.08) 0%, rgba(52, 211, 153, 0.04) 40%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Restrained Ethereal Geometric Background Layer for Mobile */}
      <MobileAuthBackground />

      {/* Mobile Top Brand Header (< lg) */}
      <header className="w-full max-w-sm sm:max-w-md mx-auto flex lg:hidden items-center justify-between z-30 flex-shrink-0 pt-2 sm:pt-3 pb-2">
        <UnifolioLogo className="h-7 sm:h-8" />
      </header>

      {/* Single Unified Container: Integrated seamlessly on mobile, Showcase dual-pane card on desktop */}
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-[980px] lg:max-h-[calc(100vh-2.5rem)] rounded-none lg:rounded-3xl bg-transparent lg:bg-[var(--color-surface)] shadow-none lg:shadow-2xl lg:shadow-black/[0.08] dark:lg:shadow-black/70 border-0 lg:border border-[var(--color-border)] overflow-visible lg:overflow-hidden flex flex-col lg:flex-row lg:h-[min(640px,calc(100vh-2.5rem))] relative z-10 my-0 lg:my-auto flex-1 lg:flex-initial justify-start lg:justify-start pt-5 sm:pt-8 lg:pt-0">
        {/* Left Section: Wealth Architecture Visual (Desktop Only) */}
        <div className="w-[452px] h-full flex-shrink-0 min-h-0 border-r border-[var(--color-border)] bg-[#ECECE8] overflow-hidden hidden lg:flex">
          {visualSlot}
        </div>

        {/* Right Section: Form Container */}
        <div className="flex-1 p-0 lg:p-8 xl:p-10 flex flex-col justify-start lg:justify-between h-full min-h-0 overflow-y-visible lg:overflow-y-auto">
          {/* Desktop Brand Header */}
          <div className="hidden lg:block text-left select-none pb-4">
            <UnifolioLogo className="h-7 sm:h-8" />
          </div>

          {/* Active Form Slot */}
          <div className="w-full relative px-0 lg:px-1 py-1 overflow-visible mt-0 lg:my-auto">
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

      {/* Mobile Safe-Area Bottom Anchor */}
      <div className="lg:hidden pb-[max(env(safe-area-inset-bottom),0.5rem)] flex-shrink-0" />
    </div>
  );
}
