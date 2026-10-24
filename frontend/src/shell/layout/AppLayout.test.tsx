import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { buildRegistry } from "../registry/buildRegistry";
import { renderInShell } from "../testing";
import { PageLayout } from "./PageLayout";
import { PageState } from "./PageState";

afterEach(() => vi.restoreAllMocks());

it("keeps the chrome and scrolls the page area on pathname changes", async () => {
  const scroll = vi.fn();
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scroll });
  try {
    const routes = buildRegistry().map(route => route.id === "planning" ? { ...route, status: "live" as const } : route);
    renderInShell(undefined, { path: "/home", routes });
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    const area = screen.getByRole("main");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Mira" })).toBeInTheDocument();
    scroll.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Planning" }));
    expect(await screen.findByRole("heading", { name: "Planning" })).toBeInTheDocument();
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0 }));
    expect(scroll.mock.instances[0]).toBe(area);
    expect(document.title).toBe("Planning · Unifolio");
  } finally {
    if (original) Object.defineProperty(HTMLElement.prototype, "scrollTo", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

it("renders page header, subtitle, actions, tabs and content", () => {
  renderInShell(<PageLayout title="Example" subtitle="Description" actions={<button>Action</button>} tabs={<nav aria-label="Page tabs">Tabs</nav>}><p>Content</p></PageLayout>);
  expect(screen.getByRole("heading", { name: "Example", level: 1 })).toBeInTheDocument();
  expect(screen.getByText("Description")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Page tabs" })).toBeInTheDocument();
  expect(screen.getByText("Content")).toBeInTheDocument();
});

it("renders loading, empty and retryable error states", () => {
  const retry = vi.fn();
  const view = renderInShell(<PageState state="loading" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  view.rerender(<PageState state="empty" message="Nothing here yet" />);
  expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  view.rerender(<PageState state="error" onRetry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
