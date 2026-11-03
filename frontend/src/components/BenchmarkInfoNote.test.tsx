import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BenchmarkInfoNote } from "./BenchmarkInfoNote";

describe("BenchmarkInfoNote", () => {
  it("renders nothing when note is null, undefined, or empty (old payloads without notes)", () => {
    const { container, rerender } = render(<BenchmarkInfoNote note={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<BenchmarkInfoNote note={undefined} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<BenchmarkInfoNote note="" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<BenchmarkInfoNote note="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an accessible button with aria-describedby and focus ring when note is present", () => {
    render(<BenchmarkInfoNote note="Explanatory note from backend." />);
    const button = screen.getByRole("button", { name: /benchmark note/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("i");
    expect(button.className).toContain("focus-visible:outline");

    const describedById = button.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();

    const tooltip = screen.getByTestId("benchmark-note-tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveAttribute("id", describedById!);
    expect(tooltip).toHaveAttribute("role", "tooltip");
    expect(tooltip).toHaveTextContent("Explanatory note from backend.");
    // Hidden initially
    expect(tooltip).not.toBeVisible();
  });

  it("opens on hover (mouseEnter) and closes on mouseLeave", () => {
    render(<BenchmarkInfoNote note="Backend note on hover." />);
    const button = screen.getByRole("button", { name: /benchmark note/i });
    const tooltip = screen.getByTestId("benchmark-note-tooltip");

    expect(tooltip).not.toBeVisible();

    fireEvent.mouseEnter(button);
    expect(tooltip).toBeVisible();

    fireEvent.mouseLeave(button);
    expect(tooltip).not.toBeVisible();
  });

  it("opens on keyboard focus and closes on blur", () => {
    render(<BenchmarkInfoNote note="Backend note on focus." />);
    const button = screen.getByRole("button", { name: /benchmark note/i });
    const tooltip = screen.getByTestId("benchmark-note-tooltip");

    expect(tooltip).not.toBeVisible();

    fireEvent.focus(button);
    expect(tooltip).toBeVisible();

    fireEvent.blur(button);
    expect(tooltip).not.toBeVisible();
  });

  it("opens on tap / click, and closes when clicked again", () => {
    render(<BenchmarkInfoNote note="Backend note on tap." />);
    const button = screen.getByRole("button", { name: /benchmark note/i });
    const tooltip = screen.getByTestId("benchmark-note-tooltip");

    expect(tooltip).not.toBeVisible();

    // Tap to open
    fireEvent.click(button);
    expect(tooltip).toBeVisible();

    // Tap to close
    fireEvent.click(button);
    expect(tooltip).not.toBeVisible();
  });

  it("closes on Escape key press", () => {
    render(<BenchmarkInfoNote note="Backend note to close on Escape." />);
    const button = screen.getByRole("button", { name: /benchmark note/i });
    const tooltip = screen.getByTestId("benchmark-note-tooltip");

    fireEvent.click(button);
    expect(tooltip).toBeVisible();

    // Press Escape on button
    fireEvent.keyDown(button, { key: "Escape" });
    expect(tooltip).not.toBeVisible();

    // Reopen and test global document Escape
    fireEvent.click(button);
    expect(tooltip).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(tooltip).not.toBeVisible();
  });

  it("a_phone_tap_keeps_the_note_open", () => {
    // A tap fires mouseenter, focus and then click; the click must not close what the first two opened.
    render(<BenchmarkInfoNote note="Backend note on a phone." />);
    const button = screen.getByRole("button", { name: /benchmark note/i });
    const tooltip = screen.getByTestId("benchmark-note-tooltip");

    fireEvent.mouseEnter(button);
    fireEvent.focus(button);
    fireEvent.click(button);

    expect(tooltip).toBeVisible();
  });
});
