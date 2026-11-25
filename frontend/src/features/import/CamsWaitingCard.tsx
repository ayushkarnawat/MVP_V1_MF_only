import { useMemo, useState, type JSX } from "react";
import { Clock } from "lucide-react";
import {
  WAITING_CARD_TITLE,
  waitingCardFor,
  WAITING_CARD_BODY,
  waitingCardExpires,
  WAITING_CARD_SHOW,
  WAITING_CARD_UPLOAD,
} from "./pendingCopy";

export interface CamsWaitingCardProps {
  request: { import_id: string; household_member_id: string; expires_at: string };
  memberName?: string;
  checklistMode: "window" | "panel" | "closed";
  onShowChecklist: () => void;
  onUpload: () => void;
  onCancel: () => Promise<void>;
}

export function CamsWaitingCard({
  request,
  memberName,
  checklistMode,
  onShowChecklist,
  onUpload,
  onCancel,
}: CamsWaitingCardProps): JSX.Element {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hours = useMemo(
    () => Math.max(1, Math.ceil((Date.parse(request.expires_at) - Date.now()) / 3_600_000)),
    [request.expires_at],
  );

  const handleCancelClick = async () => {
    setCancelling(true);
    setError(null);
    try {
      await onCancel();
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : "Failed to cancel request.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <section
      data-testid="cams-waiting-card"
      aria-label={WAITING_CARD_TITLE}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs p-4 sm:p-5 space-y-3 text-left"
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-[10px] bg-[var(--color-bg)] flex items-center justify-center flex-shrink-0">
          <Clock className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
        </div>
        <h2 className="font-display font-semibold text-sm sm:text-base text-[var(--color-ink)]">
          {WAITING_CARD_TITLE}
          {memberName ? (
            <span className="font-normal text-[var(--color-text-secondary)]">
              {" "}
              {waitingCardFor(memberName)}
            </span>
          ) : null}
        </h2>
      </div>

      <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
        {WAITING_CARD_BODY} {waitingCardExpires(hours)}
      </p>

      <div className="flex flex-wrap items-center sm:justify-end gap-2">
        {checklistMode === "window" && (
          <button
            type="button"
            data-clickable=""
            data-effect="open"
            onClick={onShowChecklist}
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] cursor-pointer min-h-[36px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
          >
            {WAITING_CARD_SHOW}
          </button>
        )}

        <button
          type="button"
          data-clickable=""
          data-effect="expand"
          onClick={onUpload}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-ink)] hover:bg-[var(--color-surface)] cursor-pointer min-h-[36px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
        >
          {WAITING_CARD_UPLOAD}
        </button>

        <button
          type="button"
          data-clickable=""
          data-effect="close"
          data-testid="cams-waiting-cancel"
          onClick={handleCancelClick}
          disabled={cancelling}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-bg)] disabled:opacity-50 cursor-pointer min-h-[36px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
        >
          {cancelling ? "Cancelling..." : "Cancel request"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          {error}
        </p>
      )}
    </section>
  );
}
