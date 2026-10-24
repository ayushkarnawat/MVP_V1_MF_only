import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { buildRegistry } from "./registry/buildRegistry";
import { ShellRoutes } from "./ShellRoot";
import { renderInShell, TestScopeProvider } from "./testing";
import { useScope } from "./scope/ScopeContext";
import { AppLink } from "./nav/AppLink";
import { useAppNavigate } from "./nav/useAppNavigate";

afterEach(() => vi.restoreAllMocks());
function SearchProbe() { return <output data-testid="search">{useLocation().search}</output>; }
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }

it.each([["/", "/home", "Home"], ["/planning", "/planning", "Planning"], ["/portfolio/equity", "/portfolio/mutual-funds", "Mutual Funds"]])(
  "resolves %s according to the current registry", async (path, destination, title) => {
    renderInShell(<><ShellRoutes /><Location /></>, { path });
    expect(await screen.findByRole("heading", { name: title, level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(destination);
    await waitFor(() => expect(document.title).toBe(`${title} · Unifolio`));
  },
);

it("renders not-found inside the app frame", async () => {
  renderInShell(undefined, { path: "/nope" });
  expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ask Mira" })).toBeInTheDocument();
  expect(document.title).toBe("Page not found · Unifolio");
});

it("renders import without the sidebar, with the slim header and fallback Back", async () => {
  renderInShell(undefined, { path: "/import" });
  expect(await screen.findByRole("heading", { name: "Add data" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ask Mira" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back/ })).toHaveAttribute("href", "/portfolio/mutual-funds");
  expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
});

it("uses import's origin state and selected member chip", async () => {
  renderInShell(undefined, { path: "/import", state: { origin: "/portfolio" }, scope: { members: [{ id: "a", name: "Alice" }], memberId: "a", viewMode: "member" } });
  expect(await screen.findByRole("heading", { name: "Add data" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back/ })).toHaveAttribute("href", "/portfolio");
  expect(screen.getByText(/Importing for/)).toHaveTextContent("Alice");
});

it("contains a throwing page and retries without removing chrome", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let broken = true;
  function BrokenPage() { if (broken) throw new Error("Broken page"); return <h1>Recovered page</h1>; }
  const routes = buildRegistry().map(route => route.id === "home" ? { ...route, status: "live" as const, page: async () => ({ default: BrokenPage }) } : route);
  renderInShell(undefined, { path: "/home", routes });
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  expect(screen.getByRole("navigation")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ask Mira" })).toBeInTheDocument();
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Recovered page" })).toBeInTheDocument();
});

it("retries a rejected lazy page import", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const page = vi.fn().mockRejectedValueOnce(new Error("load failed")).mockResolvedValue({ default: () => <h1>Loaded after retry</h1> });
  const routes = buildRegistry().map(route => route.id === "home" ? { ...route, status: "live" as const, page } : route);
  renderInShell(undefined, { path: "/home", routes });
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Loaded after retry" })).toBeInTheDocument();
  expect(page).toHaveBeenCalledTimes(2);
});

it("shows loading until a lazy page resolves", async () => {
  let finish!: (module: { default: () => React.ReactNode }) => void;
  const pending = new Promise<{ default: () => React.ReactNode }>(resolve => { finish = resolve; });
  const routes = buildRegistry().map(route => route.id === "home" ? { ...route, page: () => pending } : route);
  renderInShell(undefined, { path: "/home", routes });
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  finish({ default: () => <h1>Lazy content</h1> });
  expect(await screen.findByRole("heading", { name: "Lazy content" })).toBeInTheDocument();
});

it("the test helper's route overrides reach links and programmatic navigation", () => {
  function Controls() {
    const navigate = useAppNavigate();
    return <><AppLink to="/planning">Planning link</AppLink><button onClick={() => { void navigate("/planning"); }}>Navigate</button><Location /></>;
  }
  const routes = buildRegistry().map(route => route.id === "planning" ? { ...route, status: "live" as const } : route);
  renderInShell(<Controls />, { path: "/home", routes });
  expect(screen.getByRole("link", { name: "Planning link" })).toHaveAttribute("href", "/planning");
  fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
  expect(screen.getByTestId("location")).toHaveTextContent("/planning");
});

it("the test provider changes member and aggregate scope", () => {
  function Controls() {
    const scope = useScope();
    return <><button onClick={() => scope.setMember("b")}>Bob</button><button onClick={scope.setAggregate}>All</button><output>{scope.scopeKey}:{scope.selectedMember?.name}</output></>;
  }
  renderInShell(<Controls />, { scope: { members: [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }] } });
  fireEvent.click(screen.getByRole("button", { name: "Bob" }));
  expect(screen.getByText("member:b:Bob")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  expect(screen.getByText("aggregate:")).toBeInTheDocument();
});

it("redirects replace their history entry", async () => {
  function Back() { const navigate = useNavigate(); return <button onClick={() => { void navigate(-1); }}>History back</button>; }
  render(<MemoryRouter initialEntries={["/planning", "/"]}><TestScopeProvider><ShellRoutes /><Back /><Location /></TestScopeProvider></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "History back" }));
  expect(await screen.findByRole("heading", { name: "Planning" })).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent("/planning");
});

it("redirects keep the query string", async () => {
  render(<MemoryRouter initialEntries={["/?x=1"]}><TestScopeProvider><ShellRoutes /><SearchProbe /></TestScopeProvider></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
  expect(screen.getByTestId("search")).toHaveTextContent("?x=1");
});
