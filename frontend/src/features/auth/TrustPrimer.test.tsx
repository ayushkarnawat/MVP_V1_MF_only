import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrustPrimer } from "./TrustPrimer";

describe("TrustPrimer", () => {
  it("renders desktop view with standardized headline, cards, regulatory anchor, and Next button", () => {
    const handleContinue = vi.fn();
    render(<TrustPrimer onContinue={handleContinue} />);

    // Standardized headline is present
    expect(screen.getByRole("heading", { level: 1, name: /we keep your insights, not your files\./i })).toBeInTheDocument();

    // Feature bullet points must remain intact
    expect(screen.getByText("Read-only portfolio access")).toBeInTheDocument();
    expect(screen.getByText("No raw CAS PDF storage")).toBeInTheDocument();

    // Copy fix and regulatory anchor
    expect(screen.getByText(/we process your cas to understand your holdings, then forget it/i)).toBeInTheDocument();
    expect(screen.getByText(/account aggregator framework/i)).toBeInTheDocument();

    // Next action works
    const nextBtn = screen.getByRole("button", { name: /^next$/i });
    fireEvent.click(nextBtn);
    expect(handleContinue).toHaveBeenCalledTimes(1);
  });

  it("renders mobile privacy screen matching standardized headline, regulatory anchor, and Next button", () => {
    const handleContinue = vi.fn();
    render(<TrustPrimer onContinue={handleContinue} isMobile />);

    // Headline is present with green "insights,"
    expect(screen.getByRole("heading", { level: 1, name: /we keep your insights, not your files\./i })).toBeInTheDocument();

    // Supporting CAS explanation copy with regulatory anchor
    expect(screen.getByText(/we process your cas to understand your holdings, then forget it/i)).toBeInTheDocument();

    // Skip button must NOT be present on privacy screen
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();

    // Next action works
    const nextBtn = screen.getByRole("button", { name: /^next$/i });
    expect(nextBtn).toBeInTheDocument();
    fireEvent.click(nextBtn);
    expect(handleContinue).toHaveBeenCalledTimes(1);
  });
});
