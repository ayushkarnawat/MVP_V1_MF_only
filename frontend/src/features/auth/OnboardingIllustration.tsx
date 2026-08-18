import { motion } from "motion/react";

export type IllustrationVariant =
  | "trust"
  | "name"
  | "investing"
  | "purpose"
  | "household";

interface OnboardingIllustrationProps {
  variant: IllustrationVariant;
  className?: string;
}

export function OnboardingIllustration({
  variant,
  className = "w-20 h-20 sm:w-24 sm:h-24 mx-auto",
}: OnboardingIllustrationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className={`flex items-center justify-center select-none ${className}`}
      aria-hidden="true"
    >
      {variant === "trust" && (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <radialGradient id="trust-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FDF8ED" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="trust-shield-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
            <linearGradient id="trust-arc" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#FCD34D" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="50" fill="url(#trust-glow)" />
          <path
            d="M60 22 C76 22 92 28 92 48 C92 72 68 88 60 96 C52 88 28 72 28 48 C28 28 44 22 60 22 Z"
            fill="url(#trust-shield-gold)"
            fillOpacity="0.25"
            stroke="url(#trust-arc)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="48"
            y="52"
            width="24"
            height="20"
            rx="5"
            fill="#FFFBEB"
            stroke="#D97706"
            strokeWidth="2.5"
          />
          <path
            d="M53 52 V44 C53 40.1 56.1 37 60 37 C63.9 37 67 40.1 67 44 V52"
            fill="none"
            stroke="#D97706"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="60" cy="61" r="2.5" fill="#B45309" />
          <path d="M60 63.5 V66" stroke="#B45309" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}

      {variant === "name" && (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <radialGradient id="name-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#FDF8ED" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="name-card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFBEB" />
              <stop offset="100%" stopColor="#FEF3C7" />
            </linearGradient>
            <linearGradient id="name-accent-gold" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#FDE68A" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="50" fill="url(#name-glow)" />
          {/* Card silhouette */}
          <rect
            x="26"
            y="32"
            width="68"
            height="56"
            rx="12"
            fill="url(#name-card-grad)"
            stroke="#F59E0B"
            strokeWidth="2.5"
            strokeDasharray="0"
          />
          {/* Avatar circle */}
          <circle cx="60" cy="50" r="11" fill="#FDE68A" stroke="#D97706" strokeWidth="2" />
          <path
            d="M45 74 C45 66 52 64 60 64 C68 64 75 66 75 74"
            fill="#FEF3C7"
            stroke="#D97706"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M38 40 H48" stroke="url(#name-accent-gold)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="80" cy="40" r="2" fill="#D97706" />
        </svg>
      )}

      {variant === "investing" && (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <radialGradient id="inv-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FDF8ED" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="inv-chart-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#FDE68A" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="50" fill="url(#inv-glow)" />
          {/* Rising bars */}
          <rect x="32" y="64" width="12" height="24" rx="4" fill="#FDE68A" stroke="#D97706" strokeWidth="2" />
          <rect x="49" y="52" width="12" height="36" rx="4" fill="#FCD34D" stroke="#D97706" strokeWidth="2" />
          <rect x="66" y="40" width="12" height="48" rx="4" fill="#F59E0B" stroke="#B45309" strokeWidth="2" />
          <rect x="83" y="28" width="12" height="60" rx="4" fill="#D97706" stroke="#92400E" strokeWidth="2" />
          {/* Trend arrow */}
          <path
            d="M32 60 L48 48 L66 36 L88 20"
            fill="none"
            stroke="#B45309"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M80 20 H88 V28" fill="none" stroke="#B45309" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      {variant === "purpose" && (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <radialGradient id="purp-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FDF8ED" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="purp-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FCD34D" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="50" fill="url(#purp-glow)" />
          {/* Target rings */}
          <circle cx="60" cy="60" r="38" fill="none" stroke="#FDE68A" strokeWidth="3" />
          <circle cx="60" cy="60" r="26" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="2.5" />
          <circle cx="60" cy="60" r="14" fill="url(#purp-gold)" stroke="#B45309" strokeWidth="2" />
          {/* Compass / Star accent */}
          <circle cx="60" cy="60" r="4" fill="#FFFBEB" />
          <path d="M60 16 V22 M60 98 V104 M16 60 H22 M98 60 H104" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )}

      {variant === "household" && (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <radialGradient id="house-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FDF8ED" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="house-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFBEB" />
              <stop offset="100%" stopColor="#FDE68A" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="50" fill="url(#house-glow)" />
          {/* Family network node shapes */}
          <circle cx="44" cy="46" r="13" fill="url(#house-gold)" stroke="#D97706" strokeWidth="2.5" />
          <circle cx="76" cy="46" r="13" fill="url(#house-gold)" stroke="#D97706" strokeWidth="2.5" />
          <circle cx="60" cy="74" r="11" fill="url(#house-gold)" stroke="#D97706" strokeWidth="2.5" />
          {/* Connecting bridge lines */}
          <path d="M44 46 L76 46 L60 74 Z" fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3 3" />
          {/* Center core heart/spark */}
          <circle cx="60" cy="55" r="4" fill="#D97706" />
        </svg>
      )}
    </motion.div>
  );
}
