import { useCallback, useEffect, useState } from "react";

/** Display only: the server still answers 429 "Please wait Ns" and that message is shown as it is. */
export function useResendCountdown(start = 60) {
  const [seconds, setSeconds] = useState(start);
  const running = seconds > 0;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  const restart = useCallback(() => setSeconds(start), [start]);
  return { seconds, active: running, restart };
}

export function formatMmSs(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
