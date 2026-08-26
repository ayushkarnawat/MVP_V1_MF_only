import { motion } from "motion/react";
import {
  DoodleBurstRays,
  DoodleSparkle,
  OrganicBlob,
} from "./OnboardingDoodles";
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
  className = "w-36 h-36 sm:w-44 sm:h-44 mx-auto max-h-[240px]",
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
      {/* 1. Subtle Organic Background Blob Backdrop */}
      <OrganicBlob
        className="absolute w-[130%] h-[130%] text-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] dark:text-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] pointer-events-none opacity-80"
      />

      {/* 2. Soft Ambient Glow Aura */}
      <motion.div
        animate={{ scale: [1, 1.05, 1], opacity: [0.35, 0.45, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 pointer-events-none rounded-full blur-2xl opacity-40 dark:opacity-30"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--color-accent) 25%, transparent) 0%, transparent 75%)",
        }}
      />

      {/* 3. Tasteful Hand-Drawn Burst Accent (Top Right) */}
      <motion.div
        animate={{ y: [-1, 1, -1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-3 right-0 z-20 pointer-events-none opacity-70"
      >
        <DoodleBurstRays className="w-6 h-4 text-[var(--color-ink)] opacity-70 dark:opacity-80" />
      </motion.div>

      {/* 4. Tasteful Hand-Drawn Sparkle (Bottom Left) */}
      <motion.div
        animate={{ scale: [0.92, 1.06, 0.92] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-1 -left-2 z-20 pointer-events-none"
      >
        <DoodleSparkle className="w-4 h-4 text-[var(--color-accent)] opacity-80" />
      </motion.div>

      {/* 5. Hand-Drawn Hero Artwork Image (Light Theme) */}
      <motion.img
        animate={{ y: [0, -3.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: MOTION_EASING_FLOAT }}
        src={lightSrc}
        alt={altText}
        className="relative z-10 w-full h-full object-contain filter drop-shadow-sm transition-all mix-blend-multiply dark:hidden"
        loading="eager"
        decoding="async"
      />

      {/* 6. Hand-Drawn Hero Artwork Image (Dark Theme) */}
      <motion.img
        animate={{ y: [0, -3.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: MOTION_EASING_FLOAT }}
        src={darkSrc}
        alt={altText}
        className="relative z-10 w-full h-full object-contain filter drop-shadow-[0_0_14px_rgba(74,222,128,0.2)] transition-all hidden dark:block"
        loading="eager"
        decoding="async"
      />
    </motion.div>
  );
}
