import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageFilterSource } from "@/components/search/searchResultTypes";
import { ImportContext, ScopeContext } from "@/shell/scope/ScopeContext";
import type { ScopeValue } from "@/shell/scope/scopeTypes";
import { fixture } from "./fixtures";
import { HomePage } from "./HomePage";
import { ASHA, DEV, mockHomeApi } from "./testing/homeApi";
import type { SummaryResponse } from "./types";

const search = vi.hoisted(() => ({ visible: true, props: vi.fn() }));
vi.mock("@/components/search/PageSearch", () => ({
  PageSearch: (props: PageFilterSource & { userId: string | null; jumpOnly?: boolean }) => {
    search.props(props);
    if (!search.visible) return null;
    const { pageKey, noun, total, matched, chipsAllowed, jumpOnly } = props;
    return <div data-testid="page-search-stub" data-page-key={pageKey} data-noun={noun}
      data-total={total} data-matched={matched} data-chips-allowed={JSON.stringify(chipsAllowed)} data-jump-only={String(jumpOnly)} />;
  },
}));
const scope: ScopeValue = { viewMode: "aggregate", memberId: null, scopeKey: "aggregate",
  members: [{ id: ASHA, name: "Asha" }, { id: DEV, name: "Bela" }], userId: "example-user",
  setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn() };
function summary(): SummaryResponse {
  return { ...fixture<SummaryResponse>("summary_family"), data_line: "Data from 1 of 2 family members",
    members_connected: 1, members: [{ id: ASHA, name: "Asha", has_data: true }, { id: DEV, name: "Bela", has_data: false }] };
}
function mount(openImport = vi.fn()) {
  const view = render(<MemoryRouter initialEntries={["/home"]}>
    <ScopeContext.Provider value={scope}><ImportContext.Provider value={{ openImport }}>
      <HomePage today="2026-10-23" />
    </ImportContext.Provider></ScopeContext.Provider>
  </MemoryRouter>);
  return { ...view, openImport };
}
const ready = () => screen.findByTestId("members-chip");
beforeEach(() => { vi.clearAllMocks(); search.visible = true; localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("HomePage search", () => {
  it("the box is mounted in the greeting row with pageKey home in jump-only mode", async () => {
    mockHomeApi({ summary: summary() });
    mount();
    await ready();
    const box = within(screen.getByTestId("home-greeting")).getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "home");
    expect(box).toHaveAttribute("data-noun", "funds");
    expect(box).toHaveAttribute("data-jump-only", "true");
    expect(box).toHaveAttribute("data-total", "0");
    expect(box).toHaveAttribute("data-matched", "0");
    expect(box).toHaveAttribute("data-chips-allowed", "[]");
    expect(search.props).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toContainElement(box);
  });

  it("it sits before the members chip", async () => {
    mockHomeApi({ summary: summary() });
    mount();
    const chip = await ready();
    const box = screen.getByTestId("page-search-stub");
    const row = screen.getByRole("heading", { level: 1 }).parentElement;
    expect(row).toContainElement(chip);
    expect(row).toContainElement(box);
    expect(box.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.todo("no q is read or written");

  it("the greeting, chip and callbacks are unchanged with the box mocked out", async () => {
    const api = mockHomeApi({ summary: summary() });
    const { openImport } = mount();
    await ready();
    const greeting = screen.getByTestId("home-greeting").textContent;
    const chipText = screen.getByTestId("members-chip").textContent;
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Good evening, Asha");
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
    cleanup();
    search.visible = false;
    mount(openImport);
    await ready();
    expect(screen.getByTestId("home-greeting").textContent).toBe(greeting);
    expect(screen.getByTestId("members-chip").textContent).toBe(chipText);
    expect(screen.queryByTestId("page-search-stub")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("members-chip"));
    const dialog = screen.getByRole("dialog", { name: "Family members" });
    expect(within(dialog).getByText("Asha")).toBeInTheDocument();
    expect(within(dialog).getByText("Bela")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Import statement" }));
    expect(openImport).toHaveBeenCalledExactlyOnceWith(DEV);
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(screen.getByTestId("greeting-top-mover"));
    await waitFor(() => expect(api.callsFor("movers").some(call => call.query.get("by") === "fund")).toBe(true));
  });
});
