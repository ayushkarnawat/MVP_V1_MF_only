import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileAuthBackground } from "./MobileAuthBackground";

describe("MobileAuthBackground", () => {
  it("renders pure vector SVG geometry with proper aria-hidden attribute", () => {
    const { container } = render(<MobileAuthBackground />);
    const root = container.firstChild as HTMLElement;
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toContain("lg:hidden");

    const svg = root.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 375 812");
  });

  it("contains unifying stream gradient definitions and anchor paths", () => {
    const { container } = render(<MobileAuthBackground />);
    const linearGradients = container.querySelectorAll("linearGradient");
    expect(linearGradients.length).toBeGreaterThanOrEqual(2);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(4);
  });
});
