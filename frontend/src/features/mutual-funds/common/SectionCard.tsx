import { useId, type ReactNode } from "react";
import { Skeleton } from "../../../components/ui/skeleton";

export interface InfoMarkProps {
  text: string;
  testId?: string;
}

export function InfoMark({ text, testId }: InfoMarkProps) {
  return (
    <span
      role="img"
      tabIndex={0}
      aria-label={text}
      title={text}
      data-tooltip={text}
      data-testid={testId}
      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[var(--ui-divider)] text-[10px] font-semibold text-[var(--ui-text-muted)] hover:border-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
    >
      i
    </span>
  );
}

export interface SectionCardProps {
  title: string;
  info?: string;
  state: "loading" | "ready" | "failed" | "error";
  onRetry?: () => void;
  skeleton?: ReactNode;
  children: ReactNode;
}

export function SectionCard({
  title,
  info,
  state,
  onRetry,
  skeleton,
  children,
}: SectionCardProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <h3 id={headingId} className="text-base font-semibold text-[var(--ui-text)]">
          {title}
        </h3>
        {info && <InfoMark text={info} />}
      </div>

      {state === "loading" && (
        <div role="status" aria-label={`Loading ${title}`}>
          {skeleton ?? <Skeleton className="h-24 w-full rounded-lg" />}
        </div>
      )}

      {(state === "failed" || state === "error") && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-sm text-[var(--ui-text-muted)]">
            This section failed to load, but the rest of the page is unaffected.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              data-clickable=""
              data-effect="retry"
              className="self-start text-sm font-medium text-[var(--pos-text)] hover:underline"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {state === "ready" && children}
    </section>
  );
}
