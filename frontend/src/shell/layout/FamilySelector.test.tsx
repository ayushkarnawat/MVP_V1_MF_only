import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { ScopeContext } from "../scope/ScopeContext";
import type { ScopeValue } from "../scope/scopeTypes";
import { FamilySelector } from "./FamilySelector";

function mount(path = "/home", overrides: Partial<ScopeValue> = {}) {
  const scope: ScopeValue = { viewMode: "aggregate", memberId: null, members: [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }],
    scopeKey: "aggregate", setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(), ...overrides };
  render(<MemoryRouter initialEntries={[path]}><ScopeContext.Provider value={scope}><FamilySelector /></ScopeContext.Provider></MemoryRouter>);
  return scope;
}

it("lists Family Combined first, then the members, and selects a member", async () => {
  const scope = mount();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Portfolio scope" }), { key: "ArrowDown" });
  const options = await screen.findAllByRole("option");
  expect(options.map(option => option.textContent)).toEqual(["Family Combined", "Alice", "Bob"]);
  fireEvent.click(screen.getByRole("option", { name: "Bob" }));
  expect(scope.setMember).toHaveBeenCalledWith("b");
});

it("selects Family Combined from a member view", async () => {
  const scope = mount("/home", { viewMode: "member", memberId: "a" });
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Family Combined" }));
  expect(scope.setAggregate).toHaveBeenCalledOnce();
});

it("shows only the single member, with no aggregate option", async () => {
  mount("/home", { members: [{ id: "a", name: "Alice" }], viewMode: "member", memberId: "a" });
  expect(screen.getByRole("combobox")).toHaveTextContent("Alice");
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  expect((await screen.findAllByRole("option")).map(option => option.textContent)).toEqual(["Alice"]);
});

it.each(["/profile", "/planning", "/import"])("hides on scope-none route %s", path => {
  mount(path);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
