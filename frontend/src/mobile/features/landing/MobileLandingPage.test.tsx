import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileLandingPage } from "./MobileLandingPage";

describe("MobileLandingPage", () => {
  it("renders brand mark, headline, subcopy, hero artwork, and call-to-actions", () => {
    const onGetStarted = vi.fn();
    const onLogin = vi.fn();

    render(<MobileLandingPage onGetStarted={onGetStarted} onLogin={onLogin} />);

    expect(screen.getByText("Unifolio")).toBeInTheDocument();
    expect(screen.getByText("Scattered")).toBeInTheDocument();
    expect(screen.getByText(/holdings, one clear picture/i)).toBeInTheDocument();
    expect(
      screen.queryByText("All your mutual funds and folios, unified into one singular view.")
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Unifolio Fluid Wealth Convergence Visual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /already have an account/i })).toBeInTheDocument();
  });

  it("does not render eyebrow badges, labels, phone mockups, fake stats, or dashboard feature cards", () => {
    render(<MobileLandingPage onGetStarted={vi.fn()} onLogin={vi.fn()} />);

    expect(screen.queryByText("WEALTH UNIFIED")).not.toBeInTheDocument();
    expect(screen.queryByText("Unified Portfolio")).not.toBeInTheDocument();
    expect(screen.queryByText("Verified CAS")).not.toBeInTheDocument();
    expect(screen.queryByText("₹42,85,620")).not.toBeInTheDocument();
    expect(screen.queryByText("+14.2%")).not.toBeInTheDocument();
  });

  it("calls onGetStarted when primary CTA is clicked", () => {
    const onGetStarted = vi.fn();
    const onLogin = vi.fn();

    render(<MobileLandingPage onGetStarted={onGetStarted} onLogin={onLogin} />);

    const getStartedBtn = screen.getByRole("button", { name: /get started/i });
    fireEvent.click(getStartedBtn);

    expect(onGetStarted).toHaveBeenCalledTimes(1);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("calls onLogin when secondary CTA is clicked", () => {
    const onGetStarted = vi.fn();
    const onLogin = vi.fn();

    render(<MobileLandingPage onGetStarted={onGetStarted} onLogin={onLogin} />);

    const loginBtn = screen.getByRole("button", { name: /already have an account/i });
    fireEvent.click(loginBtn);

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onGetStarted).not.toHaveBeenCalled();
  });
});
