import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubscriptionCard } from "./SubscriptionCard";

describe("SubscriptionCard", () => {
  it("has the heading and the one-line subtitle", () => {
    render(<SubscriptionCard />);
    expect(screen.getByRole("heading", { level: 2, name: "Subscription & Billing" })).toBeInTheDocument();
    expect(screen.getByText("Your plan.")).toBeInTheDocument();
  });

  it("says the current plan is Early access", () => {
    render(<SubscriptionCard />);
    expect(screen.getByTestId("plan-row")).toHaveTextContent("Current planEarly access");
  });

  it("shows one Active badge", () => {
    render(<SubscriptionCard />);
    expect(screen.getAllByTestId("plan-badge")).toHaveLength(1);
    expect(screen.getByTestId("plan-badge").textContent).toBe("Active");
  });

  it("has the one line about early access", () => {
    render(<SubscriptionCard />);
    expect(screen.getByText("You are using Unifolio during early access.")).toBeInTheDocument();
  });

  it("shows no price, amount, renewal date or billing history, and no digit at all", () => {
    const { container } = render(<SubscriptionCard />);
    expect(container.textContent).not.toMatch(/\d/);
    expect(container.textContent).not.toMatch(/₹|\bRs\b|\bINR\b|\$|price|renew|invoice|history|per month|per year|upgrade|payment/i);
  });

  it("has no link and no button", () => {
    render(<SubscriptionCard />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
