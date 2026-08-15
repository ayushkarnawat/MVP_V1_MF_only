import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthEntryFlow } from "./AuthEntryFlow";
import { AuthProvider } from "./AuthContext";
import * as api from "./api";
import { ApiError } from "../../lib/apiClient";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    requestOtp: vi.fn(),
    sendEmailOtp: vi.fn(),
    verifyOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    verifyGoogleCredential: vi.fn(),
    getMe: vi.fn(),
  };
});

function renderFlow() {
  return render(
    <AuthProvider>
      <AuthEntryFlow />
    </AuthProvider>,
  );
}

const NORMAL_SESSION = { session_token: "tok-1", user_id: "u1", onboarding_step: null, onboarding_completed: false };
const ME_RESPONSE = {
  user_id: "u1", phone_number: "+919999999999", email: null,
  onboarding_step: null, onboarding_completed: false, investor_type: null, primary_goal: null,
};

describe("AuthEntryFlow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders Google, Apple (disabled), Email, and Phone in that order", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByTestId("google-button-container")).toBeInTheDocument());

    const appleButton = screen.getByRole("button", { name: /continue with apple/i });
    expect(appleButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /continue with email/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeEnabled();
  });

  it("moves from phone entry to OTP verify after a successful request", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /continue with phone/i }));

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());
    expect(screen.getByText(/654321/)).toBeInTheDocument();
  });

  it("logs in on successful phone OTP verification", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    vi.mocked(api.verifyOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /continue with phone/i }));
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.verifyOtp).toHaveBeenCalledWith("+919999999999", "654321", undefined));
  });

  it("shows an inline error when phone OTP verification fails", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    vi.mocked(api.verifyOtp).mockRejectedValue(new ApiError(401, "Invalid or expired OTP."));
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /continue with phone/i }));
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(screen.getByText(/invalid or expired otp/i)).toBeInTheDocument());
  });

  it("moves from email entry through email OTP to login", async () => {
    vi.mocked(api.sendEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "111222" });
    vi.mocked(api.verifyEmailOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    expect(screen.getByText(/111222/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "111222" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.verifyEmailOtp).toHaveBeenCalledWith("a@example.com", "111222"));
  });

  it("a Google credential with a normal session logs in directly, no intermediate screen", async () => {
    vi.mocked(api.verifyGoogleCredential).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    renderFlow();
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());

    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "fake-id-token" });

    await waitFor(() => expect(api.verifyGoogleCredential).toHaveBeenCalledWith("fake-id-token"));
    delete (window as { google?: unknown }).google;
  });

  it("a phone_required response transitions to the phone step with phone-gate copy", async () => {
    vi.mocked(api.sendEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "111222" });
    vi.mocked(api.verifyEmailOtp).mockResolvedValue({
      phone_required: { token: "gate-tok", prefill_email: "newsignup@example.com" },
    });
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "newsignup@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "111222" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(screen.getByText(/one more step/i)).toBeInTheDocument());
    expect(screen.getByText(/newsignup@example\.com/)).toBeInTheDocument();
    // No back button during the mandatory phone gate.
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
  });

  it("completing the phone gate after a Google signup logs in with the pending token attached", async () => {
    vi.mocked(api.verifyGoogleCredential).mockResolvedValue({
      phone_required: { token: "gate-tok-2", prefill_email: "g@example.com" },
    });
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "999888" });
    vi.mocked(api.verifyOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    renderFlow();
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "fake-id-token" });
    await waitFor(() => screen.getByText(/one more step/i));

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919111111111" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "999888" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.verifyOtp).toHaveBeenCalledWith("+919111111111", "999888", "gate-tok-2"));
    delete (window as { google?: unknown }).google;
  });

  it("a link_required response transitions to the link-account screen instead of logging in", async () => {
    vi.mocked(api.sendEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "555444" });
    vi.mocked(api.verifyEmailOtp).mockResolvedValue({
      link_required: { token: "link-tok", matched_email: "existing@example.com", existing_method: "phone" },
    });
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "existing@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "555444" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(screen.getByText(/existing@example\.com/)).toBeInTheDocument());
    expect(screen.getByText(/log in with your phone/i)).toBeInTheDocument();
    expect(api.verifyOtp).not.toHaveBeenCalled(); // no session was created
  });

  it("renders light/dark theme toggle on auth entry screen", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByTestId("google-button-container")).toBeInTheDocument());

    const themeToggle = screen.getByRole("button", { name: /toggle.*theme/i });
    expect(themeToggle).toBeInTheDocument();
    fireEvent.click(themeToggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
