import { useCallback } from "react";
import { useNavigate } from "react-router";
import { paths } from "../../shell/nav/paths";
import { useScope } from "../../shell/scope/ScopeContext";
import { pushRecentFund } from "./recentSearches";
import type { SearchFund } from "./searchTypes";

export type ScopeSwitchResult = {
  scope: "family" | { memberId: string };
  label: string;
} | null;

export function resolveScopeSwitch(
  fund: SearchFund,
  scope: { viewMode: "aggregate" | "member"; memberId: string | null },
  members: Array<{ id: string; name: string }>,
): ScopeSwitchResult {
  if (scope.viewMode === "aggregate") return null;
  if (fund.holders.length === 0) return null;
  if (scope.memberId !== null && fund.holders.some((holder) => holder.member_id === scope.memberId)) {
    return null;
  }
  if (fund.holders.length === 1) {
    const holder = fund.holders[0];
    const member = members.find((item) => item.id === holder.member_id);
    return {
      scope: { memberId: holder.member_id },
      label: member?.name || holder.member_name,
    };
  }
  return { scope: "family", label: "Family" };
}

export function useScopeJump(userId: string | null): {
  jumpTo(fund: SearchFund, target?: { path?: string; section?: string; open?: string }): void;
  switchFor(fund: SearchFund): ScopeSwitchResult;
} {
  const scope = useScope();
  const navigate = useNavigate();

  const switchFor = useCallback(
    (fund: SearchFund): ScopeSwitchResult =>
      resolveScopeSwitch(
        fund,
        { viewMode: scope.viewMode, memberId: scope.memberId },
        scope.members,
      ),
    [scope.viewMode, scope.memberId, scope.members],
  );

  const jumpTo = useCallback(
    (fund: SearchFund, target?: { path?: string; section?: string; open?: string }) => {
      const to = target?.path ?? paths.mutualFunds.fund(fund.scheme_id);
      const nextSwitch = switchFor(fund);
      const searchIntent: {
        scope?: "family" | { memberId: string };
        section?: string;
        open?: string;
      } = {};
      if (nextSwitch) searchIntent.scope = nextSwitch.scope;
      if (target?.section) searchIntent.section = target.section;
      if (target?.open) searchIntent.open = target.open;

      if (userId !== null) {
        pushRecentFund(userId, fund.scheme_id);
      }

      void navigate(to, { state: { searchIntent } });
    },
    [navigate, switchFor, userId],
  );

  return { jumpTo, switchFor };
}
