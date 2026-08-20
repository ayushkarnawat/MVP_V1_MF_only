import { motion } from "motion/react";
import { ArrowRight, Mail, UploadCloud } from "lucide-react";
import { OnboardingIllustration } from "@/features/auth/OnboardingIllustration";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

export interface ImportPathChoiceProps {
  onSelectRequest: () => void;
  onSelectUpload: () => void;
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
      className="w-full space-y-6 text-left box-border"
    >
      {/* Hero Illustration */}
      <motion.div variants={staggerItemVariants} className="flex justify-center">
        <OnboardingIllustration variant="upload" />
      </motion.div>

      {/* Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5 text-center sm:text-left">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
          GET YOUR PORTFOLIO IN
        </span>
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          How would you like to bring in your statement?
        </h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Either way, Unifolio turns it into one clear view of everything you hold.
        </p>
      </motion.div>

      {/* Choice Rows */}
      <motion.div variants={staggerItemVariants} className="space-y-3">
        {/* Choice 1: Request from CAMS */}
        <button
          type="button"
          onClick={onSelectRequest}
          className="w-full p-4.5 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 hover:bg-[color-mix(in_srgb,var(--color-accent)_3%,var(--color-surface))] flex items-center gap-4 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] group shadow-xs select-none min-h-[44px]"
        >
          <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:text-[var(--color-accent)] group-hover:scale-105 transition-all duration-200">
            <Mail className="h-5 w-5 text-[var(--color-accent)]" />
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="block font-display font-semibold text-sm sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                Request from CAMS
              </strong>
              <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] border border-[color-mix(in_srgb,var(--color-accent)_24%,transparent)]">
                Recommended
              </span>
            </div>
            <span className="block text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Free, official, and covers every AMC automatically. Arrives by email in 5–10 min.
            </span>
          </div>

          <div className="h-8 w-8 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)] group-hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-all duration-150">
            <ArrowRight className="h-4 w-4 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
        </button>

        {/* Choice 2: Already have a statement */}
        <button
          type="button"
          onClick={onSelectUpload}
          className="w-full p-4.5 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 hover:bg-[color-mix(in_srgb,var(--color-accent)_3%,var(--color-surface))] flex items-center gap-4 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] group shadow-xs select-none min-h-[44px]"
        >
          <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:text-[var(--color-accent)] group-hover:scale-105 transition-all duration-200">
            <UploadCloud className="h-5 w-5 text-[var(--color-accent)]" />
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="block font-display font-semibold text-sm sm:text-base text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                Already have a statement
              </strong>
              <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] group-hover:border-[var(--color-accent)]/40 group-hover:text-[var(--color-accent)] transition-colors">
                Upload PDF
              </span>
            </div>
            <span className="block text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Drop in a CAMS or KFintech PDF you already downloaded — done in seconds.
            </span>
          </div>

          <div className="h-8 w-8 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)] group-hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-all duration-150">
            <ArrowRight className="h-4 w-4 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
        </button>
      </motion.div>
    </motion.div>
  );
}
