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
    signupEmail: vi.fn(),
    loginEmail: vi.fn(),
    verifyOtp: vi.fn(),
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

function fillEmailPassword(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: password } });
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

  it("renders Log in tab with Continue with Google, Email, and Phone (no Apple)", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByTestId("google-button-container")).toBeInTheDocument());

    expect(screen.getByRole("tab", { name: /^log in$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^sign up$/i })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /continue with apple/i })).not.toBeInTheDocument();
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
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  });

  it("signs up directly with email/password from the Sign up tab, transitioning to the mandatory phone gate", async () => {
    vi.mocked(api.signupEmail).mockResolvedValue({
      phone_required: { token: "gate-tok", prefill_email: "newsignup@example.com" },
    });
    renderFlow();
    fireEvent.click(screen.getByRole("tab", { name: /^sign up$/i }));
    fillEmailPassword("newsignup@example.com", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => expect(api.signupEmail).toHaveBeenCalledWith("newsignup@example.com", "correcthorse"));
    await waitFor(() => expect(screen.getByText(/one more step/i)).toBeInTheDocument());
    expect(screen.getByText(/finish creating your account for newsignup@example\.com/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
  });

  it("completes signup and logs in once the phone gate completes after an email signup", async () => {
    vi.mocked(api.signupEmail).mockResolvedValue({
      phone_required: { token: "gate-tok", prefill_email: "confirmme@example.com" },
    });
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "111222" });
    vi.mocked(api.verifyOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();
    fireEvent.click(screen.getByRole("tab", { name: /^sign up$/i }));
    fillEmailPassword("confirmme@example.com", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    await waitFor(() => screen.getByText(/one more step/i));

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919111111112" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "111222" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
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

  it("shows an inline error when email signup fails on Sign up tab", async () => {
    vi.mocked(api.signupEmail).mockRejectedValue(
      new ApiError(409, "An account with this email already exists — log in instead."),
    );
    renderFlow();
    fireEvent.click(screen.getByRole("tab", { name: /^sign up$/i }));
    fillEmailPassword("dup@example.com", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());
  });

  it("logs in directly on successful email login from Continue with Email button, no phone gate", async () => {
    vi.mocked(api.loginEmail).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fillEmailPassword("existing@example.com", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() => expect(api.loginEmail).toHaveBeenCalledWith("existing@example.com", "correcthorse"));
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  });

  it("shows the backend's own message on a failed email login, whether wrong credentials or unconfirmed", async () => {
    vi.mocked(api.loginEmail).mockRejectedValue(
      new ApiError(403, "Please confirm your email before signing in with a password — check your inbox, or resend the link."),
    );
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fillEmailPassword("unconfirmed@example.com", "correcthorse");
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() => expect(screen.getByText(/please confirm your email/i)).toBeInTheDocument());
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
});
