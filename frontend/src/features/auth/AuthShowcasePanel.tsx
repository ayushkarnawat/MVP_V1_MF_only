import { motion, useReducedMotion } from "motion/react";
import type { AuthStep } from "./AuthShell";
import { isTestEnv, MOTION_EASING } from "@/lib/motion";

interface StepConfig {
  headlinePrefix: string;
  headlineEmphasis: string;
  subtitle: string;
  fraction: number;
  percentageLabel: string;
  metricLabel1: string;
  metricValue1: string;
  metricLabel2: string;
  metricValue2: string;
  metricLabel3: string;
  metricValue3: string;
}

const STEP_CONFIGS: Record<AuthStep, StepConfig> = {
  landing: {
    headlinePrefix: "Visualize, Protect, and Organize Your",
    headlineEmphasis: "Financial Life",
    subtitle: "Access your personal wealth dashboard to manage assets, simulate inheritance, and store important documents.",
    fraction: 0.5,
    percentageLabel: "50%",
    metricLabel1: "Business",
    metricValue1: "15%",
    metricLabel2: "Savings",
    metricValue2: "35%",
    metricLabel3: "Real Estate",
    metricValue3: "50%",
  },
  email: {
    headlinePrefix: "Identify, Verify, and Secure Your",
    headlineEmphasis: "Wealth Identity",
    subtitle: "Securely identifying your account to isolate and organize your mutual fund holdings.",
    fraction: 0.75,
    percentageLabel: "75%",
    metricLabel1: "Large Cap",
    metricValue1: "15%",
    metricLabel2: "Flexi Cap",
    metricValue2: "35%",
    metricLabel3: "Direct MF",
    metricValue3: "50%",
  },
  phone: {
    headlinePrefix: "Identify, Verify, and Secure Your",
    headlineEmphasis: "Wealth Identity",
    subtitle: "Securely identifying your account to isolate and organize your mutual fund holdings.",
    fraction: 0.75,
    percentageLabel: "75%",
    metricLabel1: "Large Cap",
    metricValue1: "15%",
    metricLabel2: "Flexi Cap",
    metricValue2: "35%",
    metricLabel3: "Direct MF",
    metricValue3: "50%",
  },
  email_otp: {
    headlinePrefix: "One Step Closer to Your",
    headlineEmphasis: "Financial Life",
    subtitle: "Confirm your verification code to complete sign-in and open your consolidated dashboard.",
    fraction: 0.9,
    percentageLabel: "90%",
    metricLabel1: "Equity",
    metricValue1: "60%",
    metricLabel2: "Debt",
    metricValue2: "25%",
    metricLabel3: "Hybrid",
    metricValue3: "15%",
  },
  otp: {
    headlinePrefix: "One Step Closer to Your",
    headlineEmphasis: "Financial Life",
    subtitle: "Confirm your verification code to complete sign-in and open your consolidated dashboard.",
    fraction: 0.9,
    percentageLabel: "90%",
    metricLabel1: "Equity",
    metricValue1: "60%",
    metricLabel2: "Debt",
    metricValue2: "25%",
    metricLabel3: "Hybrid",
    metricValue3: "15%",
  },
  link_account: {
    headlinePrefix: "Unify and Protect Your",
    headlineEmphasis: "Financial Universe",
    subtitle: "Link your existing identity method to access your unified portfolio across all devices.",
    fraction: 1.0,
    percentageLabel: "100%",
    metricLabel1: "Direct Plans",
    metricValue1: "80%",
    metricLabel2: "Regular",
    metricValue2: "20%",
    metricLabel3: "Consolidated",
    metricValue3: "100%",
  },
};

// Semicircular gauge constants
const GAUGE_WIDTH = 240;
const GAUGE_HEIGHT = 130;
const GAUGE_CX = 120;
const GAUGE_CY = 120;
const GAUGE_RADIUS = 85;
const GAUGE_ARC_LENGTH = Math.PI * GAUGE_RADIUS; // ~267.035 px

interface AuthShowcasePanelProps {
  step?: AuthStep;
}

