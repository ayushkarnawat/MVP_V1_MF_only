import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { ImportContext, ScopeContext } from "../scope/ScopeContext";
import { TopBar } from "./TopBar";

function mount() {
  const openImport = vi.fn();
  render(<MemoryRouter initialEntries={["/home"]}><ScopeContext.Provider value={{ viewMode: "aggregate", memberId: null, members: [{ id: "a", name: "Alice" }], scopeKey: "aggregate", setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn() }}><ImportContext.Provider value={{ openImport }}><TopBar /></ImportContext.Provider></ScopeContext.Provider></MemoryRouter>);
  return openImport;
}

it("shows the frame controls without an avatar and calls openImport", () => {
  const openImport = mount();
  expect(screen.getByPlaceholderText("Search")).toHaveAttribute("readonly");
  expect(screen.getByRole("combobox", { name: "Portfolio scope" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "+ Add data" }));
  expect(openImport).toHaveBeenCalledWith();
});

it.each(["search", "mira"])("opens the Mira dialog from %s", async control => {
  mount();
  fireEvent.click(control === "search" ? screen.getByPlaceholderText("Search") : screen.getByRole("button", { name: "Ask Mira" }));
  expect(await screen.findByRole("dialog", { name: "Ask Mira" })).toHaveTextContent(/coming soon/i);
});

it("opens Mira with Enter from the search input", async () => {
  mount();
  fireEvent.keyDown(screen.getByPlaceholderText("Search"), { key: "Enter" });
  expect(await screen.findByRole("dialog", { name: "Ask Mira" })).toBeInTheDocument();
});
