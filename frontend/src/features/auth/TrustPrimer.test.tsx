import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrustPrimer } from "./TrustPrimer";

describe("TrustPrimer", () => {
  it("renders desktop view with both cards and single Continue button when isMobile is false", () => {
    const handleContinue = vi.fn();
    render(<TrustPrimer onContinue={handleContinue} />);

    // Primary heading is present
    expect(screen.getByRole("heading", { level: 1, name: /your privacy & data safety come first/i })).toBeInTheDocument();

    // Feature bullet points must remain intact
    expect(screen.getByText("Read-only portfolio access")).toBeInTheDocument();
    expect(screen.getByText("No raw CAS PDF storage")).toBeInTheDocument();

    // Continue action works
    const continueBtn = screen.getByRole("button", { name: /continue/i });
    fireEvent.click(continueBtn);
    expect(handleContinue).toHaveBeenCalledTimes(1);
  });

  it("renders mobile privacy screen matching short stay reference layout when isMobile is true", () => {
    const handleContinue = vi.fn();
    render(<TrustPrimer onContinue={handleContinue} isMobile />);

    // Headline is present with green "insights,"
    expect(screen.getByRole("heading", { level: 1, name: /we keep your insights, not your files\./i })).toBeInTheDocument();

    // Supporting CAS explanation copy is present directly below illustration
    expect(screen.getByText(/your cas is processed in memory to understand your holdings and transactions/i)).toBeInTheDocument();

    // Skip button must NOT be present on privacy screen
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();

    // Continue action works
    const continueBtn = screen.getByRole("button", { name: /continue/i });
    expect(continueBtn).toBeInTheDocument();
    fireEvent.click(continueBtn);
    expect(handleContinue).toHaveBeenCalledTimes(1);
  });
});
