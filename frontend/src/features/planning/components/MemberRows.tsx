import { useId, useState } from "react";
import { compareDecimalStrings } from "@/lib/decimal";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";
import { FROZEN_TEXT, NO_DATA, NO_MEMBER_HOLDINGS, proxyLabel } from "../planningCopy";
import { signedPct, signedRupees, titleName, toneOf } from "../scenarioFormat";
import type { MemberChoice, ScenarioMember, ScenarioMemberFund, ScenarioResult } from "../types";

export interface MemberRowsProps {
  result: ScenarioResult;
  selectedMemberId: MemberChoice;
}

const CARD = "min-w-0 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4";

export function MemberRows({ result, selectedMemberId }: MemberRowsProps) {
  const titleId = useId();

  const losses = result.by_member.some(m => compareDecimalStrings(m.rupee_impact, "0") < 0);
  const sortedMembers = [...result.by_member].sort((a, b) => {
    if (losses) {
      return compareDecimalStrings(a.rupee_impact, b.rupee_impact);
    }
    return compareDecimalStrings(b.rupee_impact, a.rupee_impact);
  });

  const [openMembers, setOpenMembers] = useState<Set<string>>(() => {
    return sortedMembers.length > 0 ? new Set([sortedMembers[0].household_member_id]) : new Set();
  });

  if (result.by_member.length === 0) {
    return null;
  }

  const toggleMember = (id: string) => {
    setOpenMembers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderFundLine = (memberId: string, fund: ScenarioMemberFund) => {
    const schemeId = fund.scheme_id;
    const isEstimated = fund.is_proxied && fund.rupee_impact !== null && !fund.is_frozen;

    const fundTone = toneOf(fund.rupee_impact);
    const fundToneClass =
      fundTone === "gain"
        ? "text-[var(--pos-text)]"
        : fundTone === "loss"
          ? "text-[var(--neg-text)]"
          : "text-[var(--ui-text)]";

    return (
      <li
        key={schemeId}
        data-testid={`fund-${memberId}-${schemeId}`}
        className="flex items-center justify-between gap-3 border-t border-[var(--ui-divider)] py-2 text-[12.5px] text-[var(--ui-text)]"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            data-testid={`fund-name-${memberId}-${schemeId}`}
            className="min-w-0 break-words"
          >
            <AppLink
              to={paths.mutualFunds.fund(fund.scheme_id)}
              className="hover:underline"
            >
              {fund.scheme_name}
            </AppLink>
          </span>
          {isEstimated && (
            <span
              data-testid={`estimate-${memberId}-${schemeId}`}
              title={proxyLabel(fund.proxy_basis)}
              className="rounded-full border border-[var(--ui-divider)] bg-[var(--ui-card)] px-2 text-[10.5px] font-semibold text-[var(--ui-text-muted)]"
            >
              Estimate
            </span>
          )}
        </div>

        {fund.is_frozen ? (
          <span
            data-testid={`frozen-${memberId}-${schemeId}`}
            className="text-[11px] font-semibold text-[var(--warn-text)]"
          >
            {FROZEN_TEXT}
          </span>
        ) : fund.rupee_impact === null ? (
          <span
            data-testid={`nodata-${memberId}-${schemeId}`}
            className="text-[var(--ui-text-muted)]"
          >
            {NO_DATA}
          </span>
        ) : (
          <span
            data-testid={`fund-amount-${memberId}-${schemeId}`}
            className={`font-bold tabular-nums ${fundToneClass}`}
          >
            {signedRupees(fund.rupee_impact)}
          </span>
        )}
      </li>
    );
  };

  const renderFundsList = (member: ScenarioMember) => {
    if (member.funds.length === 0) {
      return (
        <p className="py-2 text-xs text-[var(--ui-text-muted)]">
          {NO_MEMBER_HOLDINGS}
        </p>
      );
    }
    return (
      <ul className="m-0 list-none p-0">
        {member.funds.map(fund => renderFundLine(member.household_member_id, fund))}
      </ul>
    );
  };

  if (selectedMemberId !== "family") {
    const member =
      result.by_member.find(m => m.household_member_id === selectedMemberId) ??
      result.by_member[0];

    return (
      <section aria-labelledby={titleId} className={CARD}>
        <h3
          id={titleId}
          className="mb-3 font-heading text-sm font-semibold text-[var(--ui-text)]"
        >
          Funds for {titleName(member.member_name)}
        </h3>
        {renderFundsList(member)}
      </section>
    );
  }

  return (
    <section aria-labelledby={titleId} className={CARD}>
      <h3
        id={titleId}
        className="mb-3 font-heading text-sm font-semibold text-[var(--ui-text)]"
      >
        By family member
      </h3>
      {sortedMembers.map((member, index) => {
        const id = member.household_member_id;
        const expanded = openMembers.has(id);
        const isFirst = index === 0;

        const memberTone = toneOf(member.rupee_impact);
        const memberToneClass =
          memberTone === "gain"
            ? "text-[var(--pos-text)]"
            : memberTone === "loss"
              ? "text-[var(--neg-text)]"
              : "text-[var(--ui-text)]";

        return (
          <div
            key={id}
            className="mb-2 rounded-[10px] border border-[var(--ui-divider)] bg-[var(--ui-page)]"
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`${titleId}-${id}`}
              onClick={() => toggleMember(id)}
              className="flex w-full flex-wrap items-center justify-between gap-2 px-3.5 py-3 text-left"
            >
              <span className="flex min-w-0 flex-wrap items-center">
                <span className="font-semibold text-[var(--ui-text)]">
                  {titleName(member.member_name)}
                </span>
                {isFirst && compareDecimalStrings(member.rupee_impact, "0") !== 0 && (
                  <span className="ml-2 rounded-full border border-[var(--ui-divider)] bg-[var(--ui-card)] px-2 text-[10.5px] font-semibold text-[var(--ui-text-muted)]">
                    Biggest contributor
                  </span>
                )}
              </span>
              <span
                data-testid={`member-total-${id}`}
                className={`tabular-nums font-semibold ${memberToneClass}`}
              >
                {signedRupees(member.rupee_impact)}
                {member.pct !== null && ` (${signedPct(member.pct)})`}
              </span>
            </button>
            {expanded && (
              <div id={`${titleId}-${id}`} className="px-3.5 pb-2">
                {renderFundsList(member)}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
