import { motion, useReducedMotion } from "motion/react";
import { isTestEnv } from "@/lib/motion";
import type { MobileJourneyStep } from "./mobileJourneyContext";
import { getAuthStage, getLoginAuthStage, useMobileJourney } from "./mobileJourneyContext";

export interface MobileAuthBackgroundProps {
  activeStep?: MobileJourneyStep;
  stepIndex?: number;
  authMode?: "login" | "signup";
  className?: string;
  isDesktop?: boolean;
}

/**
 * 4 Chronological Milestones along the Signup Journey:
 * Milestone 1 (Email) -> Milestone 2 (Email OTP) -> Milestone 3 (Phone) -> Milestone 4 (Phone OTP)
 */
const SIGNUP_MILESTONES = [
  { id: "milestone-email", stepIndex: 0, x: 36, y: 38, label: "Email" },
  { id: "milestone-email-otp", stepIndex: 1, x: 136, y: 22, label: "Email OTP" },
  { id: "milestone-phone", stepIndex: 2, x: 238, y: 38, label: "Phone" },
  { id: "milestone-phone-otp", stepIndex: 3, x: 340, y: 22, label: "Phone OTP" },
];

const SIGNUP_ROUTE_PATH_D =
  "M 0 41 C 12 41, 24 39, 36 38 C 70 26, 106 21, 136 22 C 168 23, 204 39, 238 38 C 270 37, 306 23, 340 22 C 352 22, 364 23, 375 25";

/**
 * 2 Chronological Milestones along the Login Journey:
 * Step 1: Phone / Email Entry (x: 36, y: 38) -> Step 2: OTP Verification (x: 340, y: 22)
 * Aligns perfectly with the start and end of the organic curve so the marker never shifts on Sign-up -> Login switch.
 */
const LOGIN_MILESTONES = [
  { id: "login-milestone-entry", stepIndex: 0, x: 36, y: 38, label: "Phone / Email" },
  { id: "login-milestone-otp", stepIndex: 1, x: 340, y: 22, label: "OTP Verification" },
];

const LOGIN_ROUTE_PATH_D = SIGNUP_ROUTE_PATH_D;

/**
 * AuthRoadmapSvg
 *
 * Living authentication roadmap journey component (shared across Web and Mobile).
 * Features:
 * - Adaptive mode support: exactly 2 milestones for Login (Phone/Email -> OTP), 4 milestones for Signup.
 * - Fluid Unifolio-green active path with radiant ambient underglow.
 * - Alive spring traveler physics and continuous breathing animation for the Unifolio ring.
 * - Clear visual hierarchy: Completed (green) -> Active (green + ripple + float) -> Upcoming (clearly visible soft sage/gray-green).
 * - Narrative authentication stage illustrations with pop/lift and subtle unlock glow.
 */
