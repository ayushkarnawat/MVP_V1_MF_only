import { ChevronRight, LayoutGrid, Table2 } from "lucide-react";
import { Fragment, useState } from "react";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { formatPercent, formatRupees } from "../../../lib/format";
import { ChartTypeToggle } from "../common/charts";
import { FundLink } from "../common/FundLink";
import { SectionCard } from "../common/SectionCard";
import { formatXirr } from "../mfCopy";
import type { FundManagerAllocationSummary, ManagerGroup } from "../types";
import { type AnalyticsCardProps, managerKey } from "./allocationLogic";

const VIEW_OPTIONS = [
  { id: "cards" as const, label: "Cards", icon: LayoutGrid },
  { id: "table" as const, label: "Table", icon: Table2 },
];
const ASSUMED = "Assumed main manager: none was marked for at least one fund.";

export interface FundManagerCardProps extends AnalyticsCardProps<FundManagerAllocationSummary> {
  xirrByScheme: Record<string, string | null | undefined>;
}

export function FundManagerCard({ state, data, onRetry, xirrByScheme }: FundManagerCardProps) {
  const [view, setView] = useState<"cards" | "table">("cards");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const groups = data?.manager_groups ?? [];
  const unavailable = data?.unavailable_schemes ?? [];
  const isEmpty = groups.length === 0 && unavailable.length === 0;
  const updating = groups.some(group => group.main_source == null);

  const toggle = (group: ManagerGroup) => {
    const key = managerKey(group);
    return <button type="button" aria-expanded={openKey === key} data-clickable="" data-effect="expand"
      onClick={() => setOpenKey(openKey === key ? null : key)}
      className="flex items-center gap-1.5 text-left font-medium text-[var(--ui-text)] hover:text-[var(--pos-text)]">
      <ChevronRight aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 transition-transform ${openKey === key ? "rotate-90" : ""}`} />
      <span>{group.manager_name}</span>
    </button>;
  };
  const marker = (group: ManagerGroup) => group.main_source === "assumed"
    ? <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{ASSUMED}</p> : null;
  const funds = (group: ManagerGroup) => <ul aria-label={`${group.manager_name} funds`} className="flex flex-col gap-1.5">
    {group.funds.map(fund => <li key={fund.scheme_id} data-testid={`manager-fund-${managerKey(group)}-${fund.scheme_id}`}
      className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span title={fund.scheme_name} className="font-medium text-[var(--ui-text)] truncate max-w-md">
        <FundLink schemeId={fund.scheme_id}>{fund.scheme_name}</FundLink>
      </span>
      <span className="text-[var(--ui-text-muted)]">{formatRupees(fund.household_value)} · XIRR {formatXirr(xirrByScheme[fund.scheme_id])}</span>
    </li>)}
  </ul>;

  return <SectionCard title="Fund Manager Allocation" state={state} onRetry={onRetry}>
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--ui-text-muted)]">Who is actually running your money, aggregated across your whole portfolio.</p>
      {updating ? <p role="status" className="text-xs text-[var(--ui-text-muted)]">Fund manager allocation is updating.</p>
        : isEmpty || !data ? <div className="flex flex-col gap-1 py-4 text-xs text-[var(--ui-text-muted)]">
          <p className="font-medium text-[var(--ui-text)]">No fund manager data available</p>
          <p>We haven't matched fund manager records for your current holdings yet.</p>
        </div> : <div className="flex flex-col gap-4">
          <ChartTypeToggle label="Chart type" value={view} options={VIEW_OPTIONS} onChange={setView} />
          {view === "cards" ? <>
            <ul aria-label="Fund manager cards" className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {groups.map(group => {
                const key = managerKey(group);
                return <li key={key} data-testid={`manager-row-${key}`} className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4">
                  <div className="flex items-start gap-3">
                    <SchemeLogo amcName={group.amc_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      {toggle(group)}
                      <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{group.amc_name || "—"}</p>
                      {marker(group)}
                    </div>
                  </div>
                  <p className="mt-3 text-base font-semibold text-[var(--ui-text)]">{formatRupees(group.total_household_value)}</p>
                  <p className="text-xs text-[var(--ui-text-muted)]">{formatPercent(group.percentage, { digits: 1 })} of overall portfolio</p>
                  {openKey === key && <div data-testid={`manager-detail-${key}`} className="mt-3 border-t border-[var(--ui-divider)] pt-3">{funds(group)}</div>}
                </li>;
              })}
            </ul>
            <p className="text-xs text-[var(--ui-text-muted)]">Covered by manager data: <span data-testid="covered-value">{formatRupees(data.covered_value)}</span> · <span data-testid="covered-pct">{formatPercent(data.covered_percentage, { digits: 1 })}</span></p>
          </> : <div className="overflow-x-auto">
            <table aria-label="Fund manager allocation" className="w-full text-left text-xs">
              <caption className="text-left text-xs text-[var(--ui-text-muted)] pb-2">Each fund's full value is counted under its main manager.</caption>
              <thead><tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
                <th className="pb-2 font-medium">Fund manager</th><th className="pb-2 font-medium">AMC</th>
                <th className="pb-2 font-medium">Current value</th><th className="pb-2 font-medium">% of overall portfolio</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--ui-divider)]">
                {groups.map(group => {
                  const key = managerKey(group);
                  return <Fragment key={key}>
                    <tr data-testid={`manager-row-${key}`}>
                      <th scope="row" className="py-2.5 font-normal text-[var(--ui-text)]">{toggle(group)}{marker(group)}</th>
                      <td className="py-2.5 text-[var(--ui-text-muted)]">{group.amc_name || "—"}</td>
                      <td className="py-2.5 text-[var(--ui-text)] font-medium">{formatRupees(group.total_household_value)}</td>
                      <td className="py-2.5 text-[var(--ui-text-muted)] font-medium">{formatPercent(group.percentage, { digits: 1 })}</td>
                    </tr>
                    {openKey === key && <tr data-testid={`manager-detail-${key}`} className="bg-[var(--ui-card)]"><td colSpan={4} className="p-3">{funds(group)}</td></tr>}
                  </Fragment>;
                })}
              </tbody>
              <tfoot><tr className="border-t border-[var(--ui-divider)] font-semibold text-[var(--ui-text)]">
                <th scope="row" className="pt-3">Covered by manager data</th><td className="pt-3" />
                <td data-testid="covered-value" className="pt-3">{formatRupees(data.covered_value)}</td>
                <td data-testid="covered-pct" className="pt-3">{formatPercent(data.covered_percentage, { digits: 1 })}</td>
              </tr></tfoot>
            </table>
          </div>}
          {unavailable.length > 0 && <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--warn-bg)] p-3 text-xs text-[var(--warn-text)]">
            <p className="font-semibold">{unavailable.length} {unavailable.length === 1 ? "fund has" : "funds have"} no manager data yet.</p>
            <ul className="mt-1.5 list-disc pl-4 space-y-0.5">{unavailable.map(scheme => <li key={scheme.scheme_id}>{scheme.scheme_name} ({scheme.amc_name})</li>)}</ul>
          </div>}
        </div>}
    </div>
  </SectionCard>;
}
