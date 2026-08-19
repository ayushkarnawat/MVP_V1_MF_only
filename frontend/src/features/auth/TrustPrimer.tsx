import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
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
      <motion.div variants={staggerItemVariants} className="space-y-1 px-0.5">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
          DATA PRIVACY &amp; SECURITY
        </span>
        <h1 className="font-display font-bold text-lg sm:text-xl md:text-2xl text-[var(--color-ink)] tracking-tight">
          Your privacy &amp; data safety come first
        </h1>
      </motion.div>

      {/* 2. Editorial Privacy Guarantee Cards */}
      <motion.div variants={staggerItemVariants} className="space-y-3 text-left">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-1.5 transition-all">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 32 32" className="w-5 h-5 select-none" fill="none">
                {/* Radiating trust spark */}
                <path d="M16 2 V4 M25 5 L23 7 M7 5 L9 7" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
                {/* Protective Shield Outline */}
                <path
                  d="M16 6 L26 10 V17 C26 23 21 27 16 29 C11 27 6 23 6 17 V10 L16 6 Z"
                  fill="color-mix(in srgb, var(--color-accent) 20%, transparent)"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                {/* Embedded Portfolio Stepped Bars */}
                <rect x="10" y="18" width="2.5" height="5" rx="0.75" fill="currentColor" />
                <rect x="14.75" y="15" width="2.5" height="8" rx="0.75" fill="#FEF3C7" stroke="currentColor" strokeWidth="1" />
                <rect x="19.5" y="12" width="2.5" height="11" rx="0.75" fill="var(--color-accent)" />
              </svg>
            </div>
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
              Read-only portfolio access
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-relaxed pl-10.5">
            Unifolio only parses holdings and transactions to show analytics. Nothing is ever bought, sold, or transferred.
          </p>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-1.5 transition-all">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 32 32" className="w-5 h-5 select-none" fill="none">
                {/* Security action spark */}
                <path d="M26 4 L28 2 M28 8 L30 8" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
                {/* Hand-drawn Document Folio */}
                <path
                  d="M7 6 C7 4.5 8 4 9.5 4 H19 L25 10 V25 C25 26.5 24 27 22.5 27 H9.5 C8 27 7 26.5 7 25 V6 Z"
                  fill="var(--color-surface)"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                {/* Folded Dog-ear Corner */}
                <path d="M19 4 V10 H25" fill="#FEF3C7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                {/* Document Ruling Lines */}
                <path d="M11 14 H18 M11 18 H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                {/* Privacy Lock / Shield Badge on Bottom Right */}
                <circle cx="21" cy="21" r="5.5" fill="#FEF3C7" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="21" cy="21" r="2.5" fill="var(--color-accent)" />
                <path d="M21 16.5 V18" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
              No raw CAS PDF storage
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-relaxed pl-10.5">
            Statements are processed in-memory. Your raw CAS PDF and PAN are never permanently stored.
          </p>
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
      <motion.div variants={staggerItemVariants} className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-0.5 select-none">
        <Lock className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </motion.div>
    </motion.div>
  );
}
