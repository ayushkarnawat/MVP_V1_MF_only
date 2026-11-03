import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { DEV_SCREENS } from "./devScreens";
import { DevIndex } from "./DevIndex";
import { devIndexEnabled } from "./devIndexGuard";

describe("DevIndex (UI round 2, S6 task 6.5)", () => {
  it("lists every registered screen with its title and renders it with fake props", () => {
    render(<DevIndex />);
    expect(screen.getByRole("heading", { level: 1, name: "Auth screens (development only)" })).toBeInTheDocument();
    expect(DEV_SCREENS.length).toBeGreaterThanOrEqual(6);
    for (const screen_ of DEV_SCREENS) expect(screen.getByRole("heading", { level: 2, name: screen_.title })).toBeInTheDocument();
    expect(screen.getAllByTestId("dev-screen")).toHaveLength(DEV_SCREENS.length);
  });
  it("has the foundation entries every later phase builds on", () => {
    expect(DEV_SCREENS.map(entry => entry.id)).toEqual(expect.arrayContaining(["split-card", "otp-phone", "otp-email", "step-progress", "alerts", "tabs"]));
  });
  it("is enabled only in a dev build and only at /dev/auth-screens", () => {
    expect(devIndexEnabled(true, "/dev/auth-screens")).toBe(true);
    expect(devIndexEnabled(false, "/dev/auth-screens")).toBe(false);
    expect(devIndexEnabled(true, "/")).toBe(false);
    expect(devIndexEnabled(true, "/dev/auth-screens/extra")).toBe(false);
  });
  it("App.tsx only reaches it through the import.meta.env.DEV guard", () => {
    const app = readFileSync(resolve("src/App.tsx"), "utf8");
    expect(app).toMatch(/devIndexEnabled\(\s*import\.meta\.env\.DEV\s*,/);
    expect(app).toMatch(/import\(["']\.\/features\/auth\/redesign\/DevIndex["']\)|lazy\(/);
  });
});
