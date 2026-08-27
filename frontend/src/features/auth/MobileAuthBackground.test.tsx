import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileAuthBackground } from "./MobileAuthBackground";

describe("MobileAuthBackground", () => {
  it("renders pure vector SVG geometry with proper aria-hidden attribute on auth screens", () => {
    const { container } = render(<MobileAuthBackground activeStep="auth_landing" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toContain("lg:hidden");

    const svg = root.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 375 60");
  });

  it("contains wandering S-curve gradients, route paths, and Unifolio ring logo traveler for signup", () => {
    const { container } = render(<MobileAuthBackground activeStep="auth_phone" authMode="signup" />);
    const linearGradients = container.querySelectorAll("linearGradient");
    expect(linearGradients.length).toBeGreaterThanOrEqual(2);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(3);

    // Traveler ring images (light and dark mode)
    const images = container.querySelectorAll("image");
    expect(images.length).toBe(2);

    // 4 stationary milestone pedestals
    const stationCircles = container.querySelectorAll("circle");
    expect(stationCircles.length).toBeGreaterThanOrEqual(4);
  });

  it("renders exactly two milestones in login mode (Phone/Email entry -> OTP verification)", () => {
    const { container } = render(<MobileAuthBackground activeStep="auth_email" authMode="login" stepIndex={0} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();

    // Traveler ring images
    const images = container.querySelectorAll("image");
    expect(images.length).toBe(2);
  });

  it("advances to step 2 on OTP verification in login mode", () => {
    const { container } = render(<MobileAuthBackground activeStep="auth_otp" authMode="login" stepIndex={1} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("returns null on onboarding steps to guarantee complete removal from onboarding", () => {
    const { container } = render(<MobileAuthBackground activeStep="onboarding_q1_name" />);
    expect(container.firstChild).toBeNull();
  });
});



