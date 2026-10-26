import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HideValuesButton } from "./HideValuesButton";

describe("HideValuesButton", () => {
  it("offers to hide when values are showing", () => {
    render(<HideValuesButton hidden={false} onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Hide values" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("title")).toBe("Hide values");
  });

  it("offers to show when values are hidden", () => {
    render(<HideValuesButton hidden onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Show values" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("title")).toBe("Show values");
  });

  it("calls onToggle once per click", () => {
    const onToggle = vi.fn();
    render(<HideValuesButton hidden={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("is a plain button that does not submit a form", () => {
    render(<HideValuesButton hidden={false} onToggle={() => {}} />);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("shows a different icon for each state", () => {
    const shown = render(<HideValuesButton hidden={false} onToggle={() => {}} />);
    const shownMarkup = shown.container.innerHTML;
    shown.unmount();
    const hidden = render(<HideValuesButton hidden onToggle={() => {}} />);
    expect(hidden.container.innerHTML).not.toBe(shownMarkup);
  });
});
