import { motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { InvestorType } from "./types";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface Q2InvestingProps {
  onBack: () => void;
  onSkip: () => void;
  onSelect: (value: InvestorType) => void;
}

interface InvestingOption {
  value: InvestorType;
  title: string;
  subtitle: string;
  badge: string;
  renderIllustration: () => React.ReactNode;
}

const OPTIONS: InvestingOption[] = [
  {
    value: "self_directed",
    title: "Mostly on my own",
    subtitle: "Direct SIPs, mutual funds, maybe some stocks",
    badge: "DIRECT",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        {/* Radiating speed / action ticks */}
        <path d="M35 9 L39 6 M41 13 L45 12 M37 19 L41 20" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
        {/* Steering Wheel Outer Ring */}
        <circle cx="21" cy="27" r="11" stroke="currentColor" strokeWidth="2" fill="color-mix(in srgb, var(--color-accent) 8%, transparent)" />
        {/* Steering Wheel Hub */}
        <circle cx="21" cy="27" r="3.5" stroke="currentColor" strokeWidth="1.75" fill="#FEF3C7" />
        {/* Helm Pegs */}
        <path d="M21 12 V16 M21 38 V42 M6 27 H10 M32 27 H36 M10.5 16.5 L13.5 19.5 M28.5 34.5 L31.5 37.5 M10.5 37.5 L13.5 34.5 M28.5 19.5 L31.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {/* Soaring Trajectory Plane / Arrow taking flight */}
        <path d="M19 25 L39 9 L29 27 L25 21 Z" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M25 21 L39 9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    value: "advisor_assisted",
    title: "Through an advisor or distributor",
    subtitle: "Distributor, bank RM, or family office, alongside my own tracking",
    badge: "ADVISORY",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        {/* Radiating guidance spark ticks */}
        <path d="M24 4 V8 M14 7 L17 10 M34 7 L31 10" stroke="#F59E0B" strokeWidth="1.75" strokeLinecap="round" />
        {/* Capital Pediment */}
        <path d="M12 14 H36 M15 11 H33" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <rect x="14" y="14" width="20" height="3" rx="1.5" fill="#FEF3C7" stroke="currentColor" strokeWidth="1.75" />
        {/* Fluted Columns */}
        <line x1="18" y1="17" x2="18" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="24" y1="17" x2="24" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="30" y1="17" x2="30" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {/* Column Base / Plinth */}
        <rect x="13" y="35" width="22" height="4" rx="1.5" fill="#FEF3C7" stroke="currentColor" strokeWidth="1.75" />
        <path d="M11 39 H37" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {/* Golden Advisory Wax Seal Stamp */}
        <circle cx="34" cy="27" r="6" fill="#FDE68A" stroke="currentColor" strokeWidth="1.75" />
        <path d="M34 23.5 L35 25.5 H37 L35.5 27 L36 29 L34 28 L32 29 L32.5 27 L31 25.5 H33 Z" fill="#F59E0B" />
      </svg>
    ),
  },
  {
    value: "mixed",
    title: "A mix of both",
    subtitle: "Direct plans + Regular distributor plans",
    badge: "HYBRID",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        {/* Dynamic balance motion arcs */}
        <path d="M8 18 C8 12 14 8 20 8 M40 30 C40 36 34 40 28 40" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
        {/* Direct Portfolio Sphere (Left / Emerald) */}
        <circle cx="18" cy="24" r="9" fill="color-mix(in srgb, var(--color-accent) 25%, transparent)" stroke="currentColor" strokeWidth="2" />
        <circle cx="15" cy="21" r="2.5" fill="var(--color-accent)" />
        {/* Regular / Advisory Portfolio Sphere (Right / Gold) */}
        <circle cx="30" cy="24" r="9" fill="#FEF3C7" stroke="currentColor" strokeWidth="2" />
        <circle cx="33" cy="21" r="2.5" fill="#F59E0B" />
        {/* Interlocking Overlap Lens */}
        <path d="M24 17.5 C26 19.5 27 22 27 24 C27 26 26 28.5 24 30.5 C22 28.5 21 26 21 24 C21 22 22 19.5 24 17.5 Z" fill="var(--color-accent)" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.5" />
        {/* Playful spark star */}
        <path d="M24 6 V10 M22 8 H26" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "beginner",
    title: "Just getting started",
    subtitle: "Haven't invested much yet, building my portfolio",
    badge: "GENESIS",
    renderIllustration: () => (
      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
        {/* Morning Sunburst Rays */}
        <path d="M34 10 L37 7 M40 15 L44 14 M36 21 L40 22" stroke="#F59E0B" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="38" cy="12" r="3" fill="#FDE68A" />
        {/* Plant Pot */}
        <path d="M14 26 H34 L31 40 H17 L14 26 Z" fill="#FEF3C7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <rect x="12" y="23" width="24" height="4" rx="2" fill="color-mix(in srgb, var(--color-accent) 15%, transparent)" stroke="currentColor" strokeWidth="1.75" />
        {/* Emerging Sprout Stem */}
        <path d="M24 23 V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {/* Left Leaf */}
        <path d="M24 18 C20 18 17 15 17 12 C20 12 23 15 24 18 Z" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        {/* Right Leaf */}
        <path d="M24 14 C28 14 31 11 31 8 C28 8 25 11 24 14 Z" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        {/* Sparkle ground speck */}
        <circle cx="21" cy="33" r="1" fill="currentColor" />
        <circle cx="27" cy="35" r="1" fill="currentColor" />
      </svg>
    ),
  },
];

export function Q2Investing({ onBack, onSkip, onSelect }: Q2InvestingProps) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full space-y-3 sm:space-y-5 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="investing" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
          YOUR INVESTING STYLE
        </span>
        <h1 className="font-display font-bold text-lg sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          How are you investing right now?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Select the option that best describes your current investment approach.
        </p>
      </motion.div>

      {/* 2. Choice Cards Grid */}
      <motion.div variants={staggerItemVariants} className="space-y-2 sm:space-y-3">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="w-full p-2.5 sm:p-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/60 hover:bg-[color-mix(in_srgb,var(--color-accent)_3%,var(--color-surface))] flex items-center gap-3 sm:gap-4 text-left transition-all duration-200 cursor-pointer active:scale-[0.99] group shadow-xs select-none min-h-[44px]"
            onClick={() => onSelect(option.value)}
          >
            {/* Dedicated Editorial Illustration Tile */}
            <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)]/40 group-hover:scale-105 transition-all duration-200 shadow-2xs">
              {option.renderIllustration()}
            </div>

            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="block font-display font-semibold text-xs sm:text-[14px] text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                  {option.title}
                </strong>
                <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.2 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] group-hover:border-[var(--color-accent)]/40 group-hover:text-[var(--color-accent)] transition-colors">
                  {option.badge}
                </span>
              </div>
              <span className="block text-[11px] sm:text-xs text-[var(--color-text-secondary)] leading-tight sm:leading-relaxed">
                {option.subtitle}
              </span>
            </div>

            <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--color-accent)] group-hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] transition-all duration-150">
              <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all duration-150" />
            </div>
          </button>
        ))}
      </motion.div>

      {/* 3. Navigation Controls */}
      <motion.div variants={staggerItemVariants} className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer min-h-[44px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer min-h-[44px]"
        >
          Skip
        </button>
      </motion.div>
    </motion.div>
  );
}
