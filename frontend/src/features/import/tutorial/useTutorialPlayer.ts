import { useCallback, useEffect, useState } from "react";
import { TUTORIAL_VIDEO_URL } from "./tutorialCopy";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function matchesReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export interface TutorialPlayerState {
  open: boolean;
  show: () => void;
  hide: () => void;
  autoPlay: boolean;
  src: string | null;
}

export function useTutorialPlayer(): TutorialPlayerState {
  const [open, setOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(matchesReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    setReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    return undefined;
  }, []);

  const show = useCallback(() => {
    setReducedMotion(matchesReducedMotion());
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  return {
    open,
    show,
    hide,
    autoPlay: !reducedMotion,
    src: open ? TUTORIAL_VIDEO_URL : null,
  };
}
