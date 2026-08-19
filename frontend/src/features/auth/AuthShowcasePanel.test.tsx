import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthShowcasePanel } from "./AuthShowcasePanel";

describe("AuthShowcasePanel", () => {
  it("renders the hero headline, supporting line, and trust footer", () => {
    render(<AuthShowcasePanel />);

    expect(screen.getByText("Stop Guessing.")).toBeInTheDocument();
    expect(screen.getByText("Start Systemizing.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Every folio, every family member — reconciled into one number you can trust.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Most investors manage wealth in scattered silos."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Disciplined portfolios run on a systematic engine."),
    ).toBeInTheDocument();
  });

  it("does not introduce a second page-level heading", () => {
    render(<AuthShowcasePanel />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("marks the grain and ambient-arc graphics as decorative", () => {
    const { container } = render(<AuthShowcasePanel />);
    const decorativeSvgs = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(decorativeSvgs).toHaveLength(2);
  });

  it("uses the schema's radius-lg token, not an ad-hoc rounded-3xl, and allows text selection", () => {
    const { container } = render(<AuthShowcasePanel />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("rounded-lg");
    expect(root.className).not.toContain("rounded-3xl");
    expect(root.className).not.toContain("select-none");
  });

  it("resolves straight to the final visual state under test/reduced-motion (no mid-animation values)", () => {
    render(<AuthShowcasePanel />);
    const firstLine = screen.getByText("Stop Guessing.");
    // isTestEnv forces the instant path — the line's own `initial` state
    // already equals its animate target, so opacity must never read 0 here.
    expect(firstLine).toHaveStyle({ opacity: "1" });
  });

  it("reads slightly more present once the user has moved past the landing step", () => {
    render(<AuthShowcasePanel step="phone" />);
    const wordmark = screen.getByText("Unifolio");
    expect(wordmark).toHaveStyle({ opacity: "0.85" });
  });
});
