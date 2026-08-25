import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthEntryFlow } from "./AuthEntryFlow";
import { AuthProvider } from "./AuthContext";
import * as api from "./api";
import { ApiError } from "../../lib/apiClient";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    requestOtp: vi.fn(),
    requestEmailOtp: vi.fn(),
    signupEmail: vi.fn(),
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

function fillEmail(email: string) {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
}

describe("AuthEntryFlow", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    delete (window as { google?: unknown }).google;
  });

  it("switches to Log in view with Continue with Google, Email, and Phone (no Apple)", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByTestId("google-button-container")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(screen.queryByRole("button", { name: /continue with apple/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with email/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeEnabled();
  });

  it("moves from phone entry to OTP verify after a successful request", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with phone/i }));
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.verifyOtp).toHaveBeenCalledWith("+919999999999", "654321", undefined));
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  });

  it("signs up directly with email from the Landing form, transitioning to the inline email-OTP step", async () => {
    vi.mocked(api.signupEmail).mockResolvedValue({
      email_otp_required: { token: "email-gate-tok", prefill_email: "newsignup@example.com", otp: "555444" },
    });
    renderFlow();
    fillEmail("newsignup@example.com");
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => expect(api.signupEmail).toHaveBeenCalledWith("newsignup@example.com"));
    await waitFor(() => expect(screen.getByText(/verify your email/i)).toBeInTheDocument());
    expect(screen.getByText(/555444/)).toBeInTheDocument();
  });

  it("completes signup, verifies the email OTP, then the phone gate, and logs in", async () => {
    vi.mocked(api.signupEmail).mockResolvedValue({
      email_otp_required: { token: "email-gate-tok", prefill_email: "confirmme@example.com", otp: "333444" },
    });
    vi.mocked(api.verifyEmailOtp).mockResolvedValue({
      phone_required: { token: "gate-tok", prefill_email: "confirmme@example.com" },
    });
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "111222" });
    vi.mocked(api.verifyOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();
    fillEmail("confirmme@example.com");
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    await waitFor(() => screen.getByText(/verify your email/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "333444" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() =>
      expect(api.verifyEmailOtp).toHaveBeenCalledWith("confirmme@example.com", "333444", "email-gate-tok"),
    );
    await waitFor(() => screen.getByText(/one more step/i));
    expect(screen.getByText(/finish creating your account for confirmme@example\.com/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919111111112" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "111222" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  });

  it("resends the email OTP via requestEmailOtp when Resend code is clicked on the email-OTP step", async () => {
    vi.mocked(api.signupEmail).mockResolvedValue({
      email_otp_required: { token: "email-gate-tok", prefill_email: "resend@example.com", otp: "111111" },
    });
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "222222" });
    renderFlow();
    fillEmail("resend@example.com");
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    await waitFor(() => screen.getByText(/verify your email/i));

    fireEvent.click(screen.getByRole("button", { name: /resend code/i }));

    await waitFor(() => expect(api.requestEmailOtp).toHaveBeenCalledWith("resend@example.com"));
    await waitFor(() => expect(screen.getByText(/222222/)).toBeInTheDocument());
  });

  it("shows an inline error when the email OTP code is wrong", async () => {
    vi.mocked(api.signupEmail).mockResolvedValue({
      email_otp_required: { token: "email-gate-tok", prefill_email: "wrongcode@example.com", otp: "999999" },
    });
    vi.mocked(api.verifyEmailOtp).mockRejectedValue(new ApiError(401, "Incorrect OTP."));
    renderFlow();
    fillEmail("wrongcode@example.com");
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    await waitFor(() => screen.getByText(/verify your email/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(screen.getByText(/incorrect otp/i)).toBeInTheDocument());
  });

  it("does not show the confirm-your-email acknowledgment for a Google signup's phone gate", async () => {
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

    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an inline error when email signup fails", async () => {
    vi.mocked(api.signupEmail).mockRejectedValue(
      new ApiError(409, "An account with this email already exists — log in instead."),
    );
    renderFlow();
    fillEmail("dup@example.com");
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());
  });

  it("logs in via email OTP from Continue with Email button, no phone gate", async () => {
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "777888" });
    vi.mocked(api.verifyEmailOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fillEmail("existing@example.com");
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));

    await waitFor(() => expect(api.requestEmailOtp).toHaveBeenCalledWith("existing@example.com"));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "777888" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.verifyEmailOtp).toHaveBeenCalledWith("existing@example.com", "777888", undefined));
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  });

  it("shows the backend's own message when logging in with an email that has no account", async () => {
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "444555" });
    vi.mocked(api.verifyEmailOtp).mockRejectedValue(
      new ApiError(401, "No account found for that email — sign up instead."),
    );
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fillEmail("noaccount@example.com");
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "444555" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(screen.getByText(/no account found/i)).toBeInTheDocument());
  });

  it("a link_required response from Google transitions to the link-account screen instead of logging in", async () => {
    vi.mocked(api.verifyGoogleCredential).mockResolvedValue({
      link_required: { token: "link-tok", matched_email: "existing@example.com", existing_method: "email" },
    });
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    renderFlow();
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "fake-id-token" });

    await waitFor(() => expect(screen.getByText(/existing@example\.com/)).toBeInTheDocument());
    expect(screen.getByText(/log in with your email/i)).toBeInTheDocument();
  });

  it("logs in directly without phone gate on Google login for existing users", async () => {
    vi.mocked(api.verifyGoogleCredential).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    renderFlow();
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "fake-existing-id-token" });

    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
    expect(screen.queryByText(/one more step/i)).not.toBeInTheDocument();
  });

  it("cannot bypass phone gate by back-navigation during Google signup", async () => {
    vi.mocked(api.verifyGoogleCredential).mockResolvedValue({
      phone_required: { token: "gate-tok-3", prefill_email: "newgoogle@example.com" },
    });
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    renderFlow();
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "fake-id-token" });

    await waitFor(() => expect(screen.getByText(/one more step/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
  });

  it("renders light/dark theme toggle on auth entry screen", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByTestId("google-button-container")).toBeInTheDocument());

    const themeToggle = screen.getByRole("button", { name: /toggle.*theme/i });
    expect(themeToggle).toBeInTheDocument();
    fireEvent.click(themeToggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("returns to Login mode when Change Email is clicked from email login OTP", async () => {
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "123456" });
    renderFlow();

    // 1. Start from Login
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));

    // 2. Enter email
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));

    // 3. Reaches OTP screen
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());

    // 4. Click Change Email
    fireEvent.click(screen.getByRole("button", { name: /change email/i }));

    // 5. Returned to email entry, and backing out goes to Login page (not Signup)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByRole("button", { name: /continue with email/i })).toBeInTheDocument();
  });

  it("returns to Login mode when Change Phone Number is clicked from phone login OTP", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    renderFlow();

    // 1. Start from Login
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with phone/i }));

    // 2. Enter phone number
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    // 3. Reaches OTP screen
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());

    // 4. Click Change Number
    fireEvent.click(screen.getByRole("button", { name: /change number/i }));

    // 5. Returned to phone entry, and backing out goes to Login page (not Signup)
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeInTheDocument();
  });

  it("clears previous signup error immediately when switching to Log in mode", async () => {
    vi.mocked(api.signupEmail).mockRejectedValue(
      new ApiError(409, "An account with this email already exists — log in instead."),
    );
    renderFlow();
    fillEmail("dup@example.com");
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() => expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument());
  });

  it("clears previous login error immediately when switching to Sign up mode", async () => {
    vi.mocked(api.verifyGoogleCredential).mockRejectedValue(
      new ApiError(401, "Google sign-in failed. Try again."),
    );
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    renderFlow();

    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "bad-token" });

    await waitFor(() => expect(screen.getByText(/google sign-in failed/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    await waitFor(() => expect(screen.queryByText(/google sign-in failed/i)).not.toBeInTheDocument());
  });
});