export function AuthRoadmapSvg({
  activeStep: propActiveStep,
  stepIndex: propStepIndex,
  authMode: propAuthMode,
  className = "",
  isDesktop = false,
}: MobileAuthBackgroundProps = {}) {
  const context = useMobileJourney();
  const rawActiveStep = propActiveStep ?? context?.activeStep ?? "auth_landing";
  const explicitStepIndex = propStepIndex ?? context?.stepIndex;
  const isLoginMode = (propAuthMode ?? context?.authMode) === "login";

  const stageInfo = isLoginMode
    ? getLoginAuthStage(rawActiveStep, explicitStepIndex)
    : getAuthStage(rawActiveStep, explicitStepIndex);

  const milestones = isLoginMode ? LOGIN_MILESTONES : SIGNUP_MILESTONES;
  const routePathD = isLoginMode ? LOGIN_ROUTE_PATH_D : SIGNUP_ROUTE_PATH_D;
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  const currentMilestone = milestones[stageInfo.stepIndex] ?? milestones[0];
  const ringSize = 17;

  return (
    <svg
      viewBox="0 0 375 60"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Soft background harmonic sketch trace gradient */}
        <linearGradient id="soft-glass-stream-bottom" x1="26" y1="30" x2="350" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.0" />
          <stop offset="20%" stopColor="#22C55E" stopOpacity="0.06" />
          <stop offset="80%" stopColor="#22C55E" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0.0" />
        </linearGradient>

        {/* Upcoming guide track gradient */}
        <linearGradient id="auth-guide-trail-bottom" x1="28" y1="30" x2="348" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.22" />
          <stop offset="40%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="80%" stopColor="#22C55E" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0.22" />
        </linearGradient>

        {/* Active path flowing Unifolio green gradient */}
        <linearGradient id="auth-active-trail-bottom" x1="28" y1="30" x2="348" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#22C55E" stopOpacity="1.0" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="1.0" />
        </linearGradient>

        {/* Active Node halo glow */}
        <radialGradient id="active-node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.38" />
          <stop offset="55%" stopColor="#22C55E" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0.0" />
        </radialGradient>

        {/* Soft Milestone Unlock Glow */}
        <radialGradient id="milestone-unlock-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#22C55E" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0.0" />
        </radialGradient>
      </defs>

      {/* Connected Authentication Journey Stages */}
      <g className="text-[var(--color-ink)] select-none pointer-events-none transition-all duration-300">
        {isLoginMode ? (
          /* =========================================================================
             LOGIN ROADMAP (2 Milestones: Step 1 Phone/Email -> Step 2 OTP Verification)
             ========================================================================= */
          <>
            {/* Login Stage 1: Phone / Email Entry (at x: 36, y: 16 above Milestone 1) */}
            <motion.g
              key={`login-stage-1-${stageInfo.stepIndex >= 0}`}
              className="transition-all duration-300"
              transform={isDesktop ? "translate(5.4, 4.4) scale(0.85)" : undefined}
              style={{
                transformOrigin: "36px 16px",
              }}
              initial={false}
              animate={
                shouldReduceMotion
                  ? { opacity: stageInfo.stepIndex >= 0 ? 1.0 : 0.4 }
                  : stageInfo.stepIndex === 0
                  ? {
                      opacity: 1.0,
                      scale: [1, 1.14, 1],
                      y: [0, -1.8, 0],
                      transition: {
                        scale: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
                        y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.55 },
                      },
                    }
                  : {
                      opacity: 1.0,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.4 },
                    }
              }
            >
              {/* Soft Unlock Glow behind icon */}
              {stageInfo.stepIndex >= 0 && (
                <motion.circle
                  cx={36}
                  cy={16}
                  r={13}
                  fill="url(#milestone-unlock-glow)"
                  initial={stageInfo.stepIndex === 0 ? { opacity: 0, scale: 0.7 } : { opacity: 0.2, scale: 1 }}
                  animate={stageInfo.stepIndex === 0 ? { opacity: [0, 0.6, 0.25], scale: [0.7, 1.25, 1] } : { opacity: 0.18, scale: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              )}
              {/* Envelope Body */}
              <rect
                x={27}
                y={11}
                width={12}
                height={9}
                rx={1.5}
                stroke="currentColor"
                strokeWidth={stageInfo.stepIndex >= 0 ? 1.25 : 1.0}
                fill="var(--color-bg)"
              />
              {/* Envelope Flap */}
              <path
                d="M 27 11 L 33 15 L 39 11"
                stroke="#22C55E"
                strokeWidth={stageInfo.stepIndex >= 0 ? 1.2 : 0.95}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Smartphone Device Beside Envelope */}
              <rect
                x={39}
                y={8.5}
                width={7.5}
                height={12.5}
                rx={1.5}
                stroke="currentColor"
                strokeWidth={stageInfo.stepIndex >= 0 ? 1.25 : 1.0}
                fill="var(--color-bg)"
              />
              <path
                d="M 41 10.5 L 44.5 10.5"
                stroke="currentColor"
                strokeWidth={0.7}
                strokeLinecap="round"
              />
              <circle
                cx={42.75}
                cy={18.5}
                r={0.65}
                fill="#22C55E"
              />
              {/* Connection Guide Trace */}
              <path
                d="M 36 23 L 36 30"
                stroke="#22C55E"
                strokeWidth={0.8}
                strokeDasharray="1.5 2"
                strokeOpacity={stageInfo.stepIndex >= 0 ? 0.75 : 0.3}
              />
            </motion.g>

            {/* Login Stage 2: OTP Verification (at x: 340, y: 44 below Milestone 2) */}
            <motion.g
              key={`login-stage-2-${stageInfo.stepIndex >= 1}`}
              className="transition-all duration-300"
              transform={isDesktop ? "translate(51, 2.6) scale(0.85)" : undefined}
              style={{
                transformOrigin: "340px 44px",
              }}
              initial={false}
              animate={
                shouldReduceMotion
                  ? { opacity: stageInfo.stepIndex >= 1 ? 1.0 : 0.4 }
                  : stageInfo.stepIndex === 1
                  ? {
                      opacity: 1.0,
                      scale: [1, 1.14, 1],
                      y: [0, -1.8, 0],
                      transition: {
                        scale: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
                        y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.55 },
                      },
                    }
                  : {
                      opacity: 0.4,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.4 },
                    }
              }
            >
              {/* Soft Unlock Glow behind icon when reached */}
              {stageInfo.stepIndex >= 1 && (
                <motion.circle
                  cx={340}
                  cy={44}
                  r={13}
                  fill="url(#milestone-unlock-glow)"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: [0, 0.6, 0.25], scale: [0.7, 1.25, 1] }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              )}
              {/* Passcode / Shield Card */}
              <rect
                x={333}
                y={37}
                width={14}
                height={14}
                rx={2.5}
                stroke="currentColor"
                strokeWidth={stageInfo.stepIndex >= 1 ? 1.25 : 1.0}
                fill="var(--color-bg)"
              />
              {/* 4 OTP Segmented Cells */}
              <rect x={335.5} y={40} width={2} height={2.8} rx={0.5} fill="#22C55E" fillOpacity={stageInfo.stepIndex >= 1 ? 0.95 : 0.4} />
              <rect x={338.5} y={40} width={2} height={2.8} rx={0.5} fill="#22C55E" fillOpacity={stageInfo.stepIndex >= 1 ? 0.95 : 0.4} />
              <rect x={341.5} y={40} width={2} height={2.8} rx={0.5} fill="#22C55E" fillOpacity={stageInfo.stepIndex >= 1 ? 0.95 : 0.4} />
              <rect x={344.5} y={40} width={2} height={2.8} rx={0.5} fill="#22C55E" fillOpacity={stageInfo.stepIndex >= 1 ? 0.95 : 0.4} />
              {/* Verified Checkmark beneath cells */}
              <path
                d="M 337.5 46.5 L 339.5 48.5 L 343 45"
                stroke="#22C55E"
                strokeWidth={stageInfo.stepIndex >= 1 ? 1.3 : 0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Connection Guide Trace */}
              <path
                d="M 340 28 L 340 34"
                stroke="#22C55E"
                strokeWidth={0.8}
                strokeDasharray="1.5 2"
                strokeOpacity={stageInfo.stepIndex >= 1 ? 0.75 : 0.3}
              />
            </motion.g>
          </>
        ) : (
          /* =========================================================================
             SIGNUP ROADMAP (4 Milestones: Email -> Email OTP -> Phone -> Phone OTP)
             ========================================================================= */
          <>
            {/* Stage 1: Email Entry (Hand-drawn envelope at x: 36, y: 16 above Milestone 1) */}
            <motion.g
              key={`stage-1-${stageInfo.stepIndex >= 0}`}
              className="transition-all duration-300"
              transform={isDesktop ? "translate(5.4, 4.4) scale(0.85)" : undefined}
              style={{
                transformOrigin: "36px 16px",
              }}
              initial={false}
              animate={
                shouldReduceMotion
                  ? { opacity: stageInfo.stepIndex >= 0 ? 1.0 : 0.4 }
                  : stageInfo.stepIndex === 0
                  ? {
                      opacity: 1.0,
                      scale: [1, 1.14, 1],
                      y: [0, -1.8, 0],
                      transition: {
                        scale: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
                        y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.55 },
                      },
                    }
                  : stageInfo.stepIndex > 0
                  ? {
                      opacity: 1.0,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.4 },
                    }
                  : {
                      opacity: 0.4,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.4 },
                    }
              }
            >
              {/* Soft Unlock Glow behind icon */}
              {stageInfo.stepIndex >= 0 && (
                <motion.circle
                  cx={36}
                  cy={16}
                  r={13}
                  fill="url(#milestone-unlock-glow)"
                  initial={stageInfo.stepIndex === 0 ? { opacity: 0, scale: 0.7 } : { opacity: 0.2, scale: 1 }}
                  animate={stageInfo.stepIndex === 0 ? { opacity: [0, 0.6, 0.25], scale: [0.7, 1.25, 1] } : { opacity: 0.18, scale: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              )}
              {/* Envelope Body */}
              <rect
                x={29}
                y={11}
                width={14}
                height={10}
                rx={1.5}
                stroke="currentColor"
                strokeWidth={stageInfo.stepIndex >= 0 ? 1.25 : 1.0}
                fill="var(--color-bg)"
              />
              {/* Envelope Flap */}
              <path
                d="M 29 11 L 36 16 L 43 11"
                stroke="#22C55E"
                strokeWidth={stageInfo.stepIndex >= 0 ? 1.2 : 0.95}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Connection Guide Trace */}
              <path
                d="M 36 23 L 36 30"
                stroke="#22C55E"
                strokeWidth={0.8}
                strokeDasharray="1.5 2"
                strokeOpacity={stageInfo.stepIndex >= 0 ? 0.75 : 0.3}
              />
            </motion.g>

            {/* Stage 2: Email Verification (Open envelope with OTP verification check at x: 136, y: 44 below Milestone 2) */}
            <motion.g
              key={`stage-2-${stageInfo.stepIndex >= 1}`}
              className="transition-all duration-300"
              transform={isDesktop ? "translate(20.4, 2.6) scale(0.85)" : undefined}
              style={{
                transformOrigin: "136px 44px",
              }}
              initial={false}
              animate={
                shouldReduceMotion
                  ? { opacity: stageInfo.stepIndex >= 1 ? 1.0 : 0.4 }
                  : stageInfo.stepIndex === 1
                  ? {
                      opacity: 1.0,
                      scale: [1, 1.14, 1],
                      y: [0, -1.8, 0],
                      transition: {
                        scale: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
                        y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.55 },
                      },
                    }
                  : stageInfo.stepIndex > 1
                  ? {
                      opacity: 1.0,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.4 },
                    }
                  : {
                      opacity: 0.4,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.4 },
                    }
              }
            >
              {/* Soft Unlock Glow behind icon */}
              {stageInfo.stepIndex >= 1 && (
                <motion.circle
                  cx={136}
                  cy={44}
                  r={13}
                  fill="url(#milestone-unlock-glow)"
                  initial={stageInfo.stepIndex === 1 ? { opacity: 0, scale: 0.7 } : { opacity: 0.2, scale: 1 }}
                  animate={stageInfo.stepIndex === 1 ? { opacity: [0, 0.6, 0.25], scale: [0.7, 1.25, 1] } : { opacity: 0.18, scale: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              )}
              {/* Open Envelope Body */}
              <path
                d="M 129 42 L 129 50 C 129 50.8 129.6 51.5 130.5 51.5 L 141.5 51.5 C 142.4 51.5 143 50.8 143 50 L 143 42 Z"
                stroke="currentColor"
                strokeWidth={stageInfo.stepIndex >= 1 ? 1.25 : 1.0}
                fill="var(--color-bg)"
              />
              {/* Folded Flap Wings */}
              <path
                d="M 129 42 L 136 46 L 143 42"
                stroke="currentColor"
                strokeWidth={stageInfo.stepIndex >= 1 ? 1.0 : 0.85}
                strokeOpacity={stageInfo.stepIndex >= 1 ? 0.9 : 0.6}
                fill="none"
              />
              {/* Verification Code Slip emerging */}
              <rect
                x={131.5}
                y={36}
                width={9}
                height={7.5}
                rx={1}
                stroke="#22C55E"
                strokeWidth={stageInfo.stepIndex >= 1 ? 1.2 : 0.85}
                fill="var(--color-bg)"
              />
              {/* Micro Verification Checkmark on Slip */}
              <path
                d="M 133.5 39.5 L 135 41 L 138.5 38"
                stroke="#22C55E"
                strokeWidth={stageInfo.stepIndex >= 1 ? 1.25 : 0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Connection Guide Trace */}
              <path
                d="M 136 28 L 136 34"
                stroke="#22C55E"
                strokeWidth={0.8}
                strokeDasharray="1.5 2"
                strokeOpacity={stageInfo.stepIndex >= 1 ? 0.75 : 0.3}
              />
            </motion.g>

            {/* Stage 3: Phone Entry (Smartphone visual at x: 238, y: 16 above Milestone 3) */}
            <motion.g
              key={`stage-3-${stageInfo.stepIndex >= 2}`}
              className="transition-all duration-300"
              transform={isDesktop ? "translate(35.7, 4.4) scale(0.85)" : undefined}
              style={{
                transformOrigin: "238px 16px",
              }}
              initial={false}
              animate={
                shouldReduceMotion
                  ? { opacity: stageInfo.stepIndex >= 2 ? 1.0 : 0.4 }
                  : stageInfo.stepIndex === 2
                  ? {
                      opacity: 1.0,
                      scale: [1, 1.14, 1],
                      y: [0, -1.8, 0],
                      transition: {
                        scale: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
                        y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.55 },
                      },
                    }
                  : stageInfo.stepIndex > 2
                  ? {
                      opacity: 1.0,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.4 },
                    }
                  : {
                      opacity: 0.4,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.4 },
                    }
              }
            >
              {/* Soft Unlock Glow behind icon */}
              {stageInfo.stepIndex >= 2 && (
                <motion.circle
                  cx={238}
                  cy={16}
                  r={13}
                  fill="url(#milestone-unlock-glow)"
                  initial={stageInfo.stepIndex === 2 ? { opacity: 0, scale: 0.7 } : { opacity: 0.2, scale: 1 }}
                  animate={stageInfo.stepIndex === 2 ? { opacity: [0, 0.6, 0.25], scale: [0.7, 1.25, 1] } : { opacity: 0.18, scale: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              )}
              {/* Smartphone Body */}
              <rect
                x={233}
                y={9}
                width={10}
                height={15}
                rx={2}
                stroke="currentColor"
                strokeWidth={stageInfo.stepIndex >= 2 ? 1.25 : 1.0}
                fill="var(--color-bg)"
              />
              {/* Speaker Notch */}
              <path
                d="M 236 11.5 L 240 11.5"
                stroke="currentColor"
                strokeWidth={0.75}
                strokeOpacity={stageInfo.stepIndex >= 2 ? 0.9 : 0.6}
                strokeLinecap="round"
              />
              {/* Phone Entry Keypad Lines */}
              <path
                d="M 235.5 15 L 240.5 15 M 235.5 17.5 L 240.5 17.5"
                stroke="#22C55E"
                strokeWidth={stageInfo.stepIndex >= 2 ? 1.1 : 0.8}
                strokeLinecap="round"
              />
              {/* Home Indicator */}
              <circle
                cx={238}
                cy={21.5}
                r={0.75}
                fill="#22C55E"
                fillOpacity={stageInfo.stepIndex >= 2 ? 1.0 : 0.5}
              />
              {/* Connection Guide Trace */}
              <path
                d="M 238 26 L 238 32"
                stroke="#22C55E"
                strokeWidth={0.8}
                strokeDasharray="1.5 2"
                strokeOpacity={stageInfo.stepIndex >= 2 ? 0.75 : 0.3}
              />
            </motion.g>

            {/* Stage 4: Phone Verification (Smartphone with verified badge at x: 340, y: 44 below Milestone 4) */}
            <motion.g
              key={`stage-4-${stageInfo.stepIndex >= 3}`}
              className="transition-all duration-300"
              transform={isDesktop ? "translate(51, 2.6) scale(0.85)" : undefined}
              style={{
                transformOrigin: "340px 44px",
              }}
              initial={false}
              animate={
                shouldReduceMotion
                  ? { opacity: stageInfo.stepIndex >= 3 ? 1.0 : 0.4 }
                  : stageInfo.stepIndex === 3
                  ? {
                      opacity: 1.0,
                      scale: [1, 1.14, 1],
                      y: [0, -1.8, 0],
                      transition: {
                        scale: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
                        y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.55 },
                      },
                    }
                  : {
                      opacity: 0.4,
                      scale: 1,
                      y: 0,
                      transition: { duration: 0.4 },
                    }
              }
            >
              {/* Soft Unlock Glow behind icon */}
              {stageInfo.stepIndex >= 3 && (
                <motion.circle
                  cx={340}
                  cy={44}
                  r={13}
                  fill="url(#milestone-unlock-glow)"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: [0, 0.6, 0.25], scale: [0.7, 1.25, 1] }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              )}
              {/* Smartphone Body */}
              <rect
                x={335}
                y={36}
                width={10}
                height={15}
                rx={2}
                stroke="currentColor"
                strokeWidth={stageInfo.stepIndex >= 3 ? 1.25 : 1.0}
                fill="var(--color-bg)"
              />
              {/* Speaker Notch */}
              <path
                d="M 338 38.5 L 342 38.5"
                stroke="currentColor"
                strokeWidth={0.75}
                strokeOpacity={stageInfo.stepIndex >= 3 ? 0.9 : 0.6}
                strokeLinecap="round"
              />
              {/* Verified Check Badge Bubble on Screen */}
              <circle
                cx={340}
                cy={44}
                r={2.8}
                fill="var(--color-bg)"
                stroke="#22C55E"
                strokeWidth={stageInfo.stepIndex >= 3 ? 1.2 : 0.85}
              />
              <path
                d="M 338.8 44 L 339.7 44.9 L 341.3 43.1"
                stroke="#22C55E"
                strokeWidth={stageInfo.stepIndex >= 3 ? 1.25 : 0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Micro-sparkle pulse when completed */}
              {stageInfo.stepIndex === 3 && (
                <motion.path
                  d="M 340 33 L 340 34.5 M 340 52.5 L 340 54 M 332 44 L 333.5 44 M 346.5 44 L 348 44"
                  stroke="#22C55E"
                  strokeWidth={1.0}
                  strokeLinecap="round"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: [0.8, 1.2, 1], opacity: [0, 1, 0.85] }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                />
              )}
              {/* Connection Guide Trace */}
              <path
                d="M 340 28 L 340 34"
                stroke="#22C55E"
                strokeWidth={0.8}
                strokeDasharray="1.5 2"
                strokeOpacity={stageInfo.stepIndex >= 3 ? 0.75 : 0.3}
              />
            </motion.g>
          </>
        )}
      </g>

      {/* Upcoming Inactive Route Guide: Subtle light-green dotted curved path */}
      <path
        d={routePathD}
        stroke="#22C55E"
        strokeOpacity={isDesktop ? 0.24 : 0.32}
        strokeWidth={isDesktop ? 1.2 : 1.5}
        strokeDasharray={isDesktop ? "2 3" : "2.5 3.5"}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Radiant Green Path Under-Glow */}
      <motion.path
        d={routePathD}
        stroke="#22C55E"
        strokeWidth={isDesktop ? 3.5 : 4.5}
        strokeOpacity={isDesktop ? 0.10 : 0.16}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={shouldReduceMotion ? { pathLength: stageInfo.progress } : { pathLength: isLoginMode ? 0.27 : 0.10 }}
        animate={{ pathLength: stageInfo.progress }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { duration: 0.75, ease: [0.16, 1, 0.3, 1] }
        }
      />

      {/* Flowing Solid Unifolio Green Progress Path */}
      <motion.path
        d={routePathD}
        stroke="url(#auth-active-trail-bottom)"
        strokeWidth={isDesktop ? 1.7 : 2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={shouldReduceMotion ? { pathLength: stageInfo.progress } : { pathLength: isLoginMode ? 0.27 : 0.10 }}
        animate={{ pathLength: stageInfo.progress }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { duration: 0.75, ease: [0.16, 1, 0.3, 1] }
        }
      />

      {/* Stationary Milestones (Completed & Upcoming hierarchy) */}
      {milestones.map((node) => {
        const isPassed = stageInfo.stepIndex > node.stepIndex;
        const isUpcoming = stageInfo.stepIndex < node.stepIndex;

        return (
          <g key={node.id} className="transition-all duration-300">
            {/* Completed Milestone: Solid Unifolio green node with green halo aura */}
            {isPassed && (
              <g>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={8.5}
                  fill="#22C55E"
                  fillOpacity={0.16}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={4.8}
                  fill="#22C55E"
                  stroke="var(--color-bg)"
                  strokeWidth={1.2}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={1.6}
                  fill="#FFFFFF"
                  fillOpacity={0.95}
                />
              </g>
            )}

            {/* Upcoming Milestone: Clearly visible, soft neutral/gray-green ring */}
            {isUpcoming && (
              <g>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={4.2}
                  stroke="#22C55E"
                  strokeWidth={1.2}
                  strokeOpacity={0.35}
                  strokeDasharray="2.5 2"
                  fill="var(--color-bg)"
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={1.4}
                  fill="#22C55E"
                  fillOpacity={0.25}
                />
              </g>
            )}
          </g>
        );
      })}

      {/* Active Milestone Traveler: Unifolio Ring Logo with Spring physics & Breathing Animation */}
      <motion.g
        initial={
          shouldReduceMotion
            ? { x: currentMilestone.x, y: currentMilestone.y }
            : { x: milestones[0].x, y: milestones[0].y }
        }
        animate={{
          x: currentMilestone.x,
          y: currentMilestone.y,
        }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : {
                type: "spring",
                stiffness: 75,
                damping: 13,
                mass: 0.85,
              }
        }
      >
        {/* Ambient subtle glow around active node */}
        <circle
          cx={0}
          cy={0}
          r={15}
          fill="url(#active-node-glow)"
        />

        {/* Tactile arrival ripple pulse */}
        {!shouldReduceMotion && (
          <motion.circle
            key={`pulse-${isLoginMode ? "login-" : ""}${stageInfo.stepIndex}`}
            cx={0}
            cy={0}
            r={7}
            stroke="#22C55E"
            strokeWidth={1.2}
            fill="none"
            initial={{ scale: 1, opacity: 0.85 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ duration: 0.95, ease: "easeOut" }}
          />
        )}

        {/* Base Pedestal Ring */}
        <circle
          cx={0}
          cy={0}
          r={8.5}
          stroke="#22C55E"
          strokeWidth={1.4}
          strokeOpacity={0.9}
          fill="var(--color-bg)"
        />

        {/* Unifolio Ring Mark with calm breathing & floating pulse (Light Mode) */}
        <motion.image
          href="/brand/unifolio-ring.png"
          x={-ringSize / 2}
          y={-ringSize / 2}
          width={ringSize}
          height={ringSize}
          preserveAspectRatio="xMidYMid meet"
          className="block dark:hidden select-none pointer-events-none"
          style={{
            filter: "drop-shadow(0 2px 4px rgba(34,197,94,0.4))",
          }}
          animate={
            shouldReduceMotion
              ? { scale: 1 }
              : { scale: [1, 1.08, 1], y: [0, -1, 0] }
          }
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  duration: 2.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />

        {/* Unifolio Ring Mark with calm breathing & floating pulse (Dark Mode) */}
        <motion.image
          href="/brand/unifolio-ring-dark.png"
          x={-ringSize / 2}
          y={-ringSize / 2}
          width={ringSize}
          height={ringSize}
          preserveAspectRatio="xMidYMid meet"
          className="hidden dark:block select-none pointer-events-none"
          style={{
            filter: "drop-shadow(0 2px 4px rgba(34,197,94,0.4))",
          }}
          animate={
            shouldReduceMotion
              ? { scale: 1 }
              : { scale: [1, 1.08, 1], y: [0, -1, 0] }
          }
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  duration: 2.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />
      </motion.g>
    </svg>
  );
}

