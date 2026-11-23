import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoMark } from "./SectionCard";

describe("InfoMark popover", () => {
  it("InfoMark with a text prop still shows that text as its name and gains click behaviour", async () => {
    render(<InfoMark text="Annualised returns." />);
    const trigger = screen.getByRole("img", { name: "Annualised returns." });
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toHaveTextContent("Annualised returns.");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("InfoMark keeps data-tooltip, role img, tabIndex 0 and the test id", () => {
    render(<InfoMark text="Annualised returns." testId="returns-info" />);
    const trigger = screen.getByTestId("returns-info");
    expect(trigger).toHaveAttribute("role", "img");
    expect(trigger).toHaveAttribute("aria-label", "Annualised returns.");
    expect(trigger).toHaveAttribute("data-tooltip", "Annualised returns.");
    expect(trigger).toHaveAttribute("tabindex", "0");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("keyboard: Tab focuses it, Enter pins it, Escape closes and returns focus", async () => {
    render(<InfoMark text="Annualised returns." />);
    const trigger = screen.getByRole("img", { name: "Annualised returns." });
    act(() => { trigger.focus(); });
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.mouseLeave(trigger);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => { expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
