import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  SAVING_RETRY_SECONDS,
  STATEMENT_SAVING_BODY,
  STATEMENT_SAVING_REASSURE,
  STATEMENT_SAVING_TITLE,
} from "../lib/headChangeCopy";

function formatMinSec(total: number): string {
  const clamped = Math.max(0, Math.floor(total));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function StatementSavingNotice({
  onRetry,
  seconds = SAVING_RETRY_SECONDS,
}: {
  onRetry: () => void;
  seconds?: number;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining <= 0]);

  const disabled = remaining > 0;

  return (
    <div
      data-testid="statement-saving-notice"
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-[var(--info-border)] bg-[var(--info-bg)] p-3 text-[var(--ui-text)]"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--ui-elevated)] text-[var(--info)]">
          <Clock size={20} aria-hidden="true" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-[var(--info-text)]">{STATEMENT_SAVING_TITLE}</p>
          <p className="text-[13px]">{STATEMENT_SAVING_BODY}</p>
          <p className="mt-1 text-[12.5px] text-[var(--ui-text-muted)]">{STATEMENT_SAVING_REASSURE}</p>
        </div>
      </div>
      <button
        type="button"
        data-testid="saving-retry"
        data-clickable=""
        data-effect="retry"
        aria-live="off"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onRetry();
        }}
        className={
          disabled
            ? "self-start rounded-[12px] bg-[var(--ui-divider)] px-4 py-2 text-[13px] font-semibold text-[var(--ui-text-muted)] cursor-not-allowed"
            : "self-start rounded-[12px] bg-[var(--pos)] px-4 py-2 text-[13px] font-semibold text-white cursor-pointer hover:bg-[var(--pos)]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
        }
      >
        {disabled ? `Try again in ${formatMinSec(remaining)}` : "Try again"}
      </button>
    </div>
  );
}
