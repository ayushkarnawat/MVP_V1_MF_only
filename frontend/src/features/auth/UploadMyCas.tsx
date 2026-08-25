import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { TwoPathImportContainer } from "../import/TwoPathImportContainer";
import { clearCasResumeStep2 } from "../import/casResumeState";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { ArrowRight, Clock } from "lucide-react";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface UploadMyCasProps {
  awaitingUpload: boolean;
  memberId?: string;
  onUploadNow: () => void;
  onUploadLater: () => void;
  onSubmit: (file: File, password: string) => void;
}

export function UploadMyCas({
  awaitingUpload,
  memberId,
  onUploadNow,
  onUploadLater,
  onSubmit,
}: UploadMyCasProps) {
  if (awaitingUpload) {
    if (!memberId) {
      return null;
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl mx-auto space-y-6 text-left box-border"
      >
        <div className="space-y-1">
          <h2 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight">
            Import Your CAS Statement
          </h2>
        </div>

        <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 sm:p-6 shadow-xs">
          <TwoPathImportContainer
            memberId={memberId}
            onUploadSubmit={onSubmit}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-lg mx-auto space-y-6 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="upload" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          Upload your own CAS statement?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          You can upload your own personal statement now or proceed directly to batch parse family statements.
        </p>
      </motion.div>

      {/* 2. Action Choice Buttons */}
      <motion.div variants={staggerItemVariants} className="flex items-center justify-between gap-3 pt-2">
        <Button
          variant="outline"
          size="md"
          type="button"
          onClick={() => {
            clearCasResumeStep2("self");
            onUploadLater();
          }}
          className="h-11 sm:h-12 px-5 rounded-xl border-[var(--color-border)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm gap-1.5 cursor-pointer transition-all"
        >
          <Clock className="h-4 w-4 text-[var(--color-text-secondary)]" />
          <span>Upload Later</span>
        </Button>

        <Button
          variant="primary"
          size="md"
          type="button"
          onClick={onUploadNow}
          className="h-11 sm:h-12 px-6 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          <span>Upload Now</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
