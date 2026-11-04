import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthPage } from "./AuthPage";

afterEach(() => document.documentElement.removeAttribute("data-theme"));

describe("AuthPage: light only and focus (UI round 2, S6 task 6.15)", () => {
  it("puts the document on the light theme while mounted and gives the saved theme back", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { unmount } = render(<AuthPage><h1>Screen</h1></AuthPage>);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    unmount();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
  it("leaves no theme attribute behind when there was none", () => {
    const { unmount } = render(<AuthPage><h1>Screen</h1></AuthPage>);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    unmount();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
  it("moving from one auth screen to the next keeps the page light", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { rerender } = render(<AuthPage key="a"><h1>One</h1></AuthPage>);
    rerender(<AuthPage key="b"><h1>Two</h1></AuthPage>);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
  it("moves focus to the screen's heading when nothing has focus, so the new screen is announced", () => {
    render(<AuthPage><h1>Let&apos;s get started</h1></AuthPage>);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Let's get started" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("tabindex", "-1");
  });
  it("does not take focus from a field that asked for it", () => {
    render(<AuthPage><h1>Screen</h1><input aria-label="Name" autoFocus /></AuthPage>);
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });
  it("a screen with no heading is fine", () => {
    expect(() => render(<AuthPage><p>Setting up your profile...</p></AuthPage>)).not.toThrow();
  });
});
