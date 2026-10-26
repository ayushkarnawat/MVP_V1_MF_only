import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImportContext, ScopeContext, useImport, useScope } from "./ScopeContext";
import type { ScopeValue } from "./scopeTypes";

export function scopeFixture(overrides: Partial<ScopeValue> = {}): ScopeValue {
  return { viewMode: "aggregate", memberId: null, members: [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }],
    scopeKey: "aggregate", setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(), ...overrides };
}

function Consumer() {
  const scope = useScope();
  const imports = useImport();
  return <button onClick={() => imports.openImport(scope.memberId ?? undefined)}>{scope.scopeKey}</button>;
}

it("throws readable errors outside the required providers", () => {
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(() => render(<Consumer />)).toThrow("useScope must be used within a ScopeContext provider");
    expect(() => render(<ScopeContext.Provider value={scopeFixture()}><Consumer /></ScopeContext.Provider>))
      .toThrow("useImport must be used within an ImportContext provider");
  } finally { quiet.mockRestore(); }
});

it("returns the supplied scope and import contracts", () => {
  const openImport = vi.fn();
  render(<ScopeContext.Provider value={scopeFixture({ scopeKey: "member:a", memberId: "a" })}><ImportContext.Provider value={{ openImport }}><Consumer /></ImportContext.Provider></ScopeContext.Provider>);
  screen.getByRole("button", { name: "member:a" }).click();
  expect(openImport).toHaveBeenCalledWith("a");
});
