import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthIllustration } from "./AuthIllustration";
import type { AuthIllustrationVariant } from "./AuthIllustration";

describe("AuthIllustration", () => {
  const TEST_CASES: Array<{ variant: AuthIllustrationVariant; expectedSrc: string; altRegex: RegExp }> = [
    {
      variant: "signup",
      expectedSrc: "/illustrations/auth/mobile_signup.png",
      altRegex: /account creation illustration/i,
    },
    {
      variant: "create_account",
      expectedSrc: "/illustrations/auth/mobile_signup.png",
      altRegex: /account creation illustration/i,
    },
    {
      variant: "welcome_back",
      expectedSrc: "/illustrations/auth/mobile_signup.png",
      altRegex: /welcome back portfolio journey/i,
    },
    {
      variant: "email_entry",
      expectedSrc: "/illustrations/auth/mobile_email_entry.png",
      altRegex: /email verification illustration/i,
    },
    {
      variant: "phone_entry",
      expectedSrc: "/illustrations/auth/mobile_phone_entry.png",
      altRegex: /phone entry illustration/i,
    },
    {
      variant: "email_otp",
      expectedSrc: "/illustrations/auth/mobile_email_entry.png",
      altRegex: /email verification illustration/i,
    },
    {
      variant: "phone_otp",
      expectedSrc: "/illustrations/auth/mobile_otp_verify.png",
      altRegex: /phone verification illustration/i,
    },
    {
      variant: "otp_verify",
      expectedSrc: "/illustrations/auth/mobile_otp_verify.png",
      altRegex: /phone verification illustration/i,
    },
  ];

  it.each(TEST_CASES)("renders $variant illustration with correct image asset and aria-hidden container", ({ variant, expectedSrc, altRegex }) => {
    const { container } = render(<AuthIllustration variant={variant} />);
    const root = container.firstChild as HTMLElement;
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("aria-hidden", "true");

    const imgTag = root.querySelector("img");
    expect(imgTag).toBeInTheDocument();
    expect(imgTag).toHaveAttribute("src", expectedSrc);
    expect(imgTag?.getAttribute("alt")).toMatch(altRegex);
    expect(imgTag?.className).toContain("object-contain");
  });
});


