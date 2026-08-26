/**
 * MobileAuthBackground
 *
 * Subtle, organic ambient background for mobile authentication (< lg).
 * Derived from the landing page's soft translucent glass and gradient language.
 * Completely free of technical lines, crosshairs, or circuit dots.
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
          {/* Soft atmospheric linear gradients for organic glass curve traces */}
          <linearGradient id="soft-glass-stream-1" x1="0" y1="50" x2="375" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.0" />
            <stop offset="35%" stopColor="#10B981" stopOpacity="0.12" />
            <stop offset="65%" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>

          <linearGradient id="soft-glass-stream-2" x1="40" y1="500" x2="375" y2="780" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.0" />
            <stop offset="40%" stopColor="#10B981" stopOpacity="0.10" />
            <stop offset="75%" stopColor="#34D399" stopOpacity="0.07" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
          </linearGradient>

          <linearGradient id="soft-glass-sheen" x1="0" y1="0" x2="300" y2="300" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.12" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* 1. Upper Organic Translucent Curve Stream */}
        <path
          d="M -30 110 C 60 95, 140 60, 220 75 C 290 88, 335 65, 410 40"
          stroke="url(#soft-glass-stream-1)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* 2. Soft Parallel Harmonic Wave */}
        <path
          d="M -10 145 C 75 130, 165 95, 250 110 C 315 122, 355 105, 415 80"
          stroke="url(#soft-glass-sheen)"
          strokeWidth="1"
          strokeLinecap="round"
        />

        {/* 3. Lower Organic Convergence Curve Stream */}
        <path
          d="M -20 690 C 80 710, 170 660, 260 690 C 315 710, 360 740, 410 760"
          stroke="url(#soft-glass-stream-2)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* 4. Lower Ambient Supporting Wave */}
        <path
          d="M 10 730 C 100 745, 190 705, 280 725 C 330 740, 370 765, 415 780"
          stroke="url(#soft-glass-sheen)"
          strokeWidth="1"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
