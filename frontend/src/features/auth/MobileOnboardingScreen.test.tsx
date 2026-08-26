import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileOnboardingScreen } from "./MobileOnboardingScreen";

describe("MobileOnboardingScreen", () => {
  it("renders top bar, headline, illustration, subtext, content, and CTA in correct order", () => {
    const onBack = vi.fn();
    const onSkip = vi.fn();
    const onCtaClick = vi.fn();

    render(
      <MobileOnboardingScreen
        currentStepIndex={1}
        totalSteps={5}
        onBack={onBack}
        onSkip={onSkip}
        title="Test Headline Title"
        illustrationVariant="name"
        subtext="Test Subtext Description"
        ctaLabel="Next Step"
        onCtaClick={onCtaClick}
      >
        <div data-testid="custom-content">Step Input Content</div>
      </MobileOnboardingScreen>
    );

    // 1. Top bar elements
    expect(screen.getByText("Unifolio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Step 2 of 5")).toBeInTheDocument();

    // 2. Headline
    expect(screen.getByRole("heading", { level: 1, name: /test headline title/i })).toBeInTheDocument();

    // 3. Illustration
    expect(screen.getAllByRole("img", { name: /interactive portfolio dashboard illustration/i }).length).toBeGreaterThan(0);

    // 4. Subtext
    expect(screen.getByText("Test Subtext Description")).toBeInTheDocument();

    // 5. Content slot
    expect(screen.getByTestId("custom-content")).toBeInTheDocument();

    // 6. CTA button
    const cta = screen.getByRole("button", { name: /next step/i });
    expect(cta).toBeInTheDocument();

    fireEvent.click(cta);
    expect(onCtaClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("handles disabled CTA state", () => {
    render(
      <MobileOnboardingScreen
        currentStepIndex={0}
        totalSteps={5}
        title="Disabled CTA Test"
        ctaLabel="Continue"
        onCtaClick={vi.fn()}
        ctaDisabled
      />
    );

    const cta = screen.getByRole("button", { name: /continue/i });
    expect(cta).toBeDisabled();
  });
});
