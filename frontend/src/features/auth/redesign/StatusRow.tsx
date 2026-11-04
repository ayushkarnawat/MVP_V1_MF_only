import { Check, Loader2 } from "lucide-react";

export interface StatusRowProps {
  label: string;
  description?: string;
  state: "done" | "active" | "pending";
}

const STATE_WORDS = { done: "Done", active: "In progress", pending: "Not started" } as const;

export function StatusRow({ label, description, state }: StatusRowProps) {
  return (
    <div data-testid="status-row" data-state={state} className="flex items-start gap-3 text-left">
      <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[var(--auth-step-on)]">
        {state === "done" ? <Check size={14} /> : state === "active" ? <Loader2 size={14} className="animate-spin" /> : null}
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--ui-text)]">{label}<span className="sr-only">{STATE_WORDS[state]}</span></p>
        {description ? <p className="text-xs text-[var(--ui-text-muted)]">{description}</p> : null}
      </div>
    </div>
  );
}
