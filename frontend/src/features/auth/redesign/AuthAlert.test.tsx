import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthAlert } from "./AuthAlert";

describe("AuthAlert", () => {
  it("announces an error", () => {
    render(<AuthAlert tone="error">No account found.</AuthAlert>);
    expect(screen.getByRole("alert")).toHaveTextContent("No account found.");
  });
  it("is a polite status for the info tone", () => {
    render(<AuthAlert tone="info">Code sent.</AuthAlert>);
    expect(screen.getByRole("status")).toHaveTextContent("Code sent.");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("shows an optional shortcut button that calls its handler", () => {
    const onClick = vi.fn();
    render(<AuthAlert tone="error" action={{ label: "Sign up", onClick }}>No account found.</AuthAlert>);
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("has no button without an action", () => {
    render(<AuthAlert tone="error">Oops.</AuthAlert>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
