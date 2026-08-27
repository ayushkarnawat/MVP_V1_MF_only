import type { ImportConfirmResponse } from "./types";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { OnboardingIllustration } from "../auth/OnboardingIllustration";

interface ImportConfirmedProps {
  result: ImportConfirmResponse;
  onImportAnother: () => void;
  ctaLabel?: string;
}

export function ImportConfirmed({
  result,
  onImportAnother,
  ctaLabel = "Import another CAS",
}: ImportConfirmedProps) {
  const addedText = `${result.added} new transaction${result.added === 1 ? "" : "s"} added`;
  const skippedText =
    result.skipped > 0 ? `, ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped` : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="w-full max-w-2xl mx-auto py-6 sm:py-14 px-4 text-center space-y-8 box-border min-h-[calc(100dvh-2.5rem)] sm:min-h-0 flex flex-col justify-center items-center my-auto"
    >
      {/* 1. Refined Hand-Drawn Hero Visual Illustration */}
      <div className="relative inline-block mx-auto">
        <OnboardingIllustration
          variant="import_complete"
          className="w-36 h-36 sm:w-44 sm:h-44 mx-auto"
        />
      </div>

      {/* 2. Header & Results Text */}
      <div className="space-y-3 max-w-lg mx-auto">
        <h1 className="font-display font-bold tracking-tight text-2xl sm:text-4xl text-[var(--color-ink)]">
          Import complete
        </h1>

        <p className="type-body text-sm sm:text-base text-[var(--color-text-secondary)] leading-relaxed">
          {`${addedText}${skippedText}.`}
        </p>
      </div>

      {/* 3. Action CTA Button */}
      <div className="pt-2 w-full flex justify-center items-center">
        <button
          type="button"
          onClick={onImportAnother}
          className="h-12 sm:h-13 px-8 rounded-2xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-md hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer inline-flex items-center justify-center gap-2 min-h-[48px] mx-auto"
        >
          <span>{ctaLabel}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
