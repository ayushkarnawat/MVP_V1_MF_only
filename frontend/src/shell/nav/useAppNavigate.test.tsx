import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as registry from "../registry/buildRegistry";
import type { ShellRoute } from "../registry/types";
import { useAppNavigate } from "./useAppNavigate";

let routes: ShellRoute[];
beforeEach(() => {
  routes = registry.buildRegistry().map(route => route.id === "planning" ? { ...route, status: "live" } : route);
  vi.spyOn(registry, "buildRegistry").mockImplementation(() => routes);
});
afterEach(() => vi.restoreAllMocks());

function Harness({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useAppNavigate();
  const location = useLocation();
  return <><button onClick={() => { void navigate(to, { replace, state: { source: "test" } }); }}>Go</button><output data-testid="location">{location.pathname}{location.search}{location.hash}</output><output data-testid="state">{JSON.stringify(location.state)}</output></>;
}

it("navigates to a live route with query, hash and state", () => {
  render(<MemoryRouter initialEntries={["/home"]}><Harness to="/planning?tab=all#cards" replace /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByTestId("location")).toHaveTextContent("/planning?tab=all#cards");
  expect(screen.getByTestId("state")).toHaveTextContent('{"source":"test"}');
});

it("blocks a placeholder destination including one with a query", () => {
  render(<MemoryRouter initialEntries={["/planning"]}><Harness to="/home?tab=all#top" /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByTestId("location")).toHaveTextContent("/planning");
  expect(screen.getByTestId("state")).toHaveTextContent("null");
});

it("enables navigation when the fixture registry flips to live", () => {
  const view = render(<MemoryRouter initialEntries={["/planning"]}><Harness to="/home" /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByTestId("location")).toHaveTextContent("/planning");
  routes = routes.map(route => route.id === "home" ? { ...route, status: "live" } : route);
  view.rerender(<MemoryRouter initialEntries={["/planning"]}><Harness to="/home" /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByTestId("location")).toHaveTextContent("/home");
});
