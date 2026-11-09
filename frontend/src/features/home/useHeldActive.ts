import { useCallback, useEffect, useRef, useState } from "react";

export function useHeldActive(clearDelayMs = 90): {
  active: string | null;
  enter: (key: string) => void;
  leave: () => void;
  clearNow: () => void;
} {
  const [active, setActive] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDelayRef = useRef(clearDelayMs);
  clearDelayRef.current = clearDelayMs;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const enter = useCallback(
    (key: string) => {
      clearTimer();
      setActive(key);
    },
    [clearTimer]
  );

  const leave = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setActive(null);
      timerRef.current = null;
    }, clearDelayRef.current);
  }, [clearTimer]);

  const clearNow = useCallback(() => {
    clearTimer();
    setActive(null);
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { active, enter, leave, clearNow };
}
