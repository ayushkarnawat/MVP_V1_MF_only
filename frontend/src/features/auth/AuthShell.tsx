import { useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { isTestEnv } from "@/lib/motion";
import { MobileAuthBackground, AuthRoadmapSvg } from "./MobileAuthBackground";
import { useMobileJourney } from "./mobileJourneyContext";
import type { MobileJourneyStep } from "./mobileJourneyContext";

export type AuthStep = "landing" | "email" | "phone" | "otp" | "email_otp" | "link_account";

interface AuthShellProps {
  step: AuthStep;
  formSlot: ReactNode;
  visualSlot: ReactNode;
  stepIndex?: number;
  authMode?: "login" | "signup";
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
    x: direction > 0 ? 20 : -18,
    y: direction > 0 ? 12 : -10,
    opacity: 0,
    scale: 0.985,
  }),
  center: {
    x: 0,
    y: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -18 : 20,
    y: direction > 0 ? -10 : 12,
    opacity: 0,
    scale: 0.985,
  }),
};

export function AuthShell({ step, formSlot, visualSlot, stepIndex, authMode }: AuthShellProps) {
  const prevStepRef = useRef<AuthStep>(step);
  const shouldReduceMotion = useReducedMotion() || isTestEnv;
  const journey = useMobileJourney();

  const prevOrder = STEP_ORDER[prevStepRef.current] ?? 0;
  const currentOrder = STEP_ORDER[step] ?? 0;
  // If moving between same order (e.g. phone <-> email), treat as forward if switching to email/phone
  const direction = currentOrder !== prevOrder ? (currentOrder >= prevOrder ? 1 : -1) : 1;

  const currentJourneyStep = `auth_${step}` as MobileJourneyStep;

  useEffect(() => {
    prevStepRef.current = step;
    journey?.setJourneyStep(currentJourneyStep, stepIndex, authMode);
  }, [step, journey, currentJourneyStep, stepIndex, authMode]);

  return (
    <div className="min-h-dvh lg:h-dvh lg:max-h-dvh w-full bg-[#F8FAF9] dark:bg-[var(--color-bg)] text-[var(--color-ink)] flex flex-col items-center justify-between lg:justify-center p-5 sm:p-6 lg:p-5 xl:p-8 relative box-border overflow-x-hidden selection:bg-[#22C55E]/20">
      {/* Soft Painterly Atmospheric Background Lighting */}
      <div
        className="absolute top-0 left-0 w-80 h-80 pointer-events-none opacity-60 dark:opacity-20 transition-opacity"
        style={{
          background:
            "radial-gradient(circle at 10% 10%, rgba(34, 197, 94, 0.12) 0%, rgba(241, 247, 244, 0) 70%)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 right-0 w-96 h-96 pointer-events-none opacity-60 dark:opacity-20 transition-opacity"
        style={{
          background:
            "radial-gradient(circle at 90% 90%, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.04) 40%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Restrained Ethereal Geometric Background Layer for Mobile (strictly lg:hidden) */}
      <MobileAuthBackground
        activeStep={currentJourneyStep}
        stepIndex={stepIndex}
        authMode={authMode}
      />

      {/* Single Unified Container: Integrated seamlessly on mobile, Showcase dual-pane card on desktop */}
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-[980px] lg:max-h-[calc(100vh-2.5rem)] rounded-none lg:rounded-3xl bg-transparent lg:bg-[var(--color-surface)] shadow-none lg:shadow-2xl lg:shadow-black/[0.08] dark:lg:shadow-black/70 border-0 lg:border border-[var(--color-border)] overflow-visible lg:overflow-hidden flex flex-col lg:flex-row lg:h-[min(640px,calc(100vh-2.5rem))] relative z-10 my-0 lg:my-auto flex-1 lg:flex-initial justify-start lg:justify-start pt-5 sm:pt-8 lg:pt-0">
        {/* Left Section: Wealth Architecture Visual (Desktop Only) */}
        <div className="w-[452px] h-full flex-shrink-0 min-h-0 border-r border-[var(--color-border)] bg-[#ECECE8] overflow-hidden hidden lg:flex">
          {visualSlot}
        </div>

        {/* Right Section: Form Container + Embedded Desktop Journey Roadmap */}
        <div className="flex-1 p-0 lg:px-8 lg:py-4 xl:px-10 xl:py-5 flex flex-col justify-start lg:justify-between h-full min-h-0 overflow-y-visible lg:overflow-hidden">
          {/* Active Form Slot */}
          <div className="w-full relative px-0 lg:px-1 py-0 overflow-visible mt-0 lg:my-auto">
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
                    duration: 0.6,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="w-full"
                >
                  {formSlot}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Web Desktop Authentication Journey Roadmap (Exact match to Mobile appearance & behavior) */}
          <div
            className="hidden lg:flex w-[calc(100%+4rem)] xl:w-[calc(100%+5rem)] -mx-8 xl:-mx-10 justify-center items-center mt-1 mb-10 xl:mb-12 h-20 xl:h-[86px] flex-shrink-0 select-none pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            <AuthRoadmapSvg
              activeStep={currentJourneyStep}
              stepIndex={stepIndex}
              authMode={authMode}
              isDesktop={true}
              className="w-full h-full text-[var(--color-ink)]"
            />
          </div>
        </div>
      </div>

      {/* Mobile Safe-Area Bottom Anchor */}
      <div className="lg:hidden pb-[max(env(safe-area-inset-bottom),0.5rem)] flex-shrink-0" />
    </div>
  );
}
