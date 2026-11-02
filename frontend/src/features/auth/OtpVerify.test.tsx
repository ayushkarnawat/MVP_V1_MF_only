import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OtpVerify } from "./OtpVerify";

describe("OtpVerify", () => {
  it("sign_in_screen_still_shows_local_dev_otp_through_the_shared_banner", () => {
    const { rerender } = render(
      <OtpVerify
        phoneNumber="+919999999999"
        channel="phone"
        onSubmit={vi.fn()}
        onResend={vi.fn()}
        submitting={false}
        error={null}
        devOtp="482913"
      />,
    );

    expect(
      screen.getByText("Test mode: no SMS is sent yet. Your phone code is 482 913."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Local Dev OTP/i)).not.toBeInTheDocument();

    rerender(
      <OtpVerify
        phoneNumber="user@example.com"
        channel="email"
        onSubmit={vi.fn()}
        onResend={vi.fn()}
        submitting={false}
        error={null}
        devOtp="482913"
      />,
    );

    expect(
      screen.getByText("Test mode: your email code is 482 913."),
    ).toBeInTheDocument();

    rerender(
      <OtpVerify
        phoneNumber="+919999999999"
        channel="phone"
        onSubmit={vi.fn()}
        onResend={vi.fn()}
        submitting={false}
        error={null}
        devOtp={null}
      />,
    );

    expect(screen.queryByText(/Test mode:/i)).not.toBeInTheDocument();
  });
});
