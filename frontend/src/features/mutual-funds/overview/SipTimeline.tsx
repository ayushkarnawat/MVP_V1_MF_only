import { useCallback, useState } from "react";
import { Skeleton } from "../../../components/ui/skeleton";
import { formatDate, formatRupees } from "../../../lib/format";
import { useScope } from "../../../shell/scope/ScopeContext";
import { getSipsMonthly } from "../api";
import { InfoMark } from "../common/SectionCard";
import { useMfSection } from "../data/useMfDashboard";
import { MONTHS_LONG, dayMonth, monthlySipTotal } from "../mfCopy";
import type { SipMonthlyRow, SipRow } from "../types";

export interface SipTimelineProps {
  sips: {
    status: "loading" | "data" | "error";
    data: SipRow[] | null;
    retry: () => void;
  };
}

export function SipTimeline({ sips }: SipTimelineProps) {
  const { viewMode, memberId } = useScope();
  const [activeTab, setActiveTab] = useState<"upcoming" | "month" | "stopped">("upcoming");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [date, setDate] = useState(() => new Date());
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  const monthlyLoad = useMfSection(
    useCallback(
      (signal: AbortSignal) => {
        if (activeTab !== "month") {
          return Promise.resolve<SipMonthlyRow[]>([]);
        }
        return getSipsMonthly({ viewMode, memberId }, year, month, signal);
      },
      [activeTab, viewMode, memberId, year, month]
    ),
    [activeTab, viewMode, memberId, year, month]
  );

  const prevMonth = () => {
    setDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  if (sips.status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading SIPs"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
      >
        <Skeleton className="h-32 w-full rounded-xl" />
      </section>
    );
  }

  if (sips.status === "error" || sips.data === null) {
    return (
      <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h4 className="text-base font-semibold text-[var(--ui-text)]">
          Couldn't load your SIPs
        </h4>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
          This section failed to load, but the rest of the page is unaffected.
        </p>
        <button
          type="button"
          onClick={sips.retry}
          data-clickable=""
          data-effect="retry"
          className="mt-3 text-sm font-medium text-[var(--pos-text)] hover:underline"
        >
          Retry
        </button>
      </section>
    );
  }

  const activeSips = sips.data.filter(s => (s.status ?? "active") === "active");
  const stoppedSips = sips.data.filter(s => s.status === "stopped");

  const sortedActive = [...activeSips].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  const nextSip = sortedActive[0] ?? null;

  const distinctDates = Array.from(new Set(activeSips.map(s => s.next_due_date))).sort((a, b) =>
    a.localeCompare(b)
  );
  const effectiveDate = (selectedDate && distinctDates.includes(selectedDate)) ? selectedDate : distinctDates[0] ?? null;

  const sipsForDate = effectiveDate ? activeSips.filter(s => s.next_due_date === effectiveDate) : [];

  return (
    <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <h3 id="sip-title" className="text-base font-semibold text-[var(--ui-text)]">
            SIPs
          </h3>
          <InfoMark
            text="Every active and stopped systematic investment plan across your family, scoped to the selected member."
            testId="info-sips"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {nextSip && (
            <span
              data-testid="sip-next"
              className="rounded-full bg-[var(--ui-card)] px-3 py-1 font-medium text-[var(--ui-text)] border border-[var(--ui-divider)]"
            >
              Next: {nextSip.scheme_name} · {dayMonth(nextSip.next_due_date)} · {formatRupees(nextSip.sip_amount)}
            </span>
          )}
          <span
            data-testid="sip-total"
            className="rounded-full bg-[var(--ui-card)] px-3 py-1 font-medium text-[var(--ui-text)] border border-[var(--ui-divider)]"
          >
            Monthly SIP total {formatRupees(monthlySipTotal(sips.data))}
          </span>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="SIP view"
        className="inline-flex rounded-xl border border-[var(--ui-divider)] p-1 mb-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "upcoming"}
          data-clickable=""
          data-effect="switch"
          onClick={() => setActiveTab("upcoming")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "upcoming"
              ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
              : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
          }`}
        >
          Upcoming ({activeSips.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "month"}
          data-clickable=""
          data-effect="switch"
          onClick={() => setActiveTab("month")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "month"
              ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
              : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
          }`}
        >
          This Month
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "stopped"}
          data-clickable=""
          data-effect="switch"
          onClick={() => setActiveTab("stopped")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "stopped"
              ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
              : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
          }`}
        >
          Stopped ({stoppedSips.length})
        </button>
      </div>

      {activeTab === "upcoming" && (
        <div>
          {activeSips.length === 0 ? (
            <p className="text-sm text-[var(--ui-text-muted)]">No active SIPs.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {distinctDates.map(dueDate => {
                  const onDate = activeSips.filter(s => s.next_due_date === dueDate);
                  const isSelected = effectiveDate === dueDate;
                  const day = dueDate.slice(8, 10);
                  const monthNameShort = dayMonth(dueDate).split(" ")[1];
                  return (
                    <button
                      key={dueDate}
                      type="button"
                      data-testid={`sip-cap-${dueDate}`}
                      data-count={onDate.length}
                      aria-pressed={isSelected}
                      data-clickable=""
                      data-effect="select"
                      onClick={() => setSelectedDate(dueDate)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2.5 min-w-[76px] transition-colors ${
                        isSelected
                          ? "border-[var(--pos)] bg-[var(--pos-bg)] text-[var(--pos-text)]"
                          : "border-[var(--ui-divider)] bg-[var(--ui-card)] text-[var(--ui-text)] hover:border-[var(--ui-text-muted)]"
                      }`}
                    >
                      <span className="text-lg font-bold leading-tight">{day}</span>
                      <span className="text-[11px] font-medium uppercase tracking-wider">{monthNameShort}</span>
                      <div className="flex gap-0.5 my-1">
                        {onDate.map((_, i) => (
                          <span
                            key={i}
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-[var(--pos)]"
                          />
                        ))}
                      </div>
                      <span className="text-xs font-semibold">{formatRupees(monthlySipTotal(onDate))}</span>
                    </button>
                  );
                })}
              </div>

              {effectiveDate && (
                <div data-testid="sip-detail" className="flex flex-col gap-2 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4">
                  <h4 className="text-sm font-semibold text-[var(--ui-text)]">
                    SIPs on {dayMonth(effectiveDate)}
                  </h4>
                  <div className="flex flex-col divide-y divide-[var(--ui-divider)]">
                    {sipsForDate.map((sip, idx) => (
                      <div key={`${sip.scheme_id}-${idx}`} className="flex items-center justify-between py-2">
                        <div>
                          <div className="text-sm font-medium text-[var(--ui-text)]">{sip.scheme_name}</div>
                          <div className="text-xs text-[var(--ui-text-muted)]">
                            {sip.household_member_name} · {formatDate(sip.next_due_date)}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-[var(--ui-text)]">
                          {formatRupees(monthlySipTotal([sip]))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "month" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Previous month"
              data-clickable=""
              data-effect="navigate"
              onClick={prevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] text-sm font-bold text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]"
            >
              ←
            </button>
            <span className="text-sm font-semibold text-[var(--ui-text)]">
              {MONTHS_LONG[month - 1]} {year}
            </span>
            <button
              type="button"
              aria-label="Next month"
              data-clickable=""
              data-effect="navigate"
              onClick={nextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] text-sm font-bold text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]"
            >
              →
            </button>
          </div>

          {monthlyLoad.status === "loading" && (
            <div role="status" aria-label="Loading month">
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          )}

          {monthlyLoad.status === "error" && (
            <div role="alert" className="flex flex-col gap-2">
              <p className="text-sm text-[var(--ui-text-muted)]">Couldn't load this month</p>
              <button
                type="button"
                onClick={monthlyLoad.retry}
                data-clickable=""
                data-effect="retry"
                className="self-start text-sm font-medium text-[var(--pos-text)] hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {monthlyLoad.status === "data" && monthlyLoad.data && (
            <div className="flex flex-col divide-y divide-[var(--ui-divider)]">
              {monthlyLoad.data.map((row, idx) => (
                <div
                  key={`${row.scheme_id}-${idx}`}
                  data-testid={`sip-month-${row.scheme_id}`}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <div className="text-sm font-medium text-[var(--ui-text)]">{row.scheme_name}</div>
                    <div className="text-xs text-[var(--ui-text-muted)]">
                      {row.household_member_name} · {formatDate(row.date)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-[var(--ui-text)]">
                    {formatRupees(row.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "stopped" && (
        <div>
          {stoppedSips.length === 0 ? (
            <p className="text-sm text-[var(--ui-text-muted)]">No stopped SIPs.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--ui-divider)]">
              {stoppedSips.map((row, idx) => (
                <div
                  key={`${row.scheme_id}-${idx}`}
                  data-testid={`sip-stopped-${row.scheme_id}`}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <div className="text-sm font-medium text-[var(--ui-text)]">{row.scheme_name}</div>
                    <div className="text-xs text-[var(--ui-text-muted)]">{row.household_member_name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[var(--ui-text)]">
                      {formatRupees(row.sip_amount)}
                    </span>
                    <span className="rounded-md bg-[var(--warn-bg)] px-2 py-0.5 text-xs font-medium text-[var(--warn-text)]">
                      Stopped
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
