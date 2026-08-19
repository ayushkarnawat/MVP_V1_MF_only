import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthShowcasePanel } from "./AuthShowcasePanel";

describe("AuthShowcasePanel", () => {
  it("renders the showcase panel with the artwork SVG asset", () => {
    render(<AuthShowcasePanel />);

    const img = screen.getByRole("img", { name: /unifolio wealth architecture/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src");
  });

  it("maintains the container structure with proper framing", () => {
    const { container } = render(<AuthShowcasePanel />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("overflow-hidden");
    expect(root.className).toContain("bg-[#ECECE8]");
  });

  it("renders consistently across auth steps without crashing", () => {
    const { rerender } = render(<AuthShowcasePanel step="landing" />);
    expect(screen.getByRole("img", { name: /unifolio wealth architecture/i })).toBeInTheDocument();

    rerender(<AuthShowcasePanel step="phone" />);
    expect(screen.getByRole("img", { name: /unifolio wealth architecture/i })).toBeInTheDocument();

    rerender(<AuthShowcasePanel step="otp" />);
    expect(screen.getByRole("img", { name: /unifolio wealth architecture/i })).toBeInTheDocument();
  });
});
