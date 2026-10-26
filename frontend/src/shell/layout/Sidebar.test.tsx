/// <reference types="node" />
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as registry from "../registry/buildRegistry";
import type { ShellRoute } from "../registry/types";
import { Sidebar } from "./Sidebar";

let routes: ShellRoute[];
const equityKey = "unifolio.shell.equityOpen";
beforeEach(() => {
  routes = registry.buildRegistry();
  vi.spyOn(registry, "buildRegistry").mockImplementation(() => routes);
});
afterEach(() => vi.restoreAllMocks());

function Harness() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><Sidebar pathname={location.pathname} /><output data-testid="location">{location.pathname}</output><button onClick={() => { void navigate("/portfolio/debt"); }}>Test: Debt</button><button onClick={() => { void navigate("/portfolio/mutual-funds"); }}>Test: Mutual Funds</button></>;
}

function mount(path = "/home") {
  return render(<MemoryRouter initialEntries={[path]}><Harness /></MemoryRouter>);
}

function row(label: string): HTMLElement {
  const labelElement = within(screen.getByRole("navigation", { name: "Main navigation" })).getByText(label);
  return labelElement.closest<HTMLElement>("a, [aria-disabled], button")!;
}

describe("sidebar", () => {
  it("uses dark text, semibold type and no fill on the active row", async () => {
    const result = await postcss([tailwindcss({
      content: [{ raw: readFileSync("src/shell/layout/SidebarItem.tsx", "utf8"), extension: "tsx" }],
      corePlugins: { preflight: false },
    })]).process("@tailwind utilities;", { from: undefined });
    const style = document.createElement("style");
    style.textContent = readFileSync("src/shell/theme/shell-tokens.css", "utf8") + result.css;
    document.head.append(style);
    const root = document.documentElement;
    const originalTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    try {
      mount("/home");
      const active = getComputedStyle(row("Home"));
      expect(active.color).toBe("var(--shell-text)");
      expect(active.fontWeight).toBe("600");
      expect(active.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(row("Portfolio")).color).toBe("var(--shell-text-disabled)");
      const underline = new Map<string, string>();
      for (const rule of Array.from(style.sheet!.cssRules)) {
        if (!(rule instanceof CSSStyleRule) || !rule.selectorText.endsWith("::after")) continue;
        if (!row("Home").matches(rule.selectorText.replace(/::after$/, ""))) continue;
        for (let index = 0; index < rule.style.length; index++) {
          const property = rule.style[index];
          underline.set(property, rule.style.getPropertyValue(property));
        }
      }
      expect(underline.get("height")).toBe("0.125rem");
      expect(underline.get("bottom")).toBe("0px");
      expect(underline.get("left")).toBe("0px");
      expect(underline.get("right")).toBe("0px");
      expect(underline.get("background-color")).toBe("var(--shell-accent)");
    } finally {
      style.remove();
      if (originalTheme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", originalTheme);
    }
  });

  it("shows the main menu, shared footer and the existing logo", () => {
    mount();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    for (const label of ["Home", "Portfolio", "Liabilities", "Planning", "Profile", "Help & Support"]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    expect(within(nav).queryByText("Equity")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Unifolio home" })).toHaveAttribute("href", "/home");
    expect(screen.getAllByAltText("Unifolio").length).toBeGreaterThan(0);
  });

  it("shows Portfolio mode, the Equity children and the shared footer", () => {
    sessionStorage.setItem(equityKey, "true");
    mount("/portfolio");
    for (const label of ["Back", "Investments", "Equity", "Direct Stocks", "Mutual Fund", "US Stock", "FDs & bonds", "Debt", "Gold", "Real Estate", "Others", "Profile", "Help & Support"]) {
      expect(within(screen.getByRole("navigation")).getByText(label)).toBeInTheDocument();
    }
    expect(within(screen.getByRole("navigation")).queryByText("Liabilities")).not.toBeInTheDocument();
  });

  it.each(["/portfolio/mutual-funds", "/portfolio/mutual-funds/holdings", "/portfolio/mutual-funds/funds/INF123", "/portfolio/mutual-funds/funds/INF123/insights"])(
    "marks only Mutual Fund active at %s, with Equity quietly containing it", path => {
      mount(path);
      const active = screen.getByRole("navigation").querySelectorAll('[aria-current="page"]');
      expect(active).toHaveLength(1);
      expect(active[0]).toHaveTextContent("Mutual Fund");
      expect(row("Investments").closest('[aria-current="page"]')).toBeNull();
      expect(screen.getByRole("button", { name: "Equity" })).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("button", { name: "Equity" })).toHaveAttribute("data-contains-active", "true");
    },
  );

  it("marks Investments active only at /portfolio, including after it becomes live", () => {
    routes = routes.map(route => route.id === "portfolio" ? { ...route, status: "live" } : route);
    mount("/portfolio");
    const active = screen.getByRole("navigation").querySelectorAll('[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Investments");
  });

  it("toggles Equity without navigating and remembers the choice after remount", () => {
    const view = mount("/portfolio");
    const group = screen.getByRole("button", { name: "Equity" });
    expect(group).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(sessionStorage.getItem(equityKey)).toBe("false");
    expect(screen.getByTestId("location")).toHaveTextContent("/portfolio");
    view.unmount();
    mount("/portfolio");
    expect(screen.getByRole("button", { name: "Equity" })).toHaveAttribute("aria-expanded", "false");
  });

  it("supports Enter and Space on the Equity button without navigation", () => {
    mount("/portfolio");
    const group = screen.getByRole("button", { name: "Equity" });
    group.focus();
    fireEvent.keyDown(group, { key: "Enter" });
    fireEvent.keyUp(group, { key: "Enter" });
    expect(group).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(group, { key: " " });
    fireEvent.keyUp(group, { key: " " });
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("location")).toHaveTextContent("/portfolio");
  });

  it("opens Equity for a child page but lets the user collapse and re-expand it there (owner decision 25 Oct)", () => {
    sessionStorage.setItem(equityKey, "false");
    mount("/portfolio/mutual-funds/holdings");
    const group = screen.getByRole("button", { name: "Equity" });
    expect(group).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(sessionStorage.getItem(equityKey)).toBe("false");
    expect(screen.getByTestId("location")).toHaveTextContent("/portfolio/mutual-funds/holdings");
  });

  it("keeps the user's stored choice off a child page, and reopens Equity when navigation lands on a child again", () => {
    sessionStorage.setItem(equityKey, "false");
    mount("/portfolio/mutual-funds");
    const group = screen.getByRole("button", { name: "Equity" });
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Test: Debt" }));
    expect(group).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Test: Mutual Funds" }));
    expect(group).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps placeholder rows focusable, disabled and free of hrefs", () => {
    mount();
    const home = row("Home");
    expect(home).toHaveAttribute("aria-disabled", "true");
    expect(home).toHaveAttribute("tabindex", "0");
    expect(home).not.toHaveAttribute("href");
    fireEvent.click(home);
    expect(screen.getByTestId("location")).toHaveTextContent("/home");
  });

  it("shows a Radix Coming soon tooltip on hover", async () => {
    mount();
    fireEvent.pointerMove(row("Portfolio"), { pointerType: "mouse" });
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Coming soon");
  });

  it("shows a Radix Coming soon tooltip on keyboard focus", async () => {
    mount();
    act(() => row("Portfolio").focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Coming soon");
  });

  it("turns a row into a working link when its fixture route becomes live", () => {
    routes = routes.map(route => route.id === "planning" ? { ...route, status: "placeholder" } : route);
    const view = mount();
    expect(row("Planning")).not.toHaveAttribute("href");
    routes = routes.map(route => route.id === "planning" ? { ...route, status: "live" } : route);
    view.rerender(<MemoryRouter initialEntries={["/home"]}><Harness /></MemoryRouter>);
    const link = screen.getByRole("link", { name: "Planning" });
    fireEvent.click(link);
    expect(screen.getByTestId("location")).toHaveTextContent("/planning");
  });

  it("Back navigates to the remembered live route", () => {
    routes = routes.map(route => route.id === "planning" ? { ...route, status: "live" } : route);
    sessionStorage.setItem("unifolio.shell.back", "/planning");
    mount("/portfolio");
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/planning");
  });

  it("Back falls back to Home when nothing is remembered", () => {
    mount("/portfolio");
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/home");
  });

  it("survives blocked browser storage", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new Error("blocked"); } });
    try {
      mount("/portfolio");
      fireEvent.click(screen.getByRole("button", { name: "Equity" }));
      expect(screen.getByRole("button", { name: "Equity" })).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/home");
    } finally {
      Object.defineProperty(window, "sessionStorage", descriptor);
    }
  });
});

