import { animate, type Transition, useMotionValue } from "motion/react";
import { useEffect, useRef } from "react";
import { DEFAULT_CHART_ENTER_TRANSITION } from "./animation";
import { usePrintMode } from "../../../lib/printMode";

/** Drives 0→1 enter progress using the studio motion transition (spring or tween). */
export function useMountProgress(
  enterTransition: Transition | undefined,
  delaySeconds: number,
  replayKey: number | string
) {
  const printing = usePrintMode() !== null;
  const progress = useMotionValue(printing ? 1 : 0);
  const transitionRef = useRef(enterTransition);
  transitionRef.current = enterTransition;

  useEffect(() => {
    if (printing) {
      progress.set(1);
      return;
    }
    progress.set(0);
    const controls = animate(progress, 1, {
      ...(transitionRef.current ?? DEFAULT_CHART_ENTER_TRANSITION),
      delay: delaySeconds,
    });
    return () => controls.stop();
  }, [delaySeconds, replayKey, progress, printing]);

  return progress;
}