export function AuthShowcasePanel({ step = "landing" }: AuthShowcasePanelProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;
  const config = STEP_CONFIGS[step] ?? STEP_CONFIGS.landing;
  const currentFraction = config.fraction;

  // Active gauge stroke offset (from full length 267 down to remaining portion)
  const activeOffset = GAUGE_ARC_LENGTH * (1 - currentFraction);

  // Position of the white circular percentage indicator at the end of the active segment
  // Angle theta: 0% fraction corresponds to 180° (left), 100% fraction corresponds to 0° (right).
  const angleRad = Math.PI - currentFraction * Math.PI;
  const badgeX = GAUGE_CX + GAUGE_RADIUS * Math.cos(angleRad);
  const badgeY = GAUGE_CY - GAUGE_RADIUS * Math.sin(angleRad);

  return (
    <div className="relative w-full h-full min-h-[580px] lg:min-h-[640px] rounded-3xl bg-[#062419] border border-emerald-900/40 p-8 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden select-none text-white shadow-2xl">
      {/* Ambient Radial Depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 45% 28%, rgba(13, 56, 38, 0.95) 0%, rgba(6, 36, 25, 0.98) 60%, rgba(4, 24, 16, 1) 100%)",
        }}
      />

      {/* Background Rounded Rectangular Grid Structure */}
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0.01 : 0.6, ease: MOTION_EASING }}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <svg
          className="w-full h-full object-cover"
          viewBox="0 0 600 700"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Subtle Grid of Rounded Rectangles */}
          <g stroke="rgba(74, 222, 128, 0.12)" strokeWidth="1.5">
            {/* Row 1 */}
            <rect x="20" y="20" width="120" height="120" rx="22" />
            <rect x="160" y="20" width="120" height="120" rx="22" />
            <rect x="300" y="20" width="120" height="120" rx="22" />
            <rect x="440" y="20" width="120" height="120" rx="22" />

            {/* Row 2 */}
            <rect x="20" y="160" width="120" height="120" rx="22" />
            <rect x="160" y="160" width="120" height="120" rx="22" />
            <rect x="300" y="160" width="120" height="120" rx="22" />
            <rect x="440" y="160" width="120" height="120" rx="22" />

            {/* Row 3 */}
            <rect x="20" y="300" width="120" height="120" rx="22" />
            <rect x="160" y="300" width="120" height="120" rx="22" />
            <rect x="300" y="300" width="120" height="120" rx="22" />
            <rect x="440" y="300" width="120" height="120" rx="22" />

            {/* Row 4 */}
            <rect x="20" y="440" width="120" height="120" rx="22" />
            <rect x="160" y="440" width="120" height="120" rx="22" />
            <rect x="300" y="440" width="120" height="120" rx="22" />
            <rect x="440" y="440" width="120" height="120" rx="22" />
          </g>

          {/* Luminous Highlighted Tile at top-left matching reference */}
          <rect
            x="70"
            y="70"
            width="120"
            height="120"
            rx="22"
            stroke="rgba(74, 222, 128, 0.45)"
            strokeWidth="2"
            fill="none"
            className="filter drop-shadow-[0_0_8px_rgba(74,222,128,0.25)]"
          />
        </svg>
      </motion.div>

      {/* Central Translucent Financial Information Card */}
      <div className="relative z-10 w-full max-w-[360px] sm:max-w-[380px] mx-auto mt-2 sm:mt-4">
        <motion.div
          initial={
            shouldReduceMotion
              ? { opacity: 1, y: 0, scale: 1 }
              : { opacity: 0, y: 16, scale: 0.96 }
          }
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          transition={{
            duration: shouldReduceMotion ? 0.01 : 0.5,
            delay: shouldReduceMotion ? 0 : 0.15,
            ease: MOTION_EASING,
          }}
          className="w-full rounded-3xl bg-[#0c3121]/80 backdrop-blur-md border border-emerald-500/20 shadow-2xl p-6 sm:p-7 flex flex-col gap-5 text-left relative overflow-hidden"
        >
          {/* Card Top Highlight Line */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />

          {/* 1. Card Header & Metadata */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: shouldReduceMotion ? 0.01 : 0.4,
              delay: shouldReduceMotion ? 0 : 0.3,
              ease: MOTION_EASING,
            }}
            className="flex items-start justify-between gap-2"
          >
            <div>
              <h3 className="font-sans font-bold text-base text-white tracking-tight leading-tight">
                Asset Distribution
              </h3>
              <p className="font-sans text-[11px] text-emerald-200/60 mt-0.5 font-normal">
                From 1-30 April, 2025
              </p>
            </div>

            <button
              type="button"
              className="font-sans text-xs text-emerald-200 hover:text-white font-medium underline underline-offset-4 cursor-pointer transition-colors"
            >
              View Detail
            </button>
          </motion.div>

          {/* 2. Three Allocation Metrics with Vertical Separators */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            {/* Metric 1 */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: shouldReduceMotion ? 0.01 : 0.35,
                delay: shouldReduceMotion ? 0 : 0.4,
                ease: MOTION_EASING,
              }}
              className="flex items-center gap-2"
            >
              <div className="w-[3px] h-7 rounded-full bg-emerald-700/60 flex-shrink-0" />
              <div className="min-w-0">
                <span className="block text-[10px] sm:text-[11px] text-emerald-200/70 font-medium truncate">
                  {config.metricLabel1}
                </span>
                <span className="block font-sans font-bold text-base sm:text-lg text-white leading-tight">
                  {config.metricValue1}
                </span>
              </div>
            </motion.div>

            {/* Metric 2 */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: shouldReduceMotion ? 0.01 : 0.35,
                delay: shouldReduceMotion ? 0 : 0.5,
                ease: MOTION_EASING,
              }}
              className="flex items-center gap-2"
            >
              <div className="w-[3px] h-7 rounded-full bg-emerald-600/60 flex-shrink-0" />
              <div className="min-w-0">
                <span className="block text-[10px] sm:text-[11px] text-emerald-200/70 font-medium truncate">
                  {config.metricLabel2}
                </span>
                <span className="block font-sans font-bold text-base sm:text-lg text-white leading-tight">
                  {config.metricValue2}
                </span>
              </div>
            </motion.div>

            {/* Metric 3 */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: shouldReduceMotion ? 0.01 : 0.35,
                delay: shouldReduceMotion ? 0 : 0.6,
                ease: MOTION_EASING,
              }}
              className="flex items-center gap-2"
            >
              <div className="w-[3px] h-7 rounded-full bg-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.6)] flex-shrink-0" />
              <div className="min-w-0">
                <span className="block text-[10px] sm:text-[11px] text-emerald-200/70 font-medium truncate">
                  {config.metricLabel3}
                </span>
                <span className="block font-sans font-bold text-base sm:text-lg text-white leading-tight">
                  {config.metricValue3}
                </span>
              </div>
            </motion.div>
          </div>

          {/* 3. Semicircular Allocation Gauge Visualization */}
          <div className="relative flex justify-center items-center pt-2">
            <svg
              width={GAUGE_WIDTH}
              height={GAUGE_HEIGHT}
              viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}
              className="overflow-visible"
              aria-label={`Allocation Gauge ${config.percentageLabel}`}
            >
              <defs>
                <linearGradient id="activeGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#4ade80" />
                  <stop offset="100%" stopColor="#86efac" />
                </linearGradient>
              </defs>

              {/* Base Muted Gauge Track */}
              <path
                d={`M ${GAUGE_CX - GAUGE_RADIUS} ${GAUGE_CY} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${GAUGE_CX + GAUGE_RADIUS} ${GAUGE_CY}`}
                fill="none"
                stroke="rgba(74, 222, 128, 0.22)"
                strokeWidth="24"
                strokeLinecap="round"
              />

              {/* Progressive Active Gauge Segment */}
              <motion.path
                d={`M ${GAUGE_CX - GAUGE_RADIUS} ${GAUGE_CY} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${GAUGE_CX + GAUGE_RADIUS} ${GAUGE_CY}`}
                fill="none"
                stroke="url(#activeGaugeGradient)"
                strokeWidth="24"
                strokeLinecap="round"
                strokeDasharray={GAUGE_ARC_LENGTH}
                initial={
                  shouldReduceMotion
                    ? { strokeDashoffset: activeOffset }
                    : { strokeDashoffset: GAUGE_ARC_LENGTH }
                }
                animate={{
                  strokeDashoffset: activeOffset,
                }}
                transition={{
                  duration: shouldReduceMotion ? 0.01 : 0.75,
                  delay: shouldReduceMotion ? 0 : 0.7,
                  ease: MOTION_EASING,
                }}
              />
            </svg>

            {/* White Circular Percentage Indicator Badge at Active Tip */}
            <motion.div
              initial={
                shouldReduceMotion
                  ? { opacity: 1, scale: 1 }
                  : { opacity: 0, scale: 0.4 }
              }
              animate={{
                opacity: 1,
                scale: 1,
                left: `${(badgeX / GAUGE_WIDTH) * 100}%`,
                top: `${(badgeY / GAUGE_HEIGHT) * 100}%`,
              }}
              transition={{
                duration: shouldReduceMotion ? 0.01 : 0.4,
                delay: shouldReduceMotion ? 0 : 1.2,
                ease: MOTION_EASING,
              }}
              style={{
                transform: "translate(-50%, -50%)",
              }}
              className="absolute w-12 h-12 rounded-full bg-white text-[#062419] font-bold text-xs sm:text-sm shadow-xl flex items-center justify-center font-sans tracking-tight select-none border border-black/5"
            >
              {config.percentageLabel}
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Editorial Serif Headline & Supporting Description */}
      <div className="relative z-10 mt-auto pt-6 text-center max-w-md mx-auto space-y-2.5">
        <motion.h2
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: shouldReduceMotion ? 0.01 : 0.5,
            delay: shouldReduceMotion ? 0 : 1.35,
            ease: MOTION_EASING,
          }}
          className="font-serif text-2xl sm:text-3xl lg:text-[34px] xl:text-[36px] text-white font-normal leading-[1.18] tracking-tight"
        >
          {config.headlinePrefix}{" "}
          <em className="italic font-serif text-[#86efac] not-italic-none">
            {config.headlineEmphasis}
          </em>
        </motion.h2>

        <motion.p
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: shouldReduceMotion ? 0.01 : 0.45,
            delay: shouldReduceMotion ? 0 : 1.55,
            ease: MOTION_EASING,
          }}
          className="text-xs sm:text-sm text-emerald-100/70 font-sans leading-relaxed max-w-sm sm:max-w-md mx-auto font-normal"
        >
          {config.subtitle}
        </motion.p>
      </div>
    </div>
  );
}
