import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrustPrimer } from "./TrustPrimer";

describe("TrustPrimer", () => {
  it("renders only the single-line privacy heading and no subtitle", () => {
    const handleContinue = vi.fn();
    render(<TrustPrimer onContinue={handleContinue} />);

    // Primary heading is present
    expect(screen.getByRole("heading", { level: 1, name: /your privacy & data safety come first/i })).toBeInTheDocument();

    // Subtitle must NOT be present
    expect(screen.queryByText(/unifolio is built with strict read-only financial privacy by design/i)).not.toBeInTheDocument();

    // Feature bullet points must remain intact
    expect(screen.getByText("Read-only portfolio access")).toBeInTheDocument();
    expect(screen.getByText("No raw CAS PDF storage")).toBeInTheDocument();

    // Continue action works
    const continueBtn = screen.getByRole("button", { name: /continue/i });
    fireEvent.click(continueBtn);
    expect(handleContinue).toHaveBeenCalledTimes(1);
  });
});
