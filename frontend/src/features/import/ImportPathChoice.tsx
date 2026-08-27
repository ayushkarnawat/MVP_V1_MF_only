import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { OnboardingIllustration } from "@/features/auth/OnboardingIllustration";
import {
  MOTION_EASING_SMOOTH,
  onboardingContainerVariants,
  onboardingHeadingVariants,
  onboardingIllustrationVariants,
  onboardingOptionItemVariants,
  onboardingOptionsContainerVariants,
} from "@/lib/motion";

export interface ImportPathChoiceProps {
  onSelectRequest: () => void;
  onSelectUpload: () => void;
}

/** Small hand-drawn editorial illustration representing CAMS email request */
function CamsRequestIllustration({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Soft background aura */}
      <circle cx="16" cy="16" r="12" fill="var(--color-accent)" fillOpacity="0.1" />

      {/* Hand-drawn Envelope Body */}
      <rect
        x="5"
        y="9"
        width="22"
        height="15"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Envelope Flap Lines */}
      <path
        d="M5.5 10L14.8 16.6C15.5 17.1 16.5 17.1 17.2 16.6L26.5 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Unifolio Green Accent Wax Seal Dot */}
      <circle cx="16" cy="16.5" r="2" fill="#22C55E" />

      {/* Hand-Drawn Motion Arc & Amber Sparkle */}
      <path
        d="M22 6.5C23.5 5.2 25.2 5.5 26.5 6"
        stroke="#F59E0B"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="27.5" cy="5.5" r="1" fill="#F59E0B" />
    </svg>
  );
}

/** Small hand-drawn editorial illustration representing CAS document PDF upload */
function StatementUploadIllustration({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Soft background aura */}
      <circle cx="16" cy="16" r="12" fill="var(--color-accent)" fillOpacity="0.1" />

      {/* Hand-drawn Document Sheet */}
      <path
        d="M8.5 7C8.5 5.89543 9.39543 5 10.5 5H18.5L23.5 10V25C23.5 26.1046 22.6046 27 21.5 27H10.5C9.39543 27 8.5 26.1046 8.5 25V7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Folded Corner */}
      <path
        d="M18 5.5V10.5H23"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Unifolio Green Hand-drawn Upward Arrow */}
      <path
        d="M16 21V13M16 13L12.5 16.5M16 13L19.5 16.5"
        stroke="#22C55E"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Amber Sparkle */}
      <circle cx="25.5" cy="6.5" r="1" fill="#F59E0B" />
    </svg>
  );
}

export function ImportPathChoice({
  onSelectRequest,
  onSelectUpload,
}: ImportPathChoiceProps) {
  return (
    <motion.div
      variants={onboardingContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-xl mx-auto space-y-3 sm:space-y-4 text-left box-border my-auto flex flex-col justify-center"
    >
      {/* Hero Illustration */}
      <motion.div variants={onboardingIllustrationVariants} className="flex justify-center py-0.5 sm:py-1">
        <OnboardingIllustration variant="upload" className="w-36 h-36 xs:w-44 xs:h-44 sm:w-48 sm:h-48 mx-auto max-h-[200px]" />
      </motion.div>

      {/* Header with Title */}
      <motion.div variants={onboardingHeadingVariants} className="space-y-1.5 text-center sm:text-left">
        <h1 className="font-display font-bold text-[22px] xs:text-[24px] sm:text-[28px] text-[var(--color-ink)] tracking-tight leading-[1.14]">
          How would you like to bring in your statement?
        </h1>
      </motion.div>

      {/* Choice List */}
      <motion.div variants={onboardingOptionsContainerVariants} className="divide-y divide-[var(--color-border)]/35 -mx-1 pt-1">
        {/* Choice 1: Request from CAMS */}
        <motion.button
          variants={onboardingOptionItemVariants}
          whileHover={{
            x: 2,
            transition: { duration: 0.18, ease: MOTION_EASING_SMOOTH },
          }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={onSelectRequest}
          className="w-full py-3.5 sm:py-4 px-2.5 sm:px-3 rounded-xl hover:bg-black/[0.025] dark:hover:bg-white/[0.035] flex items-center gap-3.5 text-left transition-all duration-150 cursor-pointer group select-none min-h-[52px]"
        >
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-[#22C55E]/10 text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:bg-[#22C55E]/15 group-hover:text-[#22C55E] transition-all duration-150">
            <CamsRequestIllustration className="h-6 w-6 sm:h-7 sm:w-7 text-[var(--color-ink)] group-hover:text-[#22C55E] transition-colors" />
          </div>

          <div className="flex-1 min-w-0 space-y-0.5">
            <strong className="block font-display font-bold text-xs sm:text-[14px] text-[var(--color-ink)] group-hover:text-[#22C55E] transition-colors">
              Request from CAMS
            </strong>
            <span className="block text-[11px] sm:text-xs text-[#5C5C5C] dark:text-[#A3A3A3] leading-snug font-normal">
              Free, official, and covers every AMC automatically. Arrives by email in 5–10 min.
            </span>
          </div>

          <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 text-[#5C5C5C]/50 dark:text-[#A3A3A3]/50 group-hover:text-[#22C55E] group-hover:translate-x-0.5 transition-all duration-150">
            <ChevronRight className="h-4 w-4" />
          </div>
        </motion.button>

        {/* Choice 2: Already have a statement */}
        <motion.button
          variants={onboardingOptionItemVariants}
          whileHover={{
            x: 2,
            transition: { duration: 0.18, ease: MOTION_EASING_SMOOTH },
          }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={onSelectUpload}
          className="w-full py-3.5 sm:py-4 px-2.5 sm:px-3 rounded-xl hover:bg-black/[0.025] dark:hover:bg-white/[0.035] flex items-center gap-3.5 text-left transition-all duration-150 cursor-pointer group select-none min-h-[52px]"
        >
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-[#22C55E]/10 text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:bg-[#22C55E]/15 group-hover:text-[#22C55E] transition-all duration-150">
            <StatementUploadIllustration className="h-6 w-6 sm:h-7 sm:w-7 text-[var(--color-ink)] group-hover:text-[#22C55E] transition-colors" />
          </div>

          <div className="flex-1 min-w-0 space-y-0.5">
            <strong className="block font-display font-bold text-xs sm:text-[14px] text-[var(--color-ink)] group-hover:text-[#22C55E] transition-colors">
              Already have a statement
            </strong>
            <span className="block text-[11px] sm:text-xs text-[#5C5C5C] dark:text-[#A3A3A3] leading-snug font-normal">
              Drop in a CAS PDF statement you already downloaded — done in seconds.
            </span>
          </div>

          <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 text-[#5C5C5C]/50 dark:text-[#A3A3A3]/50 group-hover:text-[#22C55E] group-hover:translate-x-0.5 transition-all duration-150">
            <ChevronRight className="h-4 w-4" />
          </div>
        </motion.button>
      </motion.div>
    </motion.div>
  );
}


