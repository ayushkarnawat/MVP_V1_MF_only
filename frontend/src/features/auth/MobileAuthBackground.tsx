/**
 * MobileAuthBackground
 *
 * Minimal, editorial vector background for mobile authentication (< lg).
 * Theme: "Many separate financial pieces becoming one unified picture."
 *
 * Designed specifically for mobile viewports (~375px) with pure SVG geometry:
 * - Concentric editorial arcs and converging folio trajectory paths
 * - Asymmetric corner anchor clusters with restrained emerald accents
 * - Clean, quiet negative space in the center behind the authentication card
 * - Zero heavy blur, zero text, zero raster overhead, 100% theme-adaptive.
 */
export function MobileAuthBackground() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none lg:hidden z-0 select-none"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 375 812"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full text-[var(--color-ink)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Subtle linear gradient for converging trajectory lines */}
          <linearGradient id="unifolio-stream-1" x1="0" y1="0" x2="375" y2="200" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.04" />
            <stop offset="45%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="70%" stopColor="var(--color-accent)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
          </linearGradient>

          <linearGradient id="unifolio-stream-2" x1="50" y1="650" x2="375" y2="800" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.04" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="80%" stopColor="var(--color-accent)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
          </linearGradient>

          {/* Precision Crosshair Marker */}
          <g id="crosshair">
            <line x1="-4" y1="0" x2="4" y2="0" stroke="currentColor" strokeWidth="0.75" opacity="0.12" />
            <line x1="0" y1="-4" x2="0" y2="4" stroke="currentColor" strokeWidth="0.75" opacity="0.12" />
          </g>
        </defs>

        {/* ================================================================= */}
        {/* TOP-LEFT / TOP CONVERGENCE CLUSTER                                */}
        {/* ================================================================= */}

        {/* Concentric Brand Radii radiating from off-canvas (-30, -30) */}
        <circle cx="-30" cy="-30" r="120" stroke="currentColor" strokeWidth="0.75" opacity="0.07" strokeDasharray="3 4" />
        <circle cx="-30" cy="-30" r="210" stroke="currentColor" strokeWidth="0.75" opacity="0.09" />
        <circle cx="-30" cy="-30" r="300" stroke="currentColor" strokeWidth="0.75" opacity="0.06" strokeDasharray="4 6" />

        {/* Multi-Stream Convergence Path: Disparate streams unifying into one trajectory */}
        {/* Stream A (From upper left) */}
        <path
          d="M -10 95 C 45 92, 110 75, 175 62 C 230 52, 285 58, 385 28"
          stroke="url(#unifolio-stream-1)"
          strokeWidth="1.2"
        />
        {/* Stream B (From top center) */}
        <path
          d="M 120 -10 C 140 40, 195 55, 255 58 C 305 60, 345 42, 385 30"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.1"
          strokeDasharray="2 3"
        />
        {/* Stream C (Parallel harmonic arc) */}
        <path
          d="M 15 130 C 80 120, 150 90, 215 78 C 265 68, 310 72, 385 45"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.07"
        />

        {/* Discrete Folio Anchor Nodes along the converging trajectory */}
        <circle cx="65" cy="88" r="2" fill="currentColor" opacity="0.2" />
        <circle cx="120" cy="74" r="2.5" fill="currentColor" opacity="0.25" />
        <circle cx="185" cy="62" r="2" fill="currentColor" opacity="0.2" />

        {/* Unification Apex Node: Subtle emerald focal beacon */}
        <circle cx="265" cy="58" r="3" fill="var(--color-accent)" opacity="0.8" />
        <circle cx="265" cy="58" r="7.5" stroke="var(--color-accent)" strokeWidth="0.75" opacity="0.3" />

        {/* Editorial Crosshairs & Coordinate Marks */}
        <use href="#crosshair" x="32" y="160" />
        <use href="#crosshair" x="345" y="105" />

        {/* ================================================================= */}
        {/* BOTTOM-RIGHT CONVERGENCE CLUSTER                                  */}
        {/* ================================================================= */}

        {/* Concentric Brand Radii radiating from off-canvas (400, 830) */}
        <circle cx="400" cy="830" r="140" stroke="currentColor" strokeWidth="0.75" opacity="0.08" strokeDasharray="3 4" />
        <circle cx="400" cy="830" r="230" stroke="currentColor" strokeWidth="0.75" opacity="0.06" />

        {/* Sweeping Unifying Trajectory */}
        <path
          d="M -15 725 C 75 745, 160 705, 245 730 C 295 745, 335 770, 390 790"
          stroke="url(#unifolio-stream-2)"
          strokeWidth="1.2"
        />
        {/* Secondary Stream */}
        <path
          d="M 30 770 C 110 780, 185 750, 260 762 C 305 772, 345 788, 390 802"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.11"
          strokeDasharray="2 4"
        />

        {/* Discrete Folio Anchor Nodes in lower cluster */}
        <circle cx="115" cy="740" r="2" fill="currentColor" opacity="0.2" />
        <circle cx="190" cy="716" r="2.5" fill="currentColor" opacity="0.25" />

        {/* Lower Unification Beacon: Restrained emerald node */}
        <circle cx="295" cy="745" r="3" fill="var(--color-accent)" opacity="0.8" />
        <circle cx="295" cy="745" r="7.5" stroke="var(--color-accent)" strokeWidth="0.75" opacity="0.3" />

        {/* Lower Crosshairs */}
        <use href="#crosshair" x="40" y="680" />
        <use href="#crosshair" x="335" y="715" />
      </svg>
    </div>
  );
}
