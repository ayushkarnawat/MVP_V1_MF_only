import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { useAuth } from "../../features/auth/AuthContext";
import { getHouseholdMembers } from "../../features/auth/api";
import type { HouseholdMember } from "../../features/auth/types";
import { buildRegistry } from "../registry/buildRegistry";
import { ScopeContext } from "./ScopeContext";
import type { ScopeMember, ScopeValue } from "./scopeTypes";
import { shouldResetScope } from "./resetRule";
import { readScope, writeScope } from "./scopeStorage";
import type { StoredScope } from "./scopeStorage";

function toMemberOption(member: HouseholdMember): ScopeMember {
  return { id: member.id, name: member.name || "Self", profile: member };
}

function defaultPick(members: ScopeMember[]): StoredScope {
  return { mode: members.length === 1 ? "member" : "aggregate", memberId: members[0]?.id ?? null };
}

function validPick(pick: StoredScope | null, members: ScopeMember[]): StoredScope {
  if (members.length <= 1 || !pick || !members.some(member => member.id === pick.memberId)) return defaultPick(members);
  return pick.mode === "aggregate" ? { mode: "aggregate", memberId: members[0].id } : pick;
}

interface ScopeState { members: ScopeMember[]; pick: StoredScope; ready: boolean }
const initialState: ScopeState = { members: [], pick: { mode: "aggregate", memberId: null }, ready: false };
interface MemberRequest {
  active: boolean;
  version: number;
  loading: boolean;
  moves: [string, string][];
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const { pathname } = useLocation();
  const routes = useMemo(() => buildRegistry(), []);
  const [state, setState] = useState(initialState);
  const requests = useRef<MemberRequest>({ active: false, version: 0, loading: true, moves: [] });
  const previousPath = useRef(pathname);

  const loadMembers = useCallback(async (lifecycle: MemberRequest, keepPick: boolean) => {
    const request = ++lifecycle.version;
    try {
      const data = await getHouseholdMembers();
      if (!lifecycle.active || request !== lifecycle.version) return;
      const members = data.map(toMemberOption);
      const saved = readScope();
      const stored: StoredScope | null = saved && { mode: saved.mode, memberId: saved.memberId };
      const savedPath = saved?.path;
      // Navigation can precede the first fetch. Recheck those moves once the
      // household size is known, before restoring its persisted selection.
      const reset = lifecycle.moves.some(([from, to]) => shouldResetScope(from, to, routes, members.length));
      // A fresh load of a different sidebar row than the one the scope was saved on (an address-bar navigation)
      // is a cross-row move too; only a reload of the same row keeps the saved member.
      const fromOtherRow = !keepPick && savedPath !== undefined && shouldResetScope(savedPath, previousPath.current, routes, members.length);
      lifecycle.moves = [];
      lifecycle.loading = false;
      setState(previous => ({
        members,
        pick: reset || fromOtherRow ? defaultPick(members) : validPick(keepPick && previous.ready ? previous.pick : stored, members),
        ready: true,
      }));
    } catch { /* Initial failure leaves an empty list; refresh failure keeps the list we have. */ }
  }, [routes]);

  useEffect(() => {
    // Moves queued before the previous fetch finished still need their reset check against the new response.
    const carried = requests.current.loading ? requests.current.moves : [];
    const lifecycle: MemberRequest = { active: true, version: 0, loading: true, moves: carried };
    requests.current = lifecycle;
    setState(initialState);
    void loadMembers(lifecycle, false);
    return () => { lifecycle.active = false; };
  }, [me, loadMembers]);

  // The former desktop flow's Complete profile save/merge and Profile
  // onMembersChanged callers invalidateApiCache() BEFORE refreshMembers().
  // This method only refetches, preserving that existing responsibility split.
  const refreshMembers = useCallback(async () => {
    await loadMembers(requests.current, true);
  }, [loadMembers]);

  const setMember = useCallback((id: string) => {
    setState(previous => ({ ...previous, pick: { mode: "member", memberId: id } }));
  }, []);

  const setAggregate = useCallback(() => {
    // Aggregate transitions keep the first member preselected, rather than
    // clearing memberId. A single-member household remains in member mode.
    setState(previous => ({ ...previous, pick: defaultPick(previous.members) }));
  }, []);

  useEffect(() => {
    const from = previousPath.current;
    previousPath.current = pathname;
    if (requests.current.loading && from !== pathname) requests.current.moves.push([from, pathname]);
    setState(previous => shouldResetScope(from, pathname, routes, previous.members.length)
      ? { ...previous, pick: { mode: "aggregate", memberId: previous.members[0]?.id ?? null } }
      : previous);
  }, [pathname, routes]);

  useEffect(() => {
    if (state.ready) writeScope(state.pick, pathname);
  }, [state.ready, state.pick, pathname]);

  const value: ScopeValue = {
    members: state.members,
    viewMode: state.pick.mode,
    memberId: state.pick.memberId,
    selectedMember: state.members.find(member => member.id === state.pick.memberId),
    scopeKey: state.pick.mode === "aggregate" ? "aggregate" : `member:${state.pick.memberId}`,
    setMember, setAggregate, refreshMembers,
  };
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}
