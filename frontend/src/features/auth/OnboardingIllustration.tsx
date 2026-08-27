import { motion } from "motion/react";
import { MOTION_EASING, MOTION_EASING_FLOAT } from "@/lib/motion";

export type IllustrationVariant =
  | "trust"
  | "name"
  | "investing"
  | "purpose"
  | "household"
  | "family"
  | "upload"
  | "cas_upload"
  | "import_complete";

interface OnboardingIllustrationProps {
  variant: IllustrationVariant;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const ALT_TEXTS: Record<IllustrationVariant, string> = {
  trust: "Bank-grade vault and data security illustration",
  name: "Interactive portfolio dashboard illustration",
  investing: "Multi-asset compounding and growth illustration",
  purpose: "Financial goals and milestone roadmap illustration",
  household: "Household portfolio management roadmap illustration",
  family: "Family member portfolio customization illustration",
  upload: "CAS statement automated ingestion illustration",
  cas_upload: "CAS upload illustration",
  import_complete: "Import complete success illustration",
};

export function OnboardingIllustration({
  variant,
  className = "w-44 h-44 xs:w-48 xs:h-48 sm:w-56 sm:h-56 mx-auto max-h-[240px] sm:max-h-[260px]",
}: OnboardingIllustrationProps) {
  const altText = ALT_TEXTS[variant] || "Unifolio hero illustration";
  const lightSrc = `/illustrations/${variant}.png`;
  const darkSrc = `/illustrations/${variant}_dark.png`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.55, ease: MOTION_EASING }}
      className={`relative flex items-center justify-center select-none ${className}`}
      aria-label={altText}
      role="img"
    >
      {/* Hand-Drawn Hero Artwork Image (Light Theme) — Pure Focal Point with Clean Whitespace */}
      <motion.img
        animate={{ y: [0, -3.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: MOTION_EASING_FLOAT }}
        src={lightSrc}
        alt={altText}
        className="relative z-10 w-full h-full object-contain filter drop-shadow-xs transition-all dark:hidden"
        loading="eager"
        decoding="async"
      />

      {/* Hand-Drawn Hero Artwork Image (Dark Theme) */}
      <motion.img
        animate={{ y: [0, -3.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: MOTION_EASING_FLOAT }}
        src={darkSrc}
        alt={altText}
        className="relative z-10 w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(34,197,94,0.18)] transition-all hidden dark:block"
        loading="eager"
        decoding="async"
      />
    </motion.div>
  );
}
