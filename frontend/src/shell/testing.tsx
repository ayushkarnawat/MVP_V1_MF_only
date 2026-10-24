import { useState } from "react";
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, parsePath } from "react-router";
import { ShellRoutes } from "./ShellRoot";
import { ScopeContext, ImportContext } from "./scope/ScopeContext";
import type { ImportValue, ScopeValue } from "./scope/scopeTypes";
import type { ShellRoute } from "./registry/types";
import { buildRegistry } from "./registry/buildRegistry";
import { RegistryContext } from "./registry/RegistryContext";

export function TestScopeProvider({ children, scope = {}, openImport = () => {} }: { children: ReactNode; scope?: Partial<ScopeValue>; openImport?: ImportValue["openImport"] }) {
  const members = scope.members ?? [];
  const [viewMode, setViewMode] = useState(scope.viewMode ?? (members.length === 1 ? "member" : "aggregate"));
  const [memberId, setMemberId] = useState(scope.memberId ?? (members.length === 1 ? members[0].id : null));
  const value: ScopeValue = {
    members, viewMode, memberId,
    selectedMember: viewMode === "member" ? members.find(member => member.id === memberId) : undefined,
    scopeKey: scope.scopeKey ?? (viewMode === "member" ? `member:${memberId}` : "aggregate"),
    setMember: scope.setMember ?? (id => { setMemberId(id); setViewMode("member"); }),
    setAggregate: scope.setAggregate ?? (() => { setMemberId(null); setViewMode("aggregate"); }),
    refreshMembers: scope.refreshMembers ?? (() => {}),
  };
  return <ScopeContext.Provider value={value}><ImportContext.Provider value={{ openImport }}>{children}</ImportContext.Provider></ScopeContext.Provider>;
}

export interface RenderInShellOptions { path?: string; state?: unknown; scope?: Partial<ScopeValue>; routes?: ShellRoute[]; openImport?: ImportValue["openImport"] }

// oxlint-disable-next-line react/only-export-components -- This test-only entry point intentionally exports both requested testing utilities.
export function renderInShell(ui?: ReactNode, { path = "/home", state, scope, routes = buildRegistry(), openImport }: RenderInShellOptions = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[{ ...parsePath(path), state }]}><RegistryContext.Provider value={routes}><TestScopeProvider scope={scope} openImport={openImport}>{children}</TestScopeProvider></RegistryContext.Provider></MemoryRouter>;
  }
  return render(ui ?? <ShellRoutes />, { wrapper: Wrapper });
}
