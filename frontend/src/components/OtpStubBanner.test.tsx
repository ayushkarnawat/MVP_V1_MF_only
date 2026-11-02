import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OtpStubBanner } from "./OtpStubBanner";

describe("OtpStubBanner", () => {
  it("renders_only_when_a_code_is_returned", () => {
    const { container, rerender } = render(
      <OtpStubBanner code={null} channel="phone" />,
    );
    expect(container.firstChild).toBeNull();

    rerender(<OtpStubBanner code="482913" channel="phone" />);
    expect(
      screen.getByText("Test mode: no SMS is sent yet. Your phone code is 482 913."),
    ).toBeInTheDocument();

    rerender(<OtpStubBanner code="482913" channel="email" />);
    expect(
      screen.getByText("Test mode: your email code is 482 913."),
    ).toBeInTheDocument();
  });
});
