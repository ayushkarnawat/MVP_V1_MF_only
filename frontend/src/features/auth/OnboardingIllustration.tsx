import { motion } from "motion/react";

export type IllustrationVariant =
  | "trust"
  | "name"
  | "investing"
  | "purpose"
  | "household"
  | "family"
  | "upload";

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
};

export function OnboardingIllustration({
  variant,
  className = "w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 mx-auto",
}: OnboardingIllustrationProps) {
  const altText = ALT_TEXTS[variant] || "Unifolio hero illustration";
  const lightSrc = `/illustrations/${variant}.png`;
  const darkSrc = `/illustrations/${variant}_dark.png`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className={`relative flex items-center justify-center select-none ${className}`}
      aria-label={altText}
      role="img"
    >
      {/* 1. Ambient Emerald Aura Depth Glow */}
      <div
        className="absolute inset-0 pointer-events-none rounded-full blur-xl opacity-75"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--color-accent) 20%, transparent) 0%, transparent 72%)",
        }}
      />

      {/* 2. Hand-Drawn Hero Illustration (Light Theme) */}
      <img
        src={lightSrc}
        alt={altText}
        className="relative z-10 w-full h-full object-contain filter drop-shadow-sm transition-all dark:hidden"
        loading="eager"
        decoding="async"
      />

      {/* 3. Hand-Drawn Hero Illustration (Dark Theme) */}
      <img
        src={darkSrc}
        alt={altText}
        className="relative z-10 w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(74,222,128,0.18)] transition-all hidden dark:block"
        loading="eager"
        decoding="async"
      />
    </motion.div>
  );
}
