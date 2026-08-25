import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, Layers } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import type { FamilyUpload } from "./FamilyCasUpload";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface ParseQueueProps {
  queue: FamilyUpload[];
  onParseFiles: () => void;
}

export function ParseQueue({ queue, onParseFiles }: ParseQueueProps) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-xl mx-auto space-y-6 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="upload" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          Files ready to import
        </h1>
      </motion.div>

      {/* 2. Queued Statements List */}
      <motion.div variants={staggerItemVariants} className="space-y-2.5">
        {queue.map((item) => (
          <div
            key={item.memberId}
            className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <strong className="block font-display font-semibold text-xs sm:text-sm text-[var(--color-ink)] truncate">
                  {item.file.name}
                </strong>
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  Owner: {item.memberName}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)]">
              PDF
            </span>
          </div>
        ))}
      </motion.div>

      {/* 3. Action Controls */}
      <motion.div variants={staggerItemVariants} className="pt-2">
        <Button
          variant="primary"
          type="button"
          disabled={queue.length === 0}
          onClick={onParseFiles}
          className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          <Layers className="h-4 w-4" />
          <span>Import Now</span>
          <ArrowRight className="h-4 w-4 ml-auto" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
