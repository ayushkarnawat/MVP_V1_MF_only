import { Check } from "lucide-react";

export interface StatusRowProps {
  label: string;
  description?: string;
  state: "done" | "active" | "pending";
}

const STATE_WORDS = { done: "Done", active: "In progress", pending: "Not started" } as const;

export function StatusRow({ label, description, state }: StatusRowProps) {
  return (
    <div data-testid="status-row" data-state={state} className="flex items-start gap-3.5 text-left">
      <span aria-hidden="true" className="mt-0.5 flex shrink-0 items-center justify-center">
        {state === "done" ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--auth-green)] text-white">
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
