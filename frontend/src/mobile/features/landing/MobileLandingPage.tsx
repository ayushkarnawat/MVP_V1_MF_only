import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { UnifolioFluidConvergence } from "./UnifolioFluidConvergence";
import { UnifolioLogo } from "@/components/UnifolioLogo";
import { isTestEnv } from "@/lib/motion";
import { ArrowRight } from "lucide-react";

export interface MobileLandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

export function MobileLandingPage({
  onGetStarted,
  onLogin,
}: MobileLandingPageProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  return (
    <div className="h-dvh max-h-dvh w-full bg-[#F9F9F9] dark:bg-[var(--color-bg)] text-[var(--color-ink)] flex flex-col justify-between px-5 sm:px-6 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)] box-border overflow-hidden relative selection:bg-[#04905B]/20">
      {/* Soft Painterly Atmospheric Background Lighting */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 pointer-events-none opacity-70 dark:opacity-20 transition-opacity"
        style={{
          background:
            "radial-gradient(circle at 50% 12%, rgba(4, 144, 91, 0.08) 0%, rgba(52, 211, 153, 0.03) 40%, transparent 65%)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 right-0 w-96 h-96 pointer-events-none opacity-40 dark:opacity-15 transition-opacity"
        style={{
          background:
            "radial-gradient(circle at 90% 90%, rgba(4, 144, 91, 0.05) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />

      {/* 1. Top Header: Official Unifolio Brand Wordmark at Upper-Left */}
      <header className="w-full max-w-sm sm:max-w-md mx-auto flex items-center justify-start z-30 flex-shrink-0 pt-1.5 sm:pt-2 pb-0 px-1">
        <UnifolioLogo className="h-7 sm:h-7.5" />
      </header>

      {/* 2. Hero Visual Section: Shifted higher to sit directly beneath the logo, scaled up significantly */}
      <main className="w-full flex-1 min-h-0 max-w-sm sm:max-w-md mx-auto relative flex flex-col items-center justify-center -mt-3 sm:-mt-5 z-20">
        <div className="w-full flex-1 min-h-0 flex items-center justify-center">
          <UnifolioFluidConvergence className="w-full h-full" />
        </div>

        {/* Headline positioned immediately beneath the illustration */}
        <motion.h1
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: shouldReduceMotion ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="w-full text-center font-display font-bold text-[17.5px] min-[360px]:text-[19px] min-[375px]:text-[20px] min-[390px]:text-[21.5px] sm:text-[23.5px] tracking-tight text-[var(--color-ink)] select-none whitespace-nowrap px-1 mt-1 sm:mt-1.5 mb-1"
        >
          <span className="text-[#04905B] dark:text-[#10B981]">Scattered</span> holdings, one clear picture.
        </motion.h1>
      </main>

      {/* 3. Bottom Action Area: Pill CTA & Login Trigger */}
      <footer className="w-full max-w-sm sm:max-w-md mx-auto flex-shrink-0 space-y-2.5 px-1 pb-1 z-30">
        <Button
          size="lg"
          onClick={onGetStarted}
          className="w-full h-14 sm:h-[58px] px-8 rounded-full font-bold text-[16px] sm:text-[17px] bg-[#04905B] hover:bg-[#03784C] dark:bg-[#04905B] dark:hover:bg-[#03784C] text-white shadow-xl shadow-[#04905B]/25 dark:shadow-[#04905B]/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border-0"
        >
          <span>Get Started</span>
          <ArrowRight className="h-5 w-5 stroke-[2.2]" />
        </Button>

        <div className="flex items-center justify-center pt-0.5">
          <button
            onClick={onLogin}
            type="button"
            className="text-[13.5px] font-medium text-[#374151] dark:text-[#9CA3AF] hover:text-[var(--color-ink)] transition-colors py-0.5 px-3 cursor-pointer focus-visible:outline-none focus-visible:underline"
          >
            Already have an account?{" "}
            <span className="text-[#04905B] dark:text-[#10B981] font-semibold">Log in</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
