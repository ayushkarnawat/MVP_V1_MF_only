import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { useAuth } from "../../features/auth/AuthContext";
import { getHouseholdMembers } from "../../features/auth/api";
import type { HouseholdMember } from "../../features/auth/types";
import { buildRegistry } from "../registry/buildRegistry";
import { isImportDoneState } from "../nav/importDoneTarget";
import { ScopeContext } from "./ScopeContext";
import type { ScopeMember, ScopeValue } from "./scopeTypes";
import { shouldResetScope } from "./resetRule";
import { readScopeIntent, stateWithoutScopeIntent } from "./scopeIntent";
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
  /** The newest member request, so a request that a newer one replaced can hand back that result instead of nothing. */
  latest?: Promise<ScopeMember[] | null>;
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const { pathname, search, hash, key: locationKey, state: locationState } = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const routes = useMemo(() => buildRegistry(), []);
  const [state, setState] = useState(initialState);
  const requests = useRef<MemberRequest>({ active: false, version: 0, loading: true, moves: [] });
  const previousPath = useRef(pathname);
  // A search jump's undo: the selector before the jump, and the page the jump landed on.
  const [jump, setJump] = useState<{ label: string; previous: StoredScope; path: string } | null>(null);
  const handledIntent = useRef<string | null>(null);

  const loadMembers = useCallback((lifecycle: MemberRequest, keepPick: boolean): Promise<ScopeMember[] | null> => {
    const request = ++lifecycle.version;
    const run = (async (): Promise<ScopeMember[] | null> => {
    try {
      const data = await getHouseholdMembers();
      if (!lifecycle.active) return null;
      // A newer request replaced this one: its answer is the fresh one. Hand that back (never this request's own stale answer),
      // so a caller that waited for the list still learns who is in the household (independent review of C-9, finding 1).
      if (request !== lifecycle.version) return lifecycle.latest ?? null;
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
      return members;
    } catch {
      /* Initial failure leaves an empty list; refresh failure keeps the list we have. */
      return null;
    }
    })();
    lifecycle.latest = run;
    return run;
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
    return loadMembers(requests.current, true);
  }, [loadMembers]);

  // A manual selector change always drops the search jump's undo.
  const setMember = useCallback((id: string) => {
    setJump(null);
    setState(previous => ({ ...previous, pick: { mode: "member", memberId: id } }));
  }, []);

  const setAggregate = useCallback(() => {
    setJump(null);
    // Aggregate transitions keep the first member preselected, rather than
    // clearing memberId. A single-member household remains in member mode.
    setState(previous => ({ ...previous, pick: defaultPick(previous.members) }));
  }, []);

  useEffect(() => {
    const from = previousPath.current;
    previousPath.current = pathname;
    // Only the import-done navigation itself (a replace or push), never a later Back onto its history entry: that is an ordinary move.
    // ... and only when leaving Add data (an import-shaped state arriving from any other page is an ordinary move).
    if (navigationType !== "POP" && from === "/import" && isImportDoneState(locationState)) return;
    if (requests.current.loading && from !== pathname) requests.current.moves.push([from, pathname]);
    setState(previous => shouldResetScope(from, pathname, routes, previous.members.length)
      ? { ...previous, pick: { mode: "aggregate", memberId: previous.members[0]?.id ?? null } }
      : previous);
  }, [pathname, locationState, navigationType, routes]);

  // The search jump's scope intent. Declared AFTER the reset-rule effect above, so within one commit the reset runs first and the
  // intent has the last word. It waits for the household to load, applies once per history entry, then removes only its own scope
  // part from the entry (the page keys `section` and `open`, and keys such as `importNotice`, stay for the page).
  useEffect(() => {
    const intent = readScopeIntent(locationState);
    if (!intent || !state.ready || handledIntent.current === locationKey) return;
    handledIntent.current = locationKey;
    const target = intent.scope === "family"
      ? defaultPick(state.members)
      : state.members.some(member => member.id === intent.scope.memberId) ? { mode: "member" as const, memberId: intent.scope.memberId } : null;
    if (target) {
      const label = target.mode === "aggregate" ? "Family" : state.members.find(member => member.id === target.memberId)?.name ?? "Family";
      setJump({ label, previous: state.pick, path: pathname });
      setState(previous => ({ ...previous, pick: target }));
    }
    void navigate({ pathname, search, hash }, { replace: true, state: stateWithoutScopeIntent(locationState) });
  }, [locationState, locationKey, state.ready, state.members, state.pick, pathname, search, hash, navigate]);

  // Moving to another page ends the undo.
  useEffect(() => {
    setJump(previous => previous && previous.path !== pathname ? null : previous);
  }, [pathname]);

  const undoJump = useMemo(() => jump && {
    label: jump.label,
    undo: () => { setState(previous => ({ ...previous, pick: jump.previous })); setJump(null); },
  }, [jump]);

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
    scopeJump: undoJump,
  };
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}
