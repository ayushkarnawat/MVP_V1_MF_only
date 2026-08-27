import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { UnifolioFluidConvergence } from "./UnifolioFluidConvergence";
import { isTestEnv, MOTION_EASING } from "@/lib/motion";
import { ArrowRight } from "lucide-react";

export interface MobileLandingPageProps {
  onGetStarted: () => void;
  onLogin?: () => void;
}

export function MobileLandingPage({
  onGetStarted,
}: MobileLandingPageProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  return (
    <div className="h-dvh max-h-dvh w-full bg-[#FCFCFC] dark:bg-[var(--color-bg)] text-[var(--color-ink)] flex flex-col justify-between px-6 sm:px-8 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),2rem)] box-border overflow-hidden relative selection:bg-[#22C55E]/20">
      {/* Soft Painterly Atmospheric Background Lighting */}
      <div
        className="absolute top-0 right-0 w-[450px] h-[450px] pointer-events-none opacity-70 dark:opacity-20 transition-opacity"
        style={{
          background:
            "radial-gradient(circle at 85% 25%, rgba(34, 197, 94, 0.14) 0%, rgba(34, 197, 94, 0.03) 55%, transparent 75%)",
        }}
        aria-hidden="true"
      />

      {/* 1. Main Content: Upper-Right Hero Artwork & Anchored Headline */}
      <main className="w-full flex-1 min-h-0 relative flex flex-col justify-between z-20">
        {/* Large, Bold Hero Illustration shifted right and positioned downward */}
        <div className="absolute top-3 sm:top-5 min-[400px]:top-6 -right-14 sm:-right-20 min-[400px]:-right-24 translate-x-6 sm:translate-x-8 w-[114vw] max-w-[540px] h-[72vh] min-[390px]:h-[76vh] sm:h-[80vh] pointer-events-none flex items-start justify-end z-10 overflow-visible">
          <UnifolioFluidConvergence className="w-full h-full" />
        </div>

        {/* Vertical Spacer */}
        <div className="flex-1 min-h-[36vh] pointer-events-none" />

        {/* 2. Bold Left-Aligned Editorial Headline */}
        <motion.h1
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: shouldReduceMotion ? 0 : 0.15, ease: MOTION_EASING }}
          className="w-full text-left font-display font-extrabold text-[36px] min-[360px]:text-[38px] min-[390px]:text-[42px] sm:text-[44px] tracking-tight leading-[1.08] select-none relative z-20 mb-6 max-w-[280px] min-[390px]:max-w-[310px]"
        >
          <span className="text-[#22C55E] block">Scattered</span>
          <span className="block text-[var(--color-ink)] whitespace-pre-line">
            {"holdings,\none clear\npicture"}<span className="text-[#22C55E]">.</span>
          </span>
        </motion.h1>
      </main>

      {/* 3. Bottom Action Area: Unifolio Green Pill CTA */}
      <footer className="w-full mx-auto flex-shrink-0 z-30">
        <Button
          size="lg"
          onClick={onGetStarted}
          className="w-full h-14 sm:h-16 px-8 rounded-full font-bold text-[16.5px] sm:text-[17.5px] bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white shadow-[0_12px_28px_-6px_rgba(34,197,94,0.38)] dark:shadow-[0_12px_28px_-6px_rgba(34,197,94,0.3)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 border-0"
        >
          <span>Get Started</span>
          <ArrowRight className="h-5 w-5 stroke-[2.5]" />
        </Button>
      </footer>
    </div>
  );
}