/**
 * MobileAuthBackground
 *
 * Dedicated mobile authentication background layer (strictly lg:hidden).
 * Extends the roadmap line all the way to the absolute left and right screen boundaries.
 */
export function MobileAuthBackground({
  activeStep: propActiveStep,
  stepIndex: propStepIndex,
  authMode: propAuthMode,
  className = "",
}: MobileAuthBackgroundProps = {}) {
  const context = useMobileJourney();
  const rawActiveStep = propActiveStep ?? context?.activeStep ?? "auth_landing";

  // Exclusively render on authentication screens; completely omit on onboarding
  if (typeof rawActiveStep === "string" && rawActiveStep.startsWith("onboarding_")) {
    return null;
  }

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none lg:hidden z-0 select-none ${className}`}
      aria-hidden="true"
    >
      {/* 1. Delicate Atmospheric Ambient Lighting Blobs */}
      <div
        className="absolute -top-24 -left-24 w-80 h-80 rounded-full pointer-events-none opacity-35 dark:opacity-12 transition-opacity"
        style={{
          background:
            "radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.01) 50%, transparent 75%)",
        }}
      />
      <div
        className="absolute top-1/3 -right-24 w-80 h-80 rounded-full pointer-events-none opacity-25 dark:opacity-8 transition-opacity"
        style={{
          background:
            "radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, rgba(34, 197, 94, 0.01) 55%, transparent 75%)",
        }}
      />

      {/* 2. Edge-to-edge Mobile Bottom Roadmap Channel (No horizontal padding) */}
      <div className="absolute bottom-6 sm:bottom-9 min-[400px]:bottom-10 left-0 right-0 h-20 sm:h-24 px-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <AuthRoadmapSvg
          activeStep={propActiveStep}
          stepIndex={propStepIndex}
          authMode={propAuthMode}
          className="w-full h-full text-[var(--color-ink)]"
        />
      </div>
    </div>
  );
}
