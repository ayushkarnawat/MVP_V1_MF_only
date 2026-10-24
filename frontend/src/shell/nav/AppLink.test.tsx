import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as registry from "../registry/buildRegistry";
import type { ShellRoute } from "../registry/types";
import { AppLink } from "./AppLink";

let routes: ShellRoute[];
beforeEach(() => {
  routes = registry.buildRegistry().map(route => route.id === "planning" ? { ...route, status: "live" } : route);
  vi.spyOn(registry, "buildRegistry").mockImplementation(() => routes);
});
afterEach(() => vi.restoreAllMocks());

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

it("renders a live link and navigates while preserving query and hash", () => {
  render(<MemoryRouter initialEntries={["/home"]}><AppLink to="/planning?tab=all#cards" className="base">Plan</AppLink><Location /></MemoryRouter>);
  const link = screen.getByRole("link", { name: "Plan" });
  expect(link).toHaveAttribute("href", "/planning?tab=all#cards");
  expect(link).toHaveClass("base");
  fireEvent.click(link);
  expect(screen.getByTestId("location")).toHaveTextContent("/planning?tab=all#cards");
});

it("renders a placeholder as a disabled span with children and tooltip", () => {
  render(<MemoryRouter initialEntries={["/planning"]}><AppLink to="/home?tab=all#top" className="base"><strong>Home</strong></AppLink><Location /></MemoryRouter>);
  const disabled = screen.getByTitle("Coming soon");
  expect(disabled.tagName).toBe("SPAN");
  expect(disabled).toHaveAttribute("aria-disabled", "true");
  expect(disabled).toHaveClass("base", "shell-link-disabled");
  expect(disabled).not.toHaveAttribute("href");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Home"));
  expect(screen.getByTestId("location")).toHaveTextContent("/planning");
});

it("turns a placeholder into a link when its registry status flips", () => {
  const ui = <MemoryRouter><AppLink to="/home">Home</AppLink></MemoryRouter>;
  const view = render(ui);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  routes = routes.map(route => route.id === "home" ? { ...route, status: "live" } : route);
  view.rerender(<MemoryRouter><AppLink to="/home">Home</AppLink></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
});

it("applies the active class only at the live destination", () => {
  const view = render(<MemoryRouter initialEntries={["/planning"]}><AppLink to="/planning" className="base" activeClassName="selected">Plan</AppLink></MemoryRouter>);
  expect(screen.getByRole("link")).toHaveClass("base", "selected");
  expect(screen.getByRole("link")).toHaveAttribute("aria-current", "page");
  view.unmount();
  render(<MemoryRouter initialEntries={["/home"]}><AppLink to="/planning" className="base" activeClassName="selected">Plan</AppLink></MemoryRouter>);
  expect(screen.getByRole("link")).not.toHaveClass("selected");
});

it("checks relative links against the resolved pathname", () => {
  render(<MemoryRouter initialEntries={["/profile/settings"]}><Routes><Route path="/profile/settings" element={<AppLink to="../personal">Personal</AppLink>} /></Routes></MemoryRouter>);
  expect(screen.getByTitle("Coming soon")).toHaveAttribute("aria-disabled", "true");
});
