import { motion, useReducedMotion } from "motion/react";
import { isTestEnv, MOTION_EASING_FLOAT } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface UnifolioFluidConvergenceProps {
  className?: string;
}

/**
 * Unifolio Hand-Drawn Wealth Convergence Hero Artwork
 * 
 * Recreates the exact hand-drawn fan-out mutual fund portfolio artwork
 * from the official mobile landing reference design:
 * - Hand-drawn organic folio sheets and financial charts blooming from a central lens
 * - Delicate Unifolio green/mint watercolor wash
 * - Organic floating bubbles and stipple detail
 */
export function UnifolioFluidConvergence({ className = "" }: UnifolioFluidConvergenceProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  return (
    <div
      className={cn(
        "relative select-none pointer-events-none w-full h-full flex items-start justify-end",
        className
      )}
      aria-label="Unifolio Fluid Wealth Convergence Visual"
    >
      {/* Ambient Atmospheric Glow Layers (Unifolio Green Palette) */}
      <div
        className="absolute top-1/3 right-0 -translate-y-1/2 w-[420px] h-[420px] sm:w-[500px] sm:h-[500px] rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.20)_0%,rgba(34,197,94,0.06)_50%,transparent_75%)] dark:bg-[radial-gradient(circle,rgba(34,197,94,0.28)_0%,rgba(34,197,94,0.08)_50%,transparent_80%)] blur-2xl pointer-events-none"
        aria-hidden="true"
      />

      {/* Primary Hand-Drawn Hero Artwork Asset */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98 }}
        animate={
          shouldReduceMotion
            ? { opacity: 1, scale: 1 }
            : {
                opacity: 1,
                scale: 1,
                y: [0, -6, 0],
              }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0.4 }
            : {
                opacity: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
                scale: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
                y: {
                  duration: 5.5,
                  repeat: Infinity,
                  ease: MOTION_EASING_FLOAT,
                },
              }
        }
        className="w-full h-full relative flex items-start justify-end scale-[1.24] sm:scale-[1.30] origin-top-right"
      >
        {/* Light Mode Illustration */}
        <img
          src="/illustrations/landing/mobile_landing_hero.png"
          alt="Scattered mutual fund holdings blossoming into one unified clarity"
          className="w-auto h-full max-h-full max-w-full object-contain object-right-top select-none pointer-events-none block dark:hidden"
          loading="eager"
          decoding="async"
        />

        {/* Dark Mode Illustration */}
        <img
          src="/illustrations/landing/mobile_landing_hero_dark.png"
          alt="Scattered mutual fund holdings blossoming into one unified clarity"
          className="w-auto h-full max-h-full max-w-full object-contain object-right-top filter drop-shadow-[0_0_20px_rgba(34,197,94,0.2)] select-none pointer-events-none hidden dark:block"
          loading="eager"
          decoding="async"
        />
      </motion.div>
    </div>
  );
}
