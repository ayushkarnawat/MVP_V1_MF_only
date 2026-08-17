import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkAccountPrompt } from "./LinkAccountPrompt";
import * as api from "./api";
import { ApiError } from "../../lib/apiClient";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, requestOtp: vi.fn(), sendEmailOtp: vi.fn(), verifyOtp: vi.fn(), verifyEmailOtp: vi.fn() };
});

describe("LinkAccountPrompt", () => {
  beforeEach(() => {
    // GoogleButton refuses to render without a configured client ID; no .env
    // is committed, so stub one for the google-method case.
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("shows the matched-account banner naming the existing method", () => {
    render(
      <LinkAccountPrompt
        matchedEmail="a@example.com"
        existingMethod="phone"
        pendingToken="pending-tok"
        onLinked={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/a@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/log in with your phone/i)).toBeInTheDocument();
  });

  it("completes a phone-based link and calls onLinked with the session", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    vi.mocked(api.verifyOtp).mockResolvedValue({
      session_token: "tok-linked", user_id: "u1", onboarding_step: null, onboarding_completed: false,
    });
    const onLinked = vi.fn();
    render(
      <LinkAccountPrompt matchedEmail="a@example.com" existingMethod="phone" pendingToken="pending-tok" onLinked={onLinked} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.verifyOtp).toHaveBeenCalledWith("+919999999999", "654321", "pending-tok"));
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith(expect.objectContaining({ session_token: "tok-linked" })));
  });

  it("completes an email-based link and calls onLinked with the session", async () => {
    vi.mocked(api.sendEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "111222" });
    vi.mocked(api.verifyEmailOtp).mockResolvedValue({
      session_token: "tok-linked-2", user_id: "u2", onboarding_step: null, onboarding_completed: false,
    });
    const onLinked = vi.fn();
    render(
      <LinkAccountPrompt matchedEmail="a@example.com" existingMethod="email" pendingToken="pending-tok-2" onLinked={onLinked} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "111222" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.verifyEmailOtp).toHaveBeenCalledWith("a@example.com", "111222", "pending-tok-2"));
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith(expect.objectContaining({ session_token: "tok-linked-2" })));
  });

  it("renders a GoogleButton when the existing method is google", () => {
    render(
      <LinkAccountPrompt matchedEmail="a@example.com" existingMethod="google" pendingToken="pending-tok-3" onLinked={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByTestId("google-button-container")).toBeInTheDocument();
  });

  it("clears a stale error when navigating back from a failed OTP attempt", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    vi.mocked(api.verifyOtp).mockRejectedValue(new ApiError(401, "Invalid or expired OTP."));
    render(
      <LinkAccountPrompt
        matchedEmail="a@example.com"
        existingMethod="phone"
        pendingToken="pending-tok"
        onLinked={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));
    await waitFor(() => expect(screen.getByText(/invalid or expired otp/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /change number/i }));

    expect(screen.queryByText(/invalid or expired otp/i)).not.toBeInTheDocument();
  });

  it("offers a back control that cancels the link instead of dead-ending", () => {
    const onCancel = vi.fn();
    render(
      <LinkAccountPrompt
        matchedEmail="a@example.com"
        existingMethod="phone"
        pendingToken="pending-tok"
        onLinked={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
