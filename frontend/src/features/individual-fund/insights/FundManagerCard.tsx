import { useState } from "react";
import { Modal } from "@/components/Modal";
import { CLICK_ROW, DISABLED } from "@/lib/clickable";
import { fundPageApi } from "../api";
import { SectionState } from "../components/SectionState";
import {
  COMING_SOON,
  MANAGER_COMING_SOON_NOTE,
  tenureText,
  unavailableText,
} from "../fundCopy";
import { formatDate, initialsOf } from "../fundFormat";
import type { ManagerOut, ManagerResponse } from "../types";
import { useFundSection } from "../useFundSection";

export interface FundManagerCardProps {
  schemeId: string;
}

export function FundManagerCard({ schemeId }: FundManagerCardProps) {
  const manager = useFundSection<ManagerResponse>(
    (signal) => fundPageApi.manager(schemeId, signal),
    [schemeId]
  );
  const [open, setOpen] = useState<ManagerOut | null>(null);

  const managers = manager.data?.managers ?? [];

  return (
    <section
      aria-labelledby="manager-title"
      className="space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <h3
        id="manager-title"
        className="text-base font-semibold text-[var(--ui-text)]"
      >
        Fund Manager and Strategy
      </h3>

      <SectionState
        status={manager.status}
        label="fund manager"
        reason={manager.reason}
        onRetry={manager.retry}
      >
        {managers.length === 0 ? (
          <p
            data-testid="manager-empty"
            className="text-sm text-[var(--ui-text-muted)]"
          >
            {unavailableText("no_manager_data")}
          </p>
        ) : (
          <div className="space-y-4">
            <ul aria-label="Fund managers" className="space-y-1">
              {managers.map((m, index) => {
                const tenure = tenureText(m.tenure_years);
                const hasSince = Boolean(m.managing_since && m.managing_since.trim());

                const handleKeyDown = (e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    setOpen(m);
                  } else if (e.key === " ") {
                    e.preventDefault();
                    setOpen(m);
                  }
                };

                return (
                  <li key={`${m.name}-${index}`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-haspopup="dialog"
                      data-testid={`manager-${index}`}
                      className={`${CLICK_ROW} flex items-center gap-3 rounded-lg px-2 py-2`}
                      onClick={() => setOpen(m)}
                      onKeyDown={handleKeyDown}
                    >
                      <span
                        data-testid="manager-initials"
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-card)] text-sm font-semibold text-[var(--c4)]"
                      >
                        {initialsOf(m.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <b
                          data-testid="manager-name"
                          className="block text-sm font-semibold text-[var(--ui-text)]"
                        >
                          {m.name}
                        </b>
                        <span
                          data-testid="manager-role"
                          className="block text-xs text-[var(--ui-text-muted)]"
                        >
                          {m.role}
                        </span>
                        {hasSince && (
                          <span
                            data-testid="manager-since"
                            className="block text-xs text-[var(--ui-text-muted)]"
                          >
                            {`Managing since ${formatDate(m.managing_since)}`}
                          </span>
                        )}
                      </div>
                      {tenure !== null && (
                        <span
                          data-testid="manager-tenure"
                          className="rounded-full bg-[var(--ui-card)] px-2.5 py-0.5 text-xs text-[var(--ui-text-muted)]"
                        >
                          {tenure}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-3 pt-2">
              <div>
                <p className="text-xs text-[var(--ui-text-muted)]">
                  Investment approach
                </p>
                <div className="mt-1">
                  <span
                    data-testid="manager-approach-chip"
                    aria-disabled="true"
                    title={COMING_SOON}
                    className={`${DISABLED} inline-block rounded-full px-2.5 py-0.5 text-xs`}
                  >
                    Coming soon
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--ui-text-muted)]">
                  Investment style
                </p>
                <div className="mt-1">
                  <span
                    data-testid="manager-style-chip"
                    aria-disabled="true"
                    title={COMING_SOON}
                    className={`${DISABLED} inline-block rounded-full px-2.5 py-0.5 text-xs`}
                  >
                    Coming soon
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SectionState>

      {open !== null && (
        <Modal isOpen onClose={() => setOpen(null)} title="Fund manager">
          <dl className="divide-y divide-[var(--ui-divider)]">
            <div
              data-testid="manager-popup-row"
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <dt className="text-[var(--ui-text-muted)]">Name</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {open.name}
              </dd>
            </div>
            <div
              data-testid="manager-popup-row"
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <dt className="text-[var(--ui-text-muted)]">Role</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {open.role}
              </dd>
            </div>
            {Boolean(open.managing_since && open.managing_since.trim()) && (
              <div
                data-testid="manager-popup-row"
                className="flex justify-between gap-3 py-2 text-sm"
              >
                <dt className="text-[var(--ui-text-muted)]">
                  Managing since
                </dt>
                <dd className="font-semibold text-[var(--ui-text)]">
                  {formatDate(open.managing_since)}
                </dd>
              </div>
            )}
            {tenureText(open.tenure_years) !== null && (
              <div
                data-testid="manager-popup-row"
                className="flex justify-between gap-3 py-2 text-sm"
              >
                <dt className="text-[var(--ui-text-muted)]">Tenure</dt>
                <dd className="font-semibold text-[var(--ui-text)]">
                  {tenureText(open.tenure_years)}
                </dd>
              </div>
            )}
            {Boolean(manager.data?.reference_period) && (
              <div
                data-testid="manager-popup-row"
                className="flex justify-between gap-3 py-2 text-sm"
              >
                <dt className="text-[var(--ui-text-muted)]">
                  Details as of
                </dt>
                <dd className="font-semibold text-[var(--ui-text)]">
                  {formatDate(manager.data!.reference_period)}
                </dd>
              </div>
            )}
          </dl>
          <p
            data-testid="manager-note"
            className="mt-3 text-sm text-[var(--ui-text-muted)]"
          >
            {MANAGER_COMING_SOON_NOTE}
          </p>
        </Modal>
      )}
    </section>
  );
}
