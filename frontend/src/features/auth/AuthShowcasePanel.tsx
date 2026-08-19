import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useReducedMotion } from "motion/react";
import type { AuthStep } from "./AuthShell";
import { isTestEnv } from "@/lib/motion";

// Module-level flag so animation plays ONLY ONCE per full page load.
// Navigating between auth steps (landing, email, phone, otp, etc.) or form re-renders will NEVER replay or reset the animation.
let hasAnimatedInSession = false;

interface Milestone {
  id: string;
  fraction: number;
  label: string;
  value: string;
  period: string;
  accent?: "green" | "amber";
  approxX: number;
  approxY: number;
}

const MILESTONES: Milestone[] = [
  {
    id: "inception",
    fraction: 0.0,
    label: "Inception",
    value: "₹0.00",
    period: "Folios Inception",
    accent: "green",
    approxX: 45,
    approxY: 140,
  },
  {
    id: "unified",
    fraction: 0.25,
    label: "Consolidation",
    value: "+14.8%",
    period: "Folios Unified",
    accent: "green",
    approxX: 135,
    approxY: 155,
  },
  {
    id: "direct",
    fraction: 0.5,
    label: "Direct Switch",
    value: "+28.4%",
    period: "Direct Plan Alpha",
    accent: "green",
    approxX: 275,
    approxY: 140,
  },
  {
    id: "compounding",
    fraction: 0.75,
    label: "Disciplined SIP",
    value: "+41.2%",
    period: "3Y CAGR Compounding",
    accent: "green",
    approxX: 375,
    approxY: 85,
  },
  {
    id: "peak",
    fraction: 1.0,
    label: "All-Time High",
    value: "+56.8%",
    period: "All-Time High",
    accent: "amber",
    approxX: 495,
    approxY: 50,
  },
];

// Continuous, intentional performance path:
// Starts with organic waveform through the chaos -> steps cleanly onto grid -> ascends to peak
const PATH_DEFINITION =
  "M 45,140 C 65,140 75,115 90,145 C 105,175 115,100 135,155 C 150,195 165,110 185,135 C 205,155 220,140 245,140 L 315,140 L 315,100 C 315,85 325,85 340,85 L 405,85 C 425,85 435,60 455,50 L 495,50";

// Metallic wire loops for the left chaos zone (representing raw, unorganized portfolio data)
const CHAOS_LOOPS = [
  "M 75 140 C 60 70, 195 65, 205 130 C 215 195, 85 205, 75 140 Z",
  "M 140 75 C 205 65, 215 195, 145 205 C 80 215, 70 85, 140 75 Z",
  "M 90 100 C 130 50, 225 115, 190 175 C 150 235, 55 150, 90 100 Z",
  "M 190 100 C 225 150, 130 235, 90 175 C 55 115, 150 50, 190 100 Z",
  "M 65 140 C 65 95, 215 95, 215 140 C 215 185, 65 185, 65 140 Z",
  "M 140 65 C 185 65, 185 215, 140 215 C 95 215, 95 65, 140 65 Z",
  "M 98 122 C 118 68, 208 88, 192 158 C 176 226, 78 174, 98 122 Z",
  "M 122 162 C 88 108, 178 58, 198 128 C 218 196, 152 216, 122 162 Z",
];

// Precise Cartesian Grid lines for the right structured matrix zone
const GRID_COLUMNS = [270, 315, 360, 405, 450, 495];
const GRID_ROWS = [50, 85, 120, 155, 190, 225];

interface AuthShowcasePanelProps {
  step?: AuthStep;
}

