import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { goalChips } from "../lib/goalChips";
import { investorLabel } from "../lib/investorLabel";
import { GoalsDialog } from "./GoalsDialog";
import { InvestorTypeDialog } from "./InvestorTypeDialog";

const SOON_FIELDS = [
  "Occupation",
  "Industry",
  "Annual income range",
  "Net worth range",
  "Risk profile",
  "Investment experience",
];

export interface FinancialDetailsCardProps {
  investorType: string | null;
  goals: readonly string[] | null | undefined;
}

export function FinancialDetailsCard({
  investorType,
  goals,
}: FinancialDetailsCardProps) {
  const [editing, setEditing] = useState<"investor" | "goals" | null>(null);
  const label = investorLabel(investorType);
  const chips = goalChips(goals);

  return (
    <section className="rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 shadow-sm">
      <h2 className="font-heading text-lg font-semibold text-[var(--ui-text)]">
        Financial Details
      </h2>
      <p className="mt-1 text-sm text-[var(--shell-text-body)]">
        From your onboarding answers. Used to personalise insights.
      </p>

      <div
        data-testid="row-investor-type"
        className="mt-4 flex items-center gap-3 border-t border-[var(--ui-divider)] py-3"
      >
        <span className="w-32 shrink-0 text-sm text-[var(--ui-text-muted)]">
          Investor type
        </span>
        <span className="flex-1 text-sm font-semibold text-[var(--ui-text)]">
          {label ? (
            label
          ) : (
            <span className="font-normal text-[var(--ui-text-muted)]">
              Not answered
            </span>
          )}
        </span>
        <button
          type="button"
          aria-label="Edit investor type"
          onClick={() => setEditing("investor")}
          className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
        >
          <Pencil size={15} aria-hidden="true" />
        </button>
      </div>

      <div
        data-testid="row-goals"
        className="flex items-start gap-3 border-t border-[var(--ui-divider)] py-3"
      >
        <span className="w-32 shrink-0 pt-1 text-sm text-[var(--ui-text-muted)]">
          Goals
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {chips.length === 0 ? (
            <span className="text-sm text-[var(--ui-text-muted)]">
              Not answered
            </span>
          ) : null}
          {chips.map(chip => (
            <span
              key={chip.label}
              data-testid="goal-chip"
              data-unknown={chip.unknown ? "true" : "false"}
              title={
                chip.unknown
                  ? "A newer option this screen does not know yet"
                  : undefined
              }
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold text-[var(--ui-text)] ${
                chip.unknown
                  ? "border-dashed border-[var(--ui-disabled-border)]"
                  : "border-[var(--ui-divider)] bg-[var(--pos-bg)]"
              }`}
            >
              {chip.label}
            </span>
          ))}
          {chips.length === 0 ? (
            <button
              type="button"
              aria-label="Add goals"
              onClick={() => setEditing("goals")}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--ui-divider)] px-2.5 py-1 text-xs font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              <Plus size={13} aria-hidden="true" />
              Add goals
            </button>
          ) : (
            <button
              type="button"
              aria-label="Edit goals"
              onClick={() => setEditing("goals")}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--ui-divider)] px-2.5 py-1 text-xs font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              <Pencil size={13} aria-hidden="true" />
              Edit
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-[var(--ui-text-muted)]">
        More coming soon
      </p>
      <ul
        aria-label="Financial details coming soon"
        className="mt-1 divide-y divide-[var(--ui-divider)] opacity-60"
      >
        {SOON_FIELDS.map(fieldName => (
          <li
            key={fieldName}
            data-status="soon"
            className="flex items-center gap-3 py-2 text-sm"
          >
            <span className="flex-1 text-[var(--ui-text-muted)]">
              {fieldName}
            </span>
            <span className="rounded-full border border-[var(--ui-divider)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ui-text-muted)]">
              Coming soon
            </span>
          </li>
        ))}
      </ul>

      {editing === "investor" ? (
        <InvestorTypeDialog
          stored={investorType}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing === "goals" ? (
        <GoalsDialog stored={goals} onClose={() => setEditing(null)} />
      ) : null}
    </section>
  );
}
