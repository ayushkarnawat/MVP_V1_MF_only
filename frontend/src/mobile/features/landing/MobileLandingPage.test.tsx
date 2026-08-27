import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileLandingPage } from "./MobileLandingPage";

describe("MobileLandingPage", () => {
  it("renders headline, subcopy, hero artwork, and call-to-actions", () => {
    const onGetStarted = vi.fn();

    render(<MobileLandingPage onGetStarted={onGetStarted} />);

    expect(screen.getByText("Scattered")).toBeInTheDocument();
    expect(screen.getByText(/holdings/i)).toBeInTheDocument();
    expect(screen.getByText(/one clear/i)).toBeInTheDocument();
    expect(screen.getByText(/picture/i)).toBeInTheDocument();
    expect(
      screen.queryByText("All your mutual funds and folios, unified into one singular view.")
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Unifolio Fluid Wealth Convergence Visual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /already have an account/i })).not.toBeInTheDocument();
  });

  it("does not render eyebrow badges, labels, phone mockups, fake stats, or dashboard feature cards", () => {
    const onGetStarted = vi.fn();
    render(<MobileLandingPage onGetStarted={onGetStarted} />);

    expect(screen.queryByText("WEALTH UNIFIED")).not.toBeInTheDocument();
    expect(screen.queryByText("Unified Portfolio")).not.toBeInTheDocument();
    expect(screen.queryByText("Verified CAS")).not.toBeInTheDocument();
    expect(screen.queryByText("₹42,85,620")).not.toBeInTheDocument();
    expect(screen.queryByText("+14.2%")).not.toBeInTheDocument();
  });

  it("calls onGetStarted when primary CTA is clicked", () => {
    const onGetStarted = vi.fn();

    render(<MobileLandingPage onGetStarted={onGetStarted} />);

    const getStartedBtn = screen.getByRole("button", { name: /get started/i });
    fireEvent.click(getStartedBtn);

    expect(onGetStarted).toHaveBeenCalledTimes(1);
  });
});
