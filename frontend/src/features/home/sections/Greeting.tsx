import { useState } from "react";
import { ChevronRight, Moon, Sun } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { buildStatusSentence } from "../homeCopy";
import { greetingLine } from "../homeFormat";
import type { SummaryResponse } from "../types";

export interface GreetingProps {
  status: "loading" | "error" | "data";
  summary: SummaryResponse | null;
  onImport: (memberId?: string) => void;
}

export function Greeting({ status, summary, onImport }: GreetingProps) {
  const [open, setOpen] = useState(false);

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
          <div className="relative">
            <button
              type="button"
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
                onKeyDown={e => {
                  if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
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
          {sentence}
        </p>
      )}
    </div>
  );
}
