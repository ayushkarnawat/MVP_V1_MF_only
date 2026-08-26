import { motion, useReducedMotion } from "motion/react";
import { isTestEnv } from "@/lib/motion";
import glassSculptureImg from "@/assets/landing-glass-sculpture.png";
import { cn } from "@/lib/utils";

interface UnifolioFluidConvergenceProps {
  className?: string;
}

/**
 * Unifolio Fluid Convergence Hero Sculpture
 * 
 * Recreates the exact 3D translucent flowing portfolio forms from the reference image:
 * - Multi-tonal emerald, mint, jade, and sage flowing glass ribbons
 * - Deep forest green glass vortex core
 * - Floating translucent glass bubbles and specular highlights
 */
export function UnifolioFluidConvergence({ className = "" }: UnifolioFluidConvergenceProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  return (
    <div
      className={cn(
        "relative select-none pointer-events-none w-full h-full flex items-center justify-center",
        className
      )}
      aria-label="Unifolio Fluid Wealth Convergence Visual"
    >
      {/* Ambient Atmospheric Glow Layers (Unifolio Green Palette) */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] rounded-full bg-[radial-gradient(circle,rgba(4,144,91,0.16)_0%,rgba(52,211,153,0.08)_45%,transparent_75%)] dark:bg-[radial-gradient(circle,rgba(4,144,91,0.22)_0%,rgba(52,211,153,0.12)_45%,transparent_80%)] blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* Primary 3D Glass Sculpture Asset */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }}
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
                  ease: "easeInOut",
                },
              }
        }
        className="w-full h-full relative flex items-center justify-center"
      >
        <img
          src={glassSculptureImg}
          alt="Translucent Flowing Mutual Fund Portfolio Forms"
          className="w-full h-full max-h-[58vh] min-[400px]:max-h-[61vh] max-w-[96vw] sm:max-w-md object-contain object-center filter drop-shadow-[0_16px_36px_rgba(4,144,91,0.14)] dark:drop-shadow-[0_20px_40px_rgba(4,144,91,0.25)] select-none pointer-events-none"
          loading="eager"
          decoding="async"
        />
      </motion.div>
    </div>
  );
}
