import { useEffect, useRef, useState } from "react";
import { ChevronRight, Moon, Sun } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { buildStatusSentence } from "../homeCopy";
import { greetingLine } from "../homeFormat";
import type { SummaryResponse } from "../types";

export interface GreetingProps {
  status: "loading" | "error" | "data";
  summary: SummaryResponse | null;
  onImport: (memberId?: string) => void;
  onTopMover?: () => void;
}

export function Greeting({ status, summary, onImport, onTopMover }: GreetingProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The popup is not a modal, but it takes focus when opened, closes on Escape (focus back to the chip)
  // and closes on a press outside it.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        chipRef.current?.focus();
      }
    };
    const onPress = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPress);
    };
  }, [open]);

  if (status === "loading") {
    return (
      <div role="status" aria-label="Loading greeting" className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
    );
  }

  if (status === "error" || !summary) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      </div>
    );
  }

  const Icon = summary.greeting === "evening" ? Moon : Sun;
  const iconName = summary.greeting === "evening" ? "moon" : "sun";

  if (!summary.has_holdings) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Icon
            data-testid="greeting-icon"
            data-icon={iconName}
            aria-hidden="true"
            className="size-6 text-[var(--ui-text-muted)]"
          />{greetingLine(summary.greeting, summary.display_name)}
        </h1>
        <p className="mt-2 text-sm text-[var(--ui-text-muted)]">
          Import a statement to see your portfolio.
        </p>
        <button
          type="button"
          onClick={() => onImport()}
          className="mt-3 inline-flex items-center rounded-lg bg-[var(--ui-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Import statement
        </button>
      </div>
    );
  }

  const sentence = buildStatusSentence(summary);

  // The closing clause "<name> drove most of the gains." makes the name a button (register C99): found by
  // the clause, not by the name alone, because the same words can also appear earlier in the sentence.
  const topName = summary.top_contributor;
  const clauseAt =
    sentence && onTopMover && topName ? sentence.lastIndexOf(` ${topName} drove most of`) : -1;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Icon
            data-testid="greeting-icon"
            data-icon={iconName}
            aria-hidden="true"
            className="size-6 text-[var(--ui-text-muted)]"
          />{greetingLine(summary.greeting, summary.display_name)}
        </h1>

        {summary.data_line && (
          <div className="relative" ref={wrapperRef}>
            <button
              type="button"
              ref={chipRef}
              data-testid="members-chip"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={() => setOpen(prev => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-elevated)] px-3 py-1 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-bg-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
            >
              <span className="size-1.5 rounded-full bg-[var(--ui-accent)]" aria-hidden="true" />
              <span>{summary.data_line}</span>
              <ChevronRight size={14} className="text-[var(--ui-text-muted)]" aria-hidden="true" />
            </button>

            {open && (
              <div
                role="dialog"
                aria-label="Family members"
                tabIndex={-1}
                ref={dialogRef}
                className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-elevated)] p-3 shadow-lg"
              >
                <ul className="space-y-2">
                  {summary.members.map(member => (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-medium text-[var(--ui-text)] truncate">
                        {member.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[var(--ui-text-muted)]">
                          {member.has_data ? "Data imported" : "No data yet"}
                        </span>
                        {!member.has_data && (
                          <button
                            type="button"
                            onClick={() => onImport(member.id)}
                            className="rounded px-2 py-0.5 font-medium text-[var(--ui-accent)] hover:underline"
                          >
                            Import statement
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {sentence && (
        <p
          data-testid="greeting-sentence"
          className="text-sm text-[var(--ui-text-muted)] leading-relaxed"
        >
          {clauseAt >= 0 && topName ? (
            <>
              {sentence.slice(0, clauseAt + 1)}
              <button
                type="button"
                data-testid="greeting-top-mover"
                aria-haspopup="dialog"
                onClick={onTopMover}
                className="font-semibold text-[var(--ui-text)] underline decoration-[var(--ui-accent)] underline-offset-[3px] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
              >
                {topName}
              </button>
              {sentence.slice(clauseAt + 1 + topName.length)}
            </>
          ) : (
            sentence
          )}
        </p>
      )}
    </div>
  );
}
