import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { EyeOff, ShieldCheck, Lock } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface TrustPrimerProps {
  onContinue: () => void;
}

export function TrustPrimer({ onContinue }: TrustPrimerProps) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-5 sm:space-y-6 text-center box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="trust" />
      </motion.div>

      {/* 1. Official Brand Header */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5 px-0.5">
        <h1 className="font-display font-bold text-lg sm:text-xl md:text-2xl text-[var(--color-ink)] tracking-tight">
          Your privacy &amp; data safety come first
        </h1>
      </motion.div>

      {/* 2. Editorial Privacy Guarantees */}
      <motion.div variants={staggerItemVariants} className="space-y-3.5 text-left py-1">
        <div className="flex items-start gap-3">
          <div className="h-6 w-6 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 mt-0.5">
            <EyeOff className="h-3.5 w-3.5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
              Read-only portfolio access
            </p>
            <p className="text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Unifolio only parses holdings and transactions to show analytics. Nothing is ever bought, sold, or transferred.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="h-6 w-6 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 mt-0.5">
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
              No raw CAS PDF storage
            </p>
            <p className="text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Statements are processed in-memory. Your raw CAS PDF and PAN are never permanently stored.
            </p>
          </div>
        </div>
      </motion.div>

      {/* 3. Primary Action */}
      <motion.div variants={staggerItemVariants} className="space-y-2.5 pt-1">
        <Button
          onClick={onContinue}
          className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
          type="button"
        >
          Continue
        </Button>
      </motion.div>

      {/* 4. Trust & Security Footnote */}
      <motion.div variants={staggerItemVariants} className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-1 select-none">
        <Lock className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </motion.div>
    </motion.div>
  );
}
