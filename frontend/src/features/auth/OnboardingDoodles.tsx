import React from "react";

/**
 * Radiating hand-drawn burst rays (e.g. above safe box / credit card in reference image)
 */
export function DoodleBurstRays({ className = "w-8 h-8 text-[var(--color-ink)]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" fill="none" className={`select-none pointer-events-none ${className}`}>
      <path
        d="M 6 20 L 2 12 M 16 16 L 14 4 M 26 16 L 28 4 M 36 20 L 40 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Playful hand-drawn curly spiral loop (e.g. on side of safe box / card in reference image)
 */
export function DoodleCurlyLoop({ className = "w-6 h-12 text-[var(--color-ink)]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 50" fill="none" className={`select-none pointer-events-none ${className}`}>
      <path
        d="M 6 4 C 18 8, 22 18, 12 24 C 2 30, 8 40, 18 46"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Hand-drawn 4-point sparkle star
 */
export function DoodleSparkle({ className = "w-6 h-6 text-[var(--color-accent)]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={`select-none pointer-events-none ${className}`}>
      <path
        d="M 16 2 C 16 10, 22 16, 30 16 C 22 16, 16 22, 16 30 C 16 22, 10 16, 2 16 C 10 16, 16 10, 16 2 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Hand-drawn curved arrow swirl
 */
export function DoodleSwirlArrow({ className = "w-10 h-10 text-[var(--color-ink)]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={`select-none pointer-events-none ${className}`}>
      <path
        d="M 8 32 C 8 16, 20 8, 30 14 C 36 18, 32 26, 24 24"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 3"
      />
      <path
        d="M 22 18 L 24 24 L 30 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Organic background backdrop shape with soft tint fill
 */
export function OrganicBlob({ className = "w-48 h-48", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 200" fill="currentColor" className={`select-none pointer-events-none ${className}`} style={style}>
      <path d="M 45 -55 C 65 -45, 80 -25, 82 0 C 85 25, 75 52, 57 68 C 39 84, 13 90 -12 87 C -37 84, -61 72, -73 53 C -85 34, -85 8, -79 -16 C -73 -40, -61 -62, -43 -72 C -25 -82, 0 -80, 23 -75 C 32 -71, 35 -60, 45 -55 Z" transform="translate(100 100)" />
    </svg>
  );
}

/**
 * Hand-drawn sketch line accent
 */
export function DoodleSketchLine({ className = "w-16 h-4 text-[var(--color-accent)]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 12" fill="none" className={`select-none pointer-events-none ${className}`}>
      <path
        d="M 3 7 C 22 3, 48 9, 77 4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
