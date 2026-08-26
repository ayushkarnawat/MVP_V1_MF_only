import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingCardStack } from "./OnboardingCardStack";
import type { HistoryState } from "./onboardingHistory";

describe("OnboardingCardStack", () => {
  const baseHistory: HistoryState = {
    order: ["trust_primer", "q1_name", "q2_investing"],
    cursor: 0,
    skipped: new Set(),
  };

  it("renders front card content along with persistent logo, desktop progress dots, and exactly 2 background placeholder cards", () => {
    render(
      <OnboardingCardStack history={baseHistory}>
        <div data-testid="front-card-content">Question 1</div>
      </OnboardingCardStack>
    );

    expect(screen.getByText("Unifolio")).toBeInTheDocument();
    expect(screen.getByLabelText("Step 4 of 5")).toBeInTheDocument();
    expect(screen.getByTestId("front-card-content")).toBeInTheDocument();
    const placeholders = screen.getAllByTestId("card-stack-placeholder");
    expect(placeholders).toHaveLength(2);
  });

  it("advances card smoothly when history cursor advances", () => {
    const { rerender } = render(
      <OnboardingCardStack history={baseHistory}>
        <div data-testid="front-card-content">Question 1</div>
      </OnboardingCardStack>
    );

    expect(screen.getByText("Question 1")).toBeInTheDocument();

    const nextHistory: HistoryState = {
      ...baseHistory,
      cursor: 1,
    };

    rerender(
      <OnboardingCardStack history={nextHistory}>
        <div data-testid="front-card-content">Question 2</div>
      </OnboardingCardStack>
    );

    expect(screen.getByText("Question 2")).toBeInTheDocument();
  });

  it("navigates backward smoothly when history cursor goes back", () => {
    const forwardHistory: HistoryState = {
      ...baseHistory,
      cursor: 1,
    };

    const { rerender } = render(
      <OnboardingCardStack history={forwardHistory}>
        <div data-testid="front-card-content">Question 2</div>
      </OnboardingCardStack>
    );

    expect(screen.getByText("Question 2")).toBeInTheDocument();

    const backwardHistory: HistoryState = {
      ...baseHistory,
      cursor: 0,
    };

    rerender(
      <OnboardingCardStack history={backwardHistory}>
        <div data-testid="front-card-content">Question 1</div>
      </OnboardingCardStack>
    );

    expect(screen.getByText("Question 1")).toBeInTheDocument();
  });
});
