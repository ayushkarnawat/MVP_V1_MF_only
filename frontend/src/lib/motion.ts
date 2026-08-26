import type { Variants, Transition } from "motion/react";

export const isTestEnv = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";

/** Premium, calm easing curves for sophisticated high-end product feel */
export const MOTION_EASING: [number, number, number, number] = [0.16, 1, 0.3, 1]; // Quintic-like gentle deceleration
export const MOTION_EASING_SMOOTH: [number, number, number, number] = [0.22, 1, 0.36, 1]; // Fluid micro-interactions
export const MOTION_EASING_FLOAT: [number, number, number, number] = [0.45, 0.05, 0.55, 0.95]; // Smooth ambient levitation

/** Timing constants in seconds for Framer Motion */
export const DURATION_FAST = 0.18; // 180ms
export const DURATION_REVEAL = 0.45; // 450ms
export const DURATION_PAGE = 0.35; // 350ms
export const DURATION_ILLUSTRATION = 0.55; // 550ms

/** Tier 1: Section-level stagger hierarchy (40–60ms offset between elements, motion-reveal) */
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION_REVEAL,
      ease: MOTION_EASING,
    },
  },
};

/** Specialized Onboarding Flow Orchestration: Headings -> Illustration -> Subtext -> Options */
export const onboardingContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.03,
    },
  },
};

export const onboardingHeadingVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.46,
      ease: MOTION_EASING,
    },
  },
};

export const onboardingIllustrationVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: DURATION_ILLUSTRATION,
      ease: MOTION_EASING,
    },
  },
};

export const onboardingSubtextVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.44,
      ease: MOTION_EASING,
    },
  },
};

export const onboardingOptionsContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.02,
    },
  },
};

export const onboardingOptionItemVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: MOTION_EASING,
    },
  },
};

export const onboardingFooterVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: MOTION_EASING,
    },
  },
};

/** Tier 2: Row-level stagger hierarchy (30ms offset for ImportFileProgressList) */
export const listContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
    },
  },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: DURATION_FAST,
      ease: MOTION_EASING,
    },
  },
};

/** Standard transition for page / step swap */
export const pageTransition: Transition = {
  duration: DURATION_PAGE,
  ease: MOTION_EASING,
};
