import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { OtpPanel } from "./OtpPanel";

describe("AuthLeftPanel: feature rows with a detail line (the login copy slide)", () => {
  it("shows a title and a detail under it for each row, in one left-aligned block", () => {
    render(
      <AuthLeftPanel sketch="laptop" headline="Hello" paragraph="There."
        rows={[{ text: "All your investments", detail: "Mutual funds, stocks, PMS, real estate, gold and more." }, { text: "Plain row" }]} />,
    );
    expect(screen.getByText("All your investments")).toBeInTheDocument();
    expect(screen.getByText("Mutual funds, stocks, PMS, real estate, gold and more.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByRole("listitem")[1].textContent).toBe("Plain row");
  });
});

describe("OtpPanel: the words of the design (login screens 2 and 3)", () => {
  const mount = (over: Partial<Parameters<typeof OtpPanel>[0]> = {}) =>
    render(<OtpPanel channel="phone" identity="+91 ••••• 43210" submitLabel="Verify and log in" devOtp={null} error={null} onSubmit={vi.fn()} onResend={vi.fn()} {...over} />);

  it("says Enter the 6-digit code sent to the masked identity", () => {
    mount();
    expect(screen.getByText("Enter the 6-digit code sent to +91 ••••• 43210.")).toBeInTheDocument();
  });
  it("asks Didn't receive the code? beside the countdown", () => {
    mount();
    expect(screen.getByText("Didn't receive the code?")).toBeInTheDocument();
    expect(screen.queryByText("Didn't get the code?")).toBeNull();
  });
  it("draws no Edit control unless a handler is given (login puts Edit in the left panel)", () => {
    mount();
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
    const onEditIdentity = vi.fn();
    mount({ onEditIdentity, editLabel: "Edit number" });
    fireEvent.click(screen.getByRole("button", { name: "Edit number" }));
    expect(onEditIdentity).toHaveBeenCalledTimes(1);
  });
});
