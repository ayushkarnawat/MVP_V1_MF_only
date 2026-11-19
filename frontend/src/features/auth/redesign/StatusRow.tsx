import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

export interface StatusRowProps {
  label: string;
  description?: string;
  state: "done" | "active" | "pending";
}

const STATE_WORDS = { done: "Done", active: "In progress", pending: "Not started" } as const;

export function StatusRow({ label, description, state }: StatusRowProps) {
  const prevState = useRef(state);
  const popped = useRef(false);

  const reducedMotion =
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const shouldPop =
    state === "done" && (popped.current || prevState.current !== "done") && !reducedMotion;

  useEffect(() => {
    if (state === "done" && prevState.current !== "done") {
      popped.current = true;
    } else if (state !== "done") {
      popped.current = false;
    }
    prevState.current = state;
  }, [state]);

  return (
    <div data-testid="status-row" data-state={state} className="flex items-start gap-3.5 text-left">
      <span aria-hidden="true" className="mt-0.5 flex shrink-0 items-center justify-center">
        {state === "done" ? (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full bg-[var(--auth-green)] text-[#111111]${shouldPop ? " auth-tick-pop" : ""}`}
          >
            <Check size={14} strokeWidth={3} />
          </span>
        ) : state === "active" ? (
          <span className="h-6 w-6 rounded-full border-2 border-[var(--auth-line)] border-t-[var(--auth-green)] animate-spin motion-reduce:animate-none" />
        ) : (
          <span className="h-6 w-6 rounded-full border-2 border-[var(--auth-line)]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-[var(--auth-ink)]">
          {label}
          <span className="sr-only">{STATE_WORDS[state]}</span>
        </p>
        {description ? <p className="text-[13px] text-[var(--auth-muted)]">{description}</p> : null}
      </div>
    </div>
  );
}
