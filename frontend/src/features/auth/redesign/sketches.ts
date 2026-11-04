export type SketchName = "laptop" | "phone" | "envelope" | "idCard" | "person" | "cards" | "wallet" | "tick";

/** The official wordmark (tight crop, transparent), the same file the rest of the app uses. */
export const LOGO_FILE = "/brand/unifolio-logo-light.png";

/** Hand-drawn vector sketches with transparent backgrounds, drawn for the redesign (see public/illustrations/auth/README.md). */
export const SKETCH_FILES: Record<SketchName, string> = {
  laptop: "laptop.svg",
  phone: "phone.svg",
  envelope: "envelope.svg",
  idCard: "id-card.svg",
  person: "person.svg",
  cards: "cards.svg",
  wallet: "wallet.svg",
  tick: "tick.svg",
};

export interface SketchMotion {
  motion: "float" | "tilt" | "breathe";
  /** How far it moves, in px (not used by breathe). */
  distance: number;
  /** One full cycle, in seconds. */
  duration: number;
}

// The design's motion table (Q62).
export const SKETCH_MOTION: Record<SketchName, SketchMotion> = {
  laptop: { motion: "float", distance: 6, duration: 7 },
  phone: { motion: "tilt", distance: 5, duration: 6.5 },
  envelope: { motion: "float", distance: 5, duration: 7 },
  idCard: { motion: "float", distance: 4, duration: 7.5 },
  person: { motion: "breathe", distance: 0, duration: 8 },
  cards: { motion: "float", distance: 6, duration: 8 },
  wallet: { motion: "float", distance: 6, duration: 7 },
  tick: { motion: "float", distance: 6, duration: 7 },
};

const BASE = "/illustrations/auth/";
export const sketchSrc = (name: SketchName): string => `${BASE}${SKETCH_FILES[name]}`;
export const logoSrc = (): string => LOGO_FILE;
