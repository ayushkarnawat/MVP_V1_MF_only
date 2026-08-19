import { motion, useReducedMotion } from "motion/react";
import type { AuthStep } from "./AuthShell";
import { isTestEnv } from "@/lib/motion";

// Module-level flag so the reveal animation plays ONLY ONCE per full page load.
// Navigating between auth steps (landing, email, phone, otp, etc.) or form re-renders will NEVER replay or reset the animation.
let hasAnimatedInSession = false;

interface AuthShowcasePanelProps {
  step?: AuthStep;
}

const HEADLINE_LINES = ["Stop Guessing.", "Start Systemizing."];
const SUPPORT_LINE =
  "Every folio, every family member — reconciled into one number you can trust.";

export function AuthShowcasePanel({ step = "landing" }: AuthShowcasePanelProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;
  const isInstant = hasAnimatedInSession || shouldReduceMotion;

  // Step-responsive subtle presence enhancement: once the user has moved
  // past the landing screen, the ambient arc and wordmark read very slightly
  // more present — a quiet "we've moved forward" signal, not a new element.
  const isProgressed = step !== "landing";
  const arcOpacity = isProgressed ? 0.22 : 0.14;
  const wordmarkOpacity = isProgressed ? 0.85 : 0.68;

  const lineTransition = (delay: number) =>
    isInstant
      ? { duration: 0 }
      : { duration: 0.95, delay, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className="relative w-full h-full min-h-[580px] lg:min-h-[640px] rounded-lg bg-[var(--auth-panel-bg)] border border-emerald-950/60 p-6 sm:p-8 lg:p-10 flex flex-col overflow-hidden text-[var(--auth-panel-ink)] shadow-2xl">
      {/* 1. Ambient Depth Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 60% 12%, var(--auth-panel-bg-2) 0%, var(--auth-panel-bg) 58%, #010302 100%)",
        }}
      />

      {/* 2. Static grain texture — material depth only, never animates */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-50 mix-blend-overlay"
        aria-hidden="true"
      >
        <filter id="auth-panel-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#auth-panel-grain)" />
      </svg>

      {/* 3. Ambient brand-arc texture — logomark geometry at large scale, decorative only */}
      <motion.svg
        className="absolute -top-[18%] -right-[26%] w-[150%] h-[150%] pointer-events-none"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        initial={isInstant ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={isInstant ? { duration: 0 } : { duration: 2.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <path d="M20 185 A160 160 0 0 1 185 20" fill="none" stroke="var(--auth-panel-glow)" strokeWidth="1" opacity={arcOpacity} />
        <path d="M46 190 A150 150 0 0 1 190 46" fill="none" stroke="var(--auth-panel-ghost)" strokeWidth="0.6" opacity={arcOpacity + 0.04} />
      </motion.svg>

      {/* 4. Quiet wordmark — asymmetric composition anchor, not a repeated brand lockup */}
      <motion.p
        className="relative z-10 text-[0.62rem] font-semibold tracking-[0.22em] uppercase text-[var(--auth-panel-ink-soft)] font-body"
        initial={isInstant ? { opacity: wordmarkOpacity } : { opacity: 0 }}
        animate={{ opacity: wordmarkOpacity }}
        transition={isInstant ? { duration: 0 } : { duration: 0.6, delay: 0.1, ease: "easeOut" }}
      >
        Unifolio
      </motion.p>

      {/* 5. Hero statement — anchored to the lower third, real headroom above */}
      <div className="relative z-10 flex-1 flex flex-col justify-end gap-3 pb-1.5">
        <p className="font-display font-extrabold tracking-tight text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.08] text-[var(--auth-panel-ink)]">
          {HEADLINE_LINES.map((line, i) => (
            <motion.span
              key={line}
              className="block"
              initial={
                isInstant
                  ? { opacity: 1, y: 0, filter: "blur(0px)" }
                  : { opacity: 0, y: 16, filter: "blur(6px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={lineTransition(i * 0.16)}
            >
              {line}
            </motion.span>
          ))}
        </p>
        <motion.p
          className="max-w-[34ch] text-sm text-[var(--auth-panel-ink-soft)] font-body leading-relaxed"
          initial={isInstant ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={lineTransition(0.62)}
          onAnimationComplete={() => {
            hasAnimatedInSession = true;
          }}
        >
          {SUPPORT_LINE}
        </motion.p>
      </div>

      {/* 6. Trust footer — unchanged */}
      <div className="relative z-10 text-center max-w-sm sm:max-w-md mx-auto space-y-1 mt-6">
        <p className="text-xs sm:text-sm text-neutral-400 font-body font-normal leading-relaxed">
          Most investors manage wealth in scattered silos.
        </p>
        <p className="text-xs sm:text-sm text-[var(--auth-panel-glow)] font-body font-medium leading-relaxed">
          Disciplined portfolios run on a systematic engine.
        </p>
      </div>
    </div>
  );
}
