import { afterEach, expect, it, vi } from "vitest";
import { buildRegistry } from "../registry/buildRegistry";
import { readBack, rememberBack, shouldRemember } from "./modeMemory";

const routes = buildRegistry().map(route => route.id === "planning" ? { ...route, status: "live" as const } : route);
const key = "unifolio.shell.back";
afterEach(() => vi.restoreAllMocks());

it("remembers a live non-menu route and reads it back", () => {
  const fixtures = routes.map(route => route.id === "profile-personal" ? { ...route, status: "live" as const } : route);
  rememberBack("/profile/personal", fixtures);
  expect(sessionStorage.getItem(key)).toBe("/profile/personal");
  expect(readBack(fixtures)).toBe("/profile/personal");
});

it("remembers Planning at its contract v1.6 URL", () => {
  rememberBack("/planning", routes);
  expect(readBack(routes)).toBe("/planning");
});

it.each(["/import", "/portfolio", "/portfolio/equity", "/portfolio/mutual-funds", "/home", "/unknown"])(
  "never replaces Back with excluded destination %s", path => {
    const fixtures = routes.map(route => route.path === path && route.id !== "home" ? { ...route, status: "live" as const } : route);
    rememberBack("/planning", fixtures);
    rememberBack(path, fixtures);
    expect(readBack(fixtures)).toBe("/planning");
  },
);

it("rejects a live main-mode group and undefined routes", () => {
  const planning = routes.find(route => route.id === "planning")!;
  expect(shouldRemember({ ...planning, kind: "group" })).toBe(false);
  expect(shouldRemember(undefined)).toBe(false);
});

it("falls back when storage is empty, unknown, or a route becomes placeholder", () => {
  expect(readBack(routes)).toBe("/home");
  sessionStorage.setItem(key, "/unknown");
  expect(readBack(routes)).toBe("/home");
  rememberBack("/planning", routes);
  expect(readBack(buildRegistry().map(route => route.id === "planning" ? { ...route, status: "placeholder" } : route))).toBe("/home");
});

it("falls back when a stored destination is now focus-layout or Portfolio", () => {
  for (const path of ["/import", "/portfolio", "/portfolio/equity", "/portfolio/mutual-funds"]) {
    sessionStorage.setItem(key, path);
    expect(readBack(routes.map(route => ({ ...route, status: "live" })))).toBe("/home");
  }
});

it("handles storage read and write errors", () => {
  const storage = {
    getItem: () => { throw new Error("read denied"); },
    setItem: () => { throw new Error("write denied"); },
  };
  expect(() => rememberBack("/planning", routes, storage)).not.toThrow();
  expect(readBack(routes, storage)).toBe("/home");
});

it("handles a throwing sessionStorage getter", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
  Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    expect(() => rememberBack("/planning", routes)).not.toThrow();
    expect(readBack(routes)).toBe("/home");
  } finally {
    Object.defineProperty(window, "sessionStorage", descriptor);
  }
});

it("does not remember a live redirect route whose target is a placeholder", () => {
  sessionStorage.clear();
  rememberBack("/", routes);
  expect(sessionStorage.getItem(key)).toBeNull();
});
