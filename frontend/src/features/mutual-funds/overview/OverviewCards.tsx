import { useId, useState } from "react";
import { Modal } from "../../../components/Modal";
import { Skeleton } from "../../../components/ui/skeleton";
import { sumDecimalStrings } from "../../../lib/decimal";
import { formatCompactRupees, formatPercent, formatRupees } from "../../../lib/format";
import { useScope } from "../../../shell/scope/ScopeContext";
import { InfoMark } from "../common/SectionCard";
import { FundLink } from "../common/FundLink";
import { SlicedDonut, useSelectedSlice } from "../common/charts";
import { memberInitials, percentOf, slugify } from "../mfCopy";
import type { AllocationSummary, FamilyMemberStatus, HoldingRow, Load, Slice } from "../types";

export interface AmcAllocationCardProps {
  allocation: Load<AllocationSummary>;
  holdings: Load<HoldingRow[]>;
}

export function AmcAllocationCard({ allocation, holdings }: AmcAllocationCardProps) {
  const headingId = useId();
  const [dialogOpen, setDialogOpen] = useState(false);

  const slices: Slice[] = (allocation.data?.by_amc ?? []).map((item, index) => ({
    key: slugify(item.label),
    label: item.label,
    value: item.current_value,
    pct: String(item.percentage),
    color: `var(--c${(index % 8) + 1})`,
  }));

  const sel = useSelectedSlice(slices);

  if (allocation.status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading AMC allocation"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
      >
        <Skeleton className="h-64 w-full rounded-xl" />
      </section>
    );
  }

  if (allocation.status === "error" || allocation.data === null) {
    return (
      <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h4 className="text-base font-semibold text-[var(--ui-text)]">
          Couldn't load your AMC allocation
        </h4>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
          This section failed to load, but the rest of the page is unaffected.
        </p>
        <button
          type="button"
          onClick={allocation.retry}
          data-clickable=""
          data-effect="retry"
          className="mt-3 text-sm font-medium text-[var(--pos-text)] hover:underline"
        >
          Retry
        </button>
      </section>
    );
  }

  const selectedAmc = slices.find(s => s.key === sel.selectedKey) ?? null;
  const drillHoldings = (holdings.data ?? []).filter(
    h => h.amc_name === selectedAmc?.label && h.current_value !== null
  );

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <h3 id={headingId} className="text-base font-semibold text-[var(--ui-text)]">
          AMC Allocation
        </h3>
        <InfoMark
          text="Current value grouped by asset management company, across all your mutual fund holdings."
          testId="info-amc"
        />
      </div>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start lg:flex-col lg:items-center 2xl:flex-row 2xl:items-start">
        <SlicedDonut
          slices={slices}
          selectedKey={sel.selectedKey}
          onSelect={key => {
            sel.select(key);
            setDialogOpen(true);
          }}
          activeKey={sel.activeKey}
          onActiveChange={sel.hover}
          centre={{
            label: "Total",
            value: formatCompactRupees(allocation.data.total_value),
          }}
        />

        <ul aria-label="AMC allocation" className="flex min-w-0 flex-1 flex-col gap-2 w-full">
          {slices.map(slice => {
            const isSelected = sel.selectedKey === slice.key;
            return (
              <li
                key={slice.key}
                data-testid={`legend-${slice.key}`}
                className="min-w-0"
                data-value={slice.value}
                onMouseEnter={() => sel.hover(slice.key)}
                onMouseLeave={() => sel.hover(null)}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  data-clickable=""
                  data-effect="select"
                  onClick={() => {
                    sel.select(slice.key);
                    setDialogOpen(true);
                  }}
                  className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg p-1.5 text-xs transition-colors ${
                    isSelected ? "bg-[var(--ui-row-hover)]" : "hover:bg-[var(--ui-row-hover)]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden="true"
                      style={{ backgroundColor: slice.color }}
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                    />
                    <span className="truncate font-medium text-[var(--ui-text)]">
                      {slice.label}
                    </span>
                  </div>
                  <span className="shrink-0 font-semibold text-[var(--ui-text-muted)]">
                    {formatPercent(slice.pct, { digits: 1 })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selectedAmc && (
        <Modal
          title={selectedAmc.label}
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
        >
          <div className="flex flex-col divide-y divide-[var(--ui-divider)]">
            {drillHoldings.map((h, i) => (
              <div
                key={`${h.scheme_id}-${i}`}
                data-testid="drill-row"
                data-value={h.current_value}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-medium text-[var(--ui-text)]">
                  <FundLink schemeId={h.scheme_id}>{h.scheme_name}</FundLink>
                </span>
                <span className="font-semibold text-[var(--ui-text)]">
                  {formatRupees(h.current_value)}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}

export interface FamilyMembersCardProps {
  holdings: Load<HoldingRow[]>;
  members: Load<FamilyMemberStatus[]>;
}

export function FamilyMembersCard({ holdings, members }: FamilyMembersCardProps) {
  const headingId = useId();
  const { viewMode, setMember } = useScope();

  if (viewMode === "member") {
    return null;
  }

  if (holdings.status === "loading" || members.status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading family members"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
      >
        <Skeleton className="h-64 w-full rounded-xl" />
      </section>
    );
  }

  if (
    holdings.status === "error" ||
    members.status === "error" ||
    holdings.data === null ||
    members.data === null
  ) {
    const retry = holdings.status === "error" ? holdings.retry : members.retry;
    return (
      <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h4 className="text-base font-semibold text-[var(--ui-text)]">
          Couldn't load family members
        </h4>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
          This section failed to load, but the rest of the page is unaffected.
        </p>
        <button
          type="button"
          onClick={retry}
          data-clickable=""
          data-effect="retry"
          className="mt-3 text-sm font-medium text-[var(--pos-text)] hover:underline"
        >
          Retry
        </button>
      </section>
    );
  }

  if (members.data.length < 2) {
    return (
      <section
        aria-labelledby={headingId}
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
      >
        <div className="flex items-center gap-2 mb-2">
          <h3 id={headingId} className="text-base font-semibold text-[var(--ui-text)]">
            Family Members
          </h3>
          <InfoMark text="Current value by household member, across all your mutual fund holdings." />
        </div>
        <p className="text-sm text-[var(--ui-text-muted)]">
          You're the only member in this household — nothing to compare yet. Add a family member from Profile to see a breakdown here.
        </p>
      </section>
    );
  }

  const memberStats = members.data.map(member => {
    const pricedHoldings = holdings.data!.filter(
      h => !h.nav_unavailable && h.household_member_id === member.id
    );
    const value =
      pricedHoldings.length > 0
        ? sumDecimalStrings(pricedHoldings.map(h => h.current_value || "0"))
        : "0";
    return {
      member,
      value,
    };
  });

  const total = sumDecimalStrings(memberStats.map(s => s.value));

  const rows = memberStats.map(s => ({
    ...s,
    share: percentOf(s.value, total),
  }));

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex items-center gap-2 mb-1">
        <h3 id={headingId} className="text-base font-semibold text-[var(--ui-text)]">
          Family Members
        </h3>
        <InfoMark text="Current value by household member, across all your mutual fund holdings." />
      </div>
      <p className="text-xs text-[var(--ui-text-muted)] mb-4">
        Click a member to switch the whole page's scope to just their holdings.
      </p>

      <div aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--ui-divider)] mb-4">
        {rows.map((row, index) => (
          <span
            key={row.member.id}
            data-testid={`family-segment-${index}`}
            role="button"
            tabIndex={-1}
            aria-label={`Show ${row.member.name}`}
            aria-pressed={false}
            data-clickable=""
            data-effect="select"
            onClick={() => setMember(row.member.id)}
            style={{
              width: `${row.share ?? "0"}%`,
              backgroundColor: `var(--c${(index % 8) + 1})`,
            }}
            className="h-full cursor-pointer hover:opacity-85 transition-opacity"
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {rows.map(row => (
          <div
            key={row.member.id}
            role="button"
            tabIndex={0}
            aria-pressed={false}
            data-testid={`family-row-${row.member.id}`}
            data-clickable=""
            data-effect="select"
            onClick={() => setMember(row.member.id)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                if (e.key === " ") e.preventDefault();
                setMember(row.member.id);
              }
            }}
            className="flex items-center justify-between rounded-xl p-2 cursor-pointer hover:bg-[var(--ui-row-hover)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span
                data-testid={`family-avatar-${row.member.id}`}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ui-divider)] text-xs font-bold text-[var(--ui-text)]"
              >
                {memberInitials(row.member.name)}
              </span>
              <span className="text-sm font-medium text-[var(--ui-text)]">
                {row.member.name}
              </span>
            </div>

            <span
              data-testid={`family-value-${row.member.id}`}
              className="text-sm font-semibold text-[var(--ui-text)]"
            >
              {formatRupees(row.value)}
              {row.share === null ? "" : ` (${formatPercent(row.share, { digits: 1 })})`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export interface QuickInsightsCardProps {
  lines: string[];
}

export function QuickInsightsCard({ lines }: QuickInsightsCardProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <h3 id={headingId} className="text-base font-semibold text-[var(--ui-text)]">
        Quick Insights
      </h3>
      <p className="mt-1 text-xs text-[var(--ui-text-muted)]">From your current MF holdings</p>
      <ul data-static className="mt-4 flex flex-col gap-2.5">
        {lines.map((line, idx) => (
          <li
            key={idx}
            className="text-sm text-[var(--ui-text)] leading-relaxed list-disc list-inside"
          >
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
