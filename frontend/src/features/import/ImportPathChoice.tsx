import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { OnboardingIllustration } from "@/features/auth/OnboardingIllustration";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

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
      <circle cx="16" cy="16.5" r="2" fill="#20B358" />

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
        stroke="#20B358"
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
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full space-y-3 sm:space-y-5 text-left box-border"
    >
      {/* Hero Illustration */}
      <motion.div variants={staggerItemVariants} className="flex justify-center">
        <OnboardingIllustration variant="upload" />
      </motion.div>

      {/* Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1 text-center sm:text-left">
        <h1 className="font-display font-bold text-lg sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          How would you like to bring in your statement?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Either way, Unifolio turns it into one clear view of everything you hold.
        </p>
      </motion.div>

      {/* Choice Rows */}
      <motion.div variants={staggerItemVariants} className="space-y-2 sm:space-y-3">
        {/* Choice 1: Request from CAMS */}
        <button
          type="button"
          onClick={onSelectRequest}
          className="w-full p-3 sm:p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 hover:bg-[color-mix(in_srgb,var(--color-accent)_3%,var(--color-surface))] flex items-center gap-3 sm:gap-4 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] group shadow-xs select-none min-h-[44px]"
        >
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:text-[var(--color-accent)] group-hover:scale-105 transition-all duration-200">
            <CamsRequestIllustration className="h-6 w-6 sm:h-7 sm:w-7 text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors" />
          </div>

          <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
            <strong className="block font-display font-semibold text-xs sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
              Request from CAMS
            </strong>
            <span className="block text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-tight sm:leading-relaxed">
              Free, official, and covers every AMC automatically. Arrives by email in 5–10 min.
            </span>
          </div>

          <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)] group-hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-all duration-150">
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
        </button>

        {/* Choice 2: Already have a statement */}
        <button
          type="button"
          onClick={onSelectUpload}
          className="w-full p-3 sm:p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 hover:bg-[color-mix(in_srgb,var(--color-accent)_3%,var(--color-surface))] flex items-center gap-3 sm:gap-4 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] group shadow-xs select-none min-h-[44px]"
        >
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:text-[var(--color-accent)] group-hover:scale-105 transition-all duration-200">
            <StatementUploadIllustration className="h-6 w-6 sm:h-7 sm:w-7 text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors" />
          </div>

          <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
            <strong className="block font-display font-semibold text-xs sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
              Already have a statement
            </strong>
            <span className="block text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-tight sm:leading-relaxed">
              Drop in a CAS PDF statement you already downloaded — done in seconds.
            </span>
          </div>

          <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)] group-hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-all duration-150">
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
        </button>
      </motion.div>
    </motion.div>
  );
}

