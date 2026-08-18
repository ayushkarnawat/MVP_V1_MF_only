import type { Variants, Transition } from "motion/react";

export const isTestEnv = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";

/** Standard easing tokens matching tokens.css */
export const MOTION_EASING: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** Timing constants in seconds for Framer Motion */
export const DURATION_FAST = 0.15; // 150ms
export const DURATION_REVEAL = 0.4; // 400ms
export const DURATION_PAGE = 0.3; // 300ms

/** Tier 1: Section-level stagger hierarchy (40–60ms offset between elements, motion-reveal) */
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
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
