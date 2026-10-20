import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreExplainer } from "./ScoreExplainer";

const open = () => fireEvent.click(screen.getByRole("button", { name: "How is this calculated?" }));

describe("ScoreExplainer", () => {
  it("is closed until asked", () => {
    render(<ScoreExplainer />);
    expect(screen.getByRole("button", { name: "How is this calculated?" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText("How the Unifolio Fund Score works")).toBeNull();
  });

  it("opens to show the three score weights", () => {
    render(<ScoreExplainer />);
    open();
    const button = screen.getByRole("button", { name: "How is this calculated?" });
    const region = screen.getByRole("region", { name: "How is this calculated?" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(region.id).toBe(button.getAttribute("aria-controls"));
    expect(within(region).getByText("Return (45%)")).toBeInTheDocument();
    expect(within(region).getByText("Risk (30%)")).toBeInTheDocument();
    expect(within(region).getByText("Consistency (25%)")).toBeInTheDocument();
    expect(region).toHaveTextContent("A modelling opinion based on past data, not a guarantee of future returns.");
  });

  it("explains the five tiers", () => {
    render(<ScoreExplainer />);
    open();
    expect(screen.getByRole("region")).toHaveTextContent(/Tier 1 is the top 20% of its category/i);
    expect(screen.getByRole("region")).toHaveTextContent("Tier 5 for the bottom 20%.");
  });

  it("explains the composite rating weights", () => {
    render(<ScoreExplainer />);
    open();
    const composite = screen.getByText("Composite rating (Fund Ranking):").closest("p");
    expect(composite).toHaveTextContent("25% 3-year return, 25% 5-year return, 20% performance against the category, 15% low volatility, 15% low expense ratio.");
  });

  it("closes again", () => {
    render(<ScoreExplainer />);
    open();
    open();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText("How the Unifolio Fund Score works")).toBeNull();
    expect(screen.getByRole("button", { name: "How is this calculated?" })).toHaveAttribute("aria-expanded", "false");
  });

  it("gives multiple instances independent controls and unique regions", () => {
    render(<><ScoreExplainer /><ScoreExplainer /></>);
    const buttons = screen.getAllByRole("button", { name: "How is this calculated?" });
    expect(buttons[0].getAttribute("aria-controls")).not.toBe(buttons[1].getAttribute("aria-controls"));
    fireEvent.click(buttons[0]);
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(buttons[1]).toHaveAttribute("aria-expanded", "false");
  });
});
