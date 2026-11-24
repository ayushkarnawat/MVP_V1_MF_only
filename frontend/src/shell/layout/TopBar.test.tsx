import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { ImportContext, ScopeContext } from "../scope/ScopeContext";
import { TopBar } from "./TopBar";
vi.mock("../../features/auth/AuthContext", () => ({ useAuth: () => ({ me: null }) }));

function mount(path = "/home") {
  const openImport = vi.fn();
  render(<MemoryRouter initialEntries={[path]}><ScopeContext.Provider value={{ viewMode: "aggregate", memberId: null, members: [{ id: "a", name: "Alice" }], scopeKey: "aggregate", setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn() }}><ImportContext.Provider value={{ openImport }}><TopBar /></ImportContext.Provider></ScopeContext.Provider></MemoryRouter>);
  return openImport;
}

// DOM order helper: true when `a` comes before `b` in the document.
function before(a: HTMLElement, b: HTMLElement) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

it("shows the frame controls without an avatar and calls openImport", () => {
  const openImport = mount();
  expect(screen.getByRole("combobox", { name: "Portfolio scope" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "+ Add data" }));
  expect(openImport).toHaveBeenCalledWith();
});

it("TopBar has no search input and its Ask Mira button still opens the Mira dialog", async () => {
  mount();
  expect(screen.queryByPlaceholderText("Search")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Ask Mira/ }));
  expect(await screen.findByRole("dialog", { name: "Ask Mira" })).toHaveTextContent(/coming soon/i);
});

it("the Ask Mira pill carries its hint line and a spark mark", () => {
  mount();
  const pill = screen.getByRole("button", { name: /Ask Mira/ });
  expect(pill).toHaveTextContent("Ask Mira");
  expect(pill).toHaveTextContent("Ask anything about your funds…");
  expect(pill.querySelector("[data-testid='mira-spark']")).not.toBeNull();
});

it("TopBar control order: Ask Mira left; selector, Add data, divider, theme right", () => {
  mount();
  const mira = screen.getByRole("button", { name: /Ask Mira/ });
  const selector = screen.getByRole("combobox", { name: "Portfolio scope" });
  const add = screen.getByRole("button", { name: "+ Add data" });
  const divider = screen.getByRole("separator");
  const theme = screen.getByRole("button", { name: "Toggle theme" });
  expect(divider).toHaveAttribute("aria-orientation", "vertical");
  expect(before(mira, selector)).toBe(true);
  expect(before(selector, add)).toBe(true);
  expect(before(add, divider)).toBe(true);
  expect(before(divider, theme)).toBe(true);
});

it("no-selector pages omit the selector without moving the rest", () => {
  mount("/help");
  expect(screen.queryByRole("combobox", { name: "Portfolio scope" })).not.toBeInTheDocument();
  const mira = screen.getByRole("button", { name: /Ask Mira/ });
  const add = screen.getByRole("button", { name: "+ Add data" });
  const divider = screen.getByRole("separator");
  const theme = screen.getByRole("button", { name: "Toggle theme" });
  expect(before(mira, add)).toBe(true);
  expect(before(add, divider)).toBe(true);
  expect(before(divider, theme)).toBe(true);
});

it("the bar uses only shell tokens: no hex colour in its markup", () => {
  mount();
  expect(document.body.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
});

it("the Export PDF button is first in the right-hand group, before the family selector", () => {
  mount();
  const mira = screen.getByRole("button", { name: /Ask Mira/ });
  const exportBtn = screen.getByRole("button", { name: "Export PDF" });
  const selector = screen.getByRole("combobox", { name: "Portfolio scope" });
  expect(before(mira, exportBtn)).toBe(true);
  expect(before(exportBtn, selector)).toBe(true);
});

it("it renders with hasData from useHasFunds (unknown shows it enabled)", () => {
  mount();
  const exportBtn = screen.getByRole("button", { name: "Export PDF" });
  expect(exportBtn).not.toHaveAttribute("aria-disabled", "true");
});

it("the wired ExportHost opens choose from the existing top-bar position", () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: "Export PDF" })); expect(screen.getByRole("dialog", { name: "Export a PDF report" })).toBeInTheDocument();
});
