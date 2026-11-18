import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Display only: the server still answers 429 "Please wait Ns" and that message is shown as it is.
 *
 * It counts against the clock, not the number of ticks: a tab that was asleep fires its timer late, and subtracting one second per
 * tick would leave the button disabled long after the server is ready (Codex whole-batch review of B, finding 2). It also catches
 * up the moment the tab becomes visible again.
 */
export function useResendCountdown(start = 60) {
  const endsAt = useRef(Date.now() + start * 1000);
  const [seconds, setSeconds] = useState(start);
  const running = seconds > 0;
  useEffect(() => {
    if (!running) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000)));
    const id = setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, [running]);
  /** Starts again from `next` (the seconds the server said are left) or, with no argument, from the starting value. */
  const restart = useCallback((next?: number) => {
    const from = typeof next === "number" ? Math.max(0, next) : start;
    endsAt.current = Date.now() + from * 1000;
    setSeconds(from);
  }, [start]);
  return { seconds, active: running, restart };
}

export function formatMmSs(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