it("provides the exact light and dark shell token sets with an explicit-light system-dark guard", () => {
  const tokens = readFileSync("src/shell/theme/shell-tokens.css", "utf8");
  const expected: Record<string, [string, string]> = {
    page: ["252,252,252", "17,17,17"], card: ["245,245,245", "26,26,26"],
    divider: ["236,236,236", "46,46,46"], "border-input": ["223,223,223", "46,46,46"],
    text: ["17,17,17", "252,252,252"], "text-body": ["75,75,75", "163,163,163"],
    "text-secondary": ["113,113,113", "163,163,163"], "icon-muted": ["155,155,155", "115,115,115"],
    "text-disabled": ["196,196,196", "90,90,90"], accent: ["34,197,94", "34,197,94"],
    "tooltip-bg": ["42,42,42", "33,33,33"], "tooltip-text": ["255,255,255", "252,252,252"],
  };
  const style = document.createElement("style");
  style.textContent = tokens;
  document.head.append(style);
  const root = document.documentElement;
  const originalTheme = root.getAttribute("data-theme");
  try {
    root.setAttribute("data-theme", "light");
    for (const [name, values] of Object.entries(expected)) {
      const value = getComputedStyle(root).getPropertyValue(`--shell-${name}`).trim();
      expect([1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16)).join(",")).toBe(values[0]);
    }
    root.setAttribute("data-theme", "dark");
    for (const [name, values] of Object.entries(expected)) {
      const value = getComputedStyle(root).getPropertyValue(`--shell-${name}`).trim();
      expect([1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16)).join(",")).toBe(values[1]);
    }
    const media = Array.from(style.sheet!.cssRules).find(rule => rule instanceof CSSMediaRule) as CSSMediaRule;
    expect(media.conditionText).toBe("(prefers-color-scheme: dark)");
    const guarded = media.cssRules[0] as CSSStyleRule;
    expect(guarded.selectorText).toBe(':root:not([data-theme="light"])');
    for (const name of Object.keys(expected)) {
      expect(guarded.style.getPropertyValue(`--shell-${name}`)).toBe(getComputedStyle(root).getPropertyValue(`--shell-${name}`).trim());
    }
  } finally {
    style.remove();
    if (originalTheme === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", originalTheme);
  }
});