export function AuthShowcasePanel({ step: _step = "landing" }: AuthShowcasePanelProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;
  const pathRef = useRef<SVGPathElement>(null);
  const svgContainerRef = useRef<SVGSVGElement>(null);
  const [totalPathLength, setTotalPathLength] = useState<number>(560);

  // If already animated in this browser session or reduced-motion is requested, start immediately at 1.0
  const [progress, setProgress] = useState<number>(() =>
    hasAnimatedInSession || shouldReduceMotion ? 1 : 0,
  );
  const [isDrawing, setIsDrawing] = useState<boolean>(() => !hasAnimatedInSession && !shouldReduceMotion);

  // Interactive Hover State (Only appears when user hovers over the graph)
  const [hoveredMilestoneIndex, setHoveredMilestoneIndex] = useState<number | null>(null);

  // Measure actual total path length on mount
  useEffect(() => {
    if (pathRef.current && typeof pathRef.current.getTotalLength === "function") {
      try {
        const length = pathRef.current.getTotalLength();
        if (length > 0) {
          setTotalPathLength(length);
        }
      } catch {
        // Safe fallback in non-browser environments
      }
    }
  }, []);

  // Single deliberate animation on initial page load (plays ONLY ONCE, never loops or restarts)
  useEffect(() => {
    if (hasAnimatedInSession || shouldReduceMotion) {
      setProgress(1);
      setIsDrawing(false);
      return;
    }

    const DURATION = 3200; // 3.2s smooth, deliberate, cinematic progressive draw
    let startTime: number | null = null;
    let animationFrameId: number;

    const animate = (time: number) => {
      if (startTime === null) startTime = time;
      const elapsed = time - startTime;
      const t = Math.min(elapsed / DURATION, 1);

      // Smooth cubic-bezier easing (slow in, fluid flow, deliberate landing)
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setProgress(eased);

      if (t < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setProgress(1);
        setIsDrawing(false);
        hasAnimatedInSession = true; // Mark as permanently completed for this session
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [shouldReduceMotion]);

  // Compute exact coordinates of each milestone along the path
  const milestoneCoordinates = useMemo(() => {
    if (!pathRef.current || typeof pathRef.current.getPointAtLength !== "function" || totalPathLength === 0) {
      return MILESTONES.map((m) => ({ x: m.approxX, y: m.approxY }));
    }

    return MILESTONES.map((m) => {
      try {
        const point = pathRef.current!.getPointAtLength(m.fraction * totalPathLength);
        return { x: point.x, y: point.y };
      } catch {
        return { x: m.approxX, y: m.approxY };
      }
    });
  }, [totalPathLength]);

  // Leading glow spark position along the path as it draws
  const currentDrawPoint = useMemo(() => {
    if (!pathRef.current || typeof pathRef.current.getPointAtLength !== "function" || totalPathLength === 0) {
      return { x: 45, y: 140 };
    }
    try {
      const point = pathRef.current.getPointAtLength(progress * totalPathLength);
      return { x: point.x, y: point.y };
    } catch {
      return { x: 45, y: 140 };
    }
  }, [progress, totalPathLength]);

  // Hover detection: finds the nearest milestone point when hovering over the graph
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgContainerRef.current) return;
      const rect = svgContainerRef.current.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * 540;
      const svgY = ((e.clientY - rect.top) / rect.height) * 280;

      // Find closest milestone based on coordinate distance
      let closestIdx = 0;
      let minDistance = Infinity;

      milestoneCoordinates.forEach((coords, idx) => {
        const dist = Math.hypot(coords.x - svgX, coords.y - svgY);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      // Only show if reasonably close to the curve (within 60px)
      if (minDistance < 65) {
        setHoveredMilestoneIndex(closestIdx);
      } else {
        setHoveredMilestoneIndex(null);
      }
    },
    [milestoneCoordinates],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredMilestoneIndex(null);
  }, []);

  const hoveredMilestone = hoveredMilestoneIndex !== null ? MILESTONES[hoveredMilestoneIndex] : null;
  const hoveredCoords =
    hoveredMilestoneIndex !== null ? milestoneCoordinates[hoveredMilestoneIndex] : null;

  // Stroke dash calculation for progressive line draw
  const strokeDashoffset = totalPathLength * (1 - progress);

  return (
    <div className="relative w-full h-full min-h-[580px] lg:min-h-[640px] rounded-3xl bg-[#040806] border border-emerald-950/60 p-6 sm:p-8 lg:p-10 flex flex-col justify-between overflow-hidden select-none text-white shadow-2xl">
      {/* 1. Ambient Depth & Fine Diamond Background Grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 32%, rgba(10, 46, 30, 0.85) 0%, rgba(4, 18, 12, 0.95) 55%, rgba(2, 8, 5, 1) 100%)",
        }}
      />

      {/* Subtle diamond / isometric grid in background */}
      <div className="absolute inset-0 pointer-events-none opacity-20" aria-hidden="true">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="auth-diamond-grid"
              width="44"
              height="44"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="44" height="44" fill="none" stroke="rgba(74, 222, 128, 0.15)" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#auth-diamond-grid)" />
        </svg>
      </div>

      {/* 2. Top Editorial Brand & Headline Area */}
      <div className="relative z-10 w-full flex items-start justify-between">
        <div>
          <h1 className="font-sans text-3xl sm:text-4xl lg:text-[38px] xl:text-[40px] font-extrabold text-white tracking-tight leading-[1.08]">
            Stop Guessing.
            <br />
            <span className="text-white">Start Systemizing.</span>
          </h1>
        </div>

        {/* Minimalist Rocket Brand Icon Glyph */}
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-sm text-emerald-400 shadow-inner flex-shrink-0">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4.5c1.62-1.63 5-1.5 5-1.5" />
            <path d="M15 15v5s3.03-.55 4.5-2c1.63-1.62 1.5-5 1.5-5" />
          </svg>
        </div>
      </div>

      {/* 3. Central Physical Screen Display Card (Chaos -> Order Continuous Graph) */}
      <div className="relative z-10 w-full max-w-[490px] sm:max-w-[520px] mx-auto my-auto py-2">
        <div className="relative w-full rounded-2xl sm:rounded-3xl bg-[#09100d] border border-emerald-500/20 p-2 sm:p-3 overflow-hidden shadow-[0_24px_50px_-12px_rgba(0,0,0,0.85),0_0_30px_rgba(16,185,129,0.06)]">
          {/* Card Top Bevel Light Refraction Line */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />

          {/* SVG Canvas for Chaos Loops, Coordinate Grid, and Deliberate Performance Path */}
          <div className="relative w-full aspect-[540/280] overflow-visible">
            <svg
              ref={svgContainerRef}
              viewBox="0 0 540 280"
              className="w-full h-full overflow-visible cursor-crosshair"
              preserveAspectRatio="xMidYMid meet"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              aria-label="Unifolio Performance Compounding Engine"
            >
              <defs>
                {/* Luminous Glow Filter for Hero Performance Trajectory */}
                <filter id="emeraldBloom" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur1" />
                  <feGaussianBlur stdDeviation="1.2" result="blur2" />
                  <feMerge>
                    <feMergeNode in="blur1" />
                    <feMergeNode in="blur2" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Leading Spark Flare Filter */}
                <filter id="sparkGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.5" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Hero Path Linear Gradient (Unifolio Green with Warm Golden Peak Alpha) */}
                <linearGradient id="performanceTrajectoryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="35%" stopColor="#10b981" />
                  <stop offset="70%" stopColor="#4ade80" />
                  <stop offset="92%" stopColor="#86efac" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
              </defs>

              {/* 3a. Right Structured Grid Matrix (Order & Discipline) */}
              <g className="structured-grid" opacity="0.8">
                {/* Grid Enclosure Box */}
                <rect
                  x="270"
                  y="45"
                  width="225"
                  height="185"
                  rx="6"
                  fill="rgba(6, 17, 12, 0.4)"
                  stroke="rgba(74, 222, 128, 0.16)"
                  strokeWidth="1"
                />

                {/* Vertical Column Grid Lines */}
                {GRID_COLUMNS.map((x) => (
                  <line
                    key={`col-${x}`}
                    x1={x}
                    y1={45}
                    x2={x}
                    y2={230}
                    stroke="rgba(255, 255, 255, 0.06)"
                    strokeWidth="1"
                  />
                ))}

                {/* Horizontal Row Grid Lines */}
                {GRID_ROWS.map((y) => (
                  <line
                    key={`row-${y}`}
                    x1={270}
                    y1={y}
                    x2={495}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.06)"
                    strokeWidth="1"
                  />
                ))}

                {/* Axis Coordinate Labels */}
                <text x="495" y="244" fill="rgba(148, 163, 184, 0.35)" fontSize="8" fontFamily="var(--font-body)" textAnchor="end">
                  Systematic Growth
                </text>
                <text x="270" y="244" fill="rgba(148, 163, 184, 0.35)" fontSize="8" fontFamily="var(--font-body)">
                  Consolidated
                </text>
              </g>

              {/* 3b. Left Entangled Metallic Wireframe Loops (Chaos / Scattered Raw Data) */}
              <g className="chaos-cluster" opacity="0.7">
                {CHAOS_LOOPS.map((d, index) => (
                  <path
                    key={`chaos-loop-${index}`}
                    d={d}
                    fill="none"
                    stroke={index % 2 === 0 ? "rgba(148, 163, 184, 0.18)" : "rgba(100, 116, 139, 0.28)"}
                    strokeWidth={index === 2 || index === 5 ? "1.3" : "1.0"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </g>

              {/* 3c. Continuous Performance Trajectory Path */}
              {/* Ghost Base Background Path for visual context */}
              <path
                d={PATH_DEFINITION}
                fill="none"
                stroke="rgba(74, 222, 128, 0.07)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Glowing Outer Bloom Stroke */}
              <path
                d={PATH_DEFINITION}
                fill="none"
                stroke="url(#performanceTrajectoryGradient)"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={totalPathLength}
                strokeDashoffset={strokeDashoffset}
                filter="url(#emeraldBloom)"
                opacity="0.8"
              />

              {/* Crisp Core Stroke (Progressively drawn along actual path) */}
              <path
                ref={pathRef}
                d={PATH_DEFINITION}
                fill="none"
                stroke="url(#performanceTrajectoryGradient)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={totalPathLength}
                strokeDashoffset={strokeDashoffset}
              />

              {/* 3d. Subtle Drawing Glow Tip (Visible only during initial single draw) */}
              {isDrawing && progress > 0.01 && progress < 0.99 && (
                <g transform={`translate(${currentDrawPoint.x}, ${currentDrawPoint.y})`}>
                  <circle r="6" fill="rgba(74, 222, 128, 0.4)" filter="url(#sparkGlow)" />
                  <circle r="2.5" fill="#ffffff" />
                </g>
              )}

              {/* 3e. Hovered Data Point Indicator (Appears ONLY on user hover) */}
              {hoveredCoords && (
                <g transform={`translate(${hoveredCoords.x}, ${hoveredCoords.y})`}>
                  {/* Subtle Outer Focus Ring */}
                  <circle
                    r="9"
                    fill="none"
                    stroke={hoveredMilestone?.accent === "amber" ? "rgba(251, 191, 36, 0.6)" : "rgba(74, 222, 128, 0.6)"}
                    strokeWidth="1.5"
                  />
                  {/* Inner Solid Node */}
                  <circle
                    r="4"
                    fill={hoveredMilestone?.accent === "amber" ? "#fbbf24" : "#4ade80"}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </g>
              )}
            </svg>

            {/* 3f. Interactive Hover Tooltip (Revealed ONLY on user cursor hover) */}
            {hoveredMilestone && hoveredCoords && (
              <div
                style={{
                  position: "absolute",
                  left: `${(hoveredCoords.x / 540) * 100}%`,
                  top: `${(hoveredCoords.y / 280) * 100}%`,
                  transform: "translate(-50%, -125%)",
                  pointerEvents: "none",
                  transition: "left 150ms cubic-bezier(0.2, 0, 0, 1), top 150ms cubic-bezier(0.2, 0, 0, 1)",
                }}
                className="z-30"
              >
                <div
                  className={`relative rounded-xl px-3 py-1.5 text-left backdrop-blur-md shadow-2xl border flex items-center gap-2.5 whitespace-nowrap ${
                    hoveredMilestone.accent === "amber"
                      ? "bg-[#121008]/95 border-amber-400/40 shadow-amber-950/50"
                      : "bg-[#06150e]/95 border-emerald-400/35 shadow-black/90"
                  }`}
                >
                  {/* Glowing Indicator Dot */}
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      hoveredMilestone.accent === "amber"
                        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
                        : "bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.9)]"
                    }`}
                  />

                  {/* Value and Period */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-sans font-bold text-xs sm:text-sm tracking-tight leading-tight type-data ${
                          hoveredMilestone.accent === "amber" ? "text-amber-300" : "text-emerald-300"
                        }`}
                      >
                        {hoveredMilestone.value}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400 font-medium tracking-tight leading-none mt-0.5">
                      {hoveredMilestone.period}
                    </span>
                  </div>

                  {/* Downward Pointer Caret */}
                  <div
                    className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-x-4 border-x-transparent border-t-[5px] ${
                      hoveredMilestone.accent === "amber" ? "border-t-amber-400/40" : "border-t-emerald-400/35"
                    }`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Bottom Editorial Subtitle */}
      <div className="relative z-10 text-center max-w-sm sm:max-w-md mx-auto space-y-1 mt-auto pt-4">
        <p className="text-xs sm:text-sm text-neutral-400 font-sans font-normal leading-relaxed">
          Most investors manage wealth in scattered silos.
        </p>
        <p className="text-xs sm:text-sm text-emerald-300/90 font-sans font-medium leading-relaxed">
          Disciplined portfolios run on a systematic engine.
        </p>
      </div>
    </div>
  );
}
