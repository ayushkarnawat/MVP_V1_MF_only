import { useId, type ReactNode } from "react";
import { InfoPopover } from "../../../components/info/InfoPopover";
import { INFO_GLYPH_CLASS } from "@/components/info/infoGlyph";
import { Skeleton } from "../../../components/ui/skeleton";
import { usePrintMode } from "../../../lib/printMode";

export interface InfoMarkProps {
  text: string;
  testId?: string;
  /** Richer popover content (for example one paragraph per line). The name and tooltip attribute stay `text`. */
  content?: ReactNode;
}

export function InfoMark({ text, testId, content }: InfoMarkProps) {
  const printMode = usePrintMode();
  if (printMode) return null;
  return (
    <InfoPopover
      label={text}
      trigger={
        <span
          role="img"
          tabIndex={0}
          aria-label={text}
          title={text}
          data-tooltip={text}
          data-testid={testId}
          className={INFO_GLYPH_CLASS}
        >
          i
        </span>
      }
    >
      {content ?? text}
    </InfoPopover>
  );
}

export interface SectionCardProps {
  title: string;
  info?: string;
  anchor?: string;
  state: "loading" | "ready" | "failed" | "error";
  onRetry?: () => void;
  skeleton?: ReactNode;
  children: ReactNode;
}

export function SectionCard({
  title,
  info,
  anchor,
  state,
  onRetry,
  skeleton,
  children,
}: SectionCardProps) {
  const headingId = useId();
  const printMode = usePrintMode();

  return (
    <section
      id={anchor}
      aria-labelledby={headingId}
      className={
        anchor
          ? "scroll-mt-6 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
          : "rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
      }
    >
      <div className="flex items-center gap-2 mb-4">
        <h3 id={headingId} className="text-base font-semibold text-[var(--ui-text)]">
          {title}
        </h3>
        {info && !printMode && <InfoMark text={info} />}
      </div>

      {state === "loading" && !printMode && (
        <div role="status" aria-label={`Loading ${title}`}>
          {skeleton ?? <Skeleton className="h-24 w-full rounded-lg" />}
        </div>
      )}

      {(state === "failed" || state === "error") && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-sm text-[var(--ui-text-muted)]">
            This section failed to load, but the rest of the page is unaffected.
          </p>
          {onRetry && !printMode && (
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
