import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("toggles theme between light and dark when clicked", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: /toggle theme/i });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    fireEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
