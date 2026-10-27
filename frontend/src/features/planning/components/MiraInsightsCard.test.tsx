import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MiraInsightsCard } from "./MiraInsightsCard";

describe("MiraInsightsCard", () => {
  it("is a titled card that says it is coming soon", () => {
    render(<MiraInsightsCard onLearnMore={() => {}} />);
    expect(screen.getByRole("region", { name: "Insights from Mira" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Insights from Mira" })).toBeInTheDocument();
    expect(screen.getByText("Coming soon. Mira will point out what mattered most in each event.")).toBeInTheDocument();
  });

  it("opens the explanation through the Learn more button", () => {
    const onLearnMore = vi.fn();
    render(<MiraInsightsCard onLearnMore={onLearnMore} />);
    fireEvent.click(screen.getByRole("button", { name: "Learn more" }));
    expect(onLearnMore).toHaveBeenCalledTimes(1);
  });

  it("does nothing on its own: no call until the button is pressed", () => {
    const onLearnMore = vi.fn();
    render(<MiraInsightsCard onLearnMore={onLearnMore} />);
    expect(onLearnMore).not.toHaveBeenCalled();
  });

  it("hides its lightbulb icon from assistive technology", () => {
    const { container } = render(<MiraInsightsCard onLearnMore={() => {}} />);
    const icon = container.querySelector("h3 svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("has a card surface, and the button is a plain type=button", () => {
    render(<MiraInsightsCard onLearnMore={() => {}} />);
    expect(screen.getByRole("region", { name: "Insights from Mira" })).toHaveClass("rounded-xl", "border-[var(--ui-divider)]", "bg-[var(--ui-card)]");
    expect(screen.getByRole("button", { name: "Learn more" })).toHaveAttribute("type", "button");
  });
});
