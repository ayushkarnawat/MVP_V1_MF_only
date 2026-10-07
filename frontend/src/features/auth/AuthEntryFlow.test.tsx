import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthEntryFlow } from "./AuthEntryFlow";
import { AuthProvider } from "./AuthContext";
import * as api from "./api";
import { ApiError } from "../../lib/apiClient";
import { getLegalDocuments } from "../legal/api";
import { DOCS } from "../legal/testFixtures";

vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  return { ...actual, getLegalDocuments: vi.fn() };
});

const ACCEPTED = [
  { document_type: "terms_of_service", document_version: "tos-placeholder-2026-10-01" },
  { document_type: "privacy_policy", document_version: "privacy-placeholder-2026-10-01" },
];

/** No tick box since 2026-10-07: waits for the T&C / Privacy versions to load
 * (they are sent with the button click, so the button waits for them). */
async function tickConsent() {
  await screen.findByRole("link", { name: "Terms & Conditions" });
  await waitFor(() => expect(getLegalDocuments).toHaveBeenCalled());
  await act(async () => {});
}

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
  onboarding_step: null, onboarding_completed: false, investor_type: null, primary_goals: null, self_name: null, consent_outdated: [],
};

function fillEmail(email: string) {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
}

describe("AuthEntryFlow", () => {
  beforeEach(() => {
    vi.mocked(getLegalDocuments).mockResolvedValue(DOCS);
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    delete (window as { google?: unknown }).google;
  });

  it("switches to Log in view with Continue with Google, Email, and Phone (no Apple)", async () => {
    renderFlow();
    // Signup mode (default) shows the phone input directly on Landing now
    // (no separate CTA click, no Google button) -- wait for that instead.
    await waitFor(() => expect(screen.getByRole("button", { name: /get otp/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() => expect(screen.getByTestId("google-button-container")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /continue with apple/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with email/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeEnabled();
  });

  it("shows the phone number input and Get OTP directly on the signup screen, no intermediate click", async () => {
    renderFlow();

    expect(screen.getByText(/create your account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get otp/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue with phone/i })).not.toBeInTheDocument();
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

    await waitFor(() => expect(api.verifyOtp).toHaveBeenCalledWith("+919999999999", "654321", undefined, "login"));
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  });

  // The two tests that used to live here -- "signs up directly with email
  // from the Landing form" and "completes signup, verifies the email OTP,
  // then the phone gate" -- exercised Landing's signup-mode email form,
  // which Task 12 (auth-flow-redesign, 2026-09-28) removed entirely in
  // favor of the phone-first CTA below. Their entry point no longer exists
  // in the UI; "completes the phone-first signup" is the direct successor,
  // and "does not show the confirm-your-email acknowledgment for a Google
  // signup's phone gate" further down still covers the mandatory
  // phone-gate-after-signup shape via the surviving Google entry point.

  it("completes the phone-first signup: phone OTP, email gate, email OTP, then logs in", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "111111" });
    vi.mocked(api.verifyOtp).mockResolvedValue({
      email_required: { token: "phone-first-tok", prefill_phone: "+919555555555" },
    });
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "222222" });
    vi.mocked(api.verifyEmailOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919555555555" } });
    await tickConsent();
    fireEvent.click(screen.getByRole("button", { name: /get otp/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() =>
      expect(api.verifyOtp).toHaveBeenCalledWith("+919555555555", "111111", undefined, "signup", ACCEPTED),
    );
    await waitFor(() => screen.getByText(/one more step/i));
    expect(screen.getByText(/verify your email to finish creating your account/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "phonefirst@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));

    await waitFor(() =>
      expect(api.requestEmailOtp).toHaveBeenCalledWith("phonefirst@example.com", "phone-first-tok"),
    );
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "222222" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() =>
      expect(api.verifyEmailOtp).toHaveBeenCalledWith("phonefirst@example.com", "222222", "phone-first-tok"),
    );
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  });

  it("recovers to Landing (not stuck) when the phone-first email gate's token has expired", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "111111" });
    vi.mocked(api.verifyOtp).mockResolvedValue({
      email_required: { token: "expired-tok", prefill_phone: "+919555555556" },
    });
    vi.mocked(api.requestEmailOtp).mockRejectedValue(
      new ApiError(401, "This verification has expired. Please start over."),
    );
    renderFlow();
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919555555556" } });
    await tickConsent();
    fireEvent.click(screen.getByRole("button", { name: /get otp/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));
    await waitFor(() => screen.getByText(/one more step/i));

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "stuck@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));

    // Not stuck on the gate screen forever -- dropped back to Landing with the error shown.
    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
    expect(screen.queryByText(/one more step/i)).not.toBeInTheDocument();

    // The stale gate token doesn't leak into an unrelated later flow.
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    expect(screen.getByText(/log in with email/i)).toBeInTheDocument();
    expect(screen.queryByText(/one more step/i)).not.toBeInTheDocument();
  });

  it("shows a Log in instead shortcut when the phone gate's number belongs to a different account", async () => {
    vi.mocked(api.verifyGoogleCredential).mockResolvedValue({
      phone_required: { token: "gate-tok", prefill_email: "newperson@example.com" },
    });
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "111222" });
    vi.mocked(api.verifyOtp).mockRejectedValue(
      new ApiError(409, "An account with this phone number already exists — log in instead."),
    );
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "fake-id-token" });
    await waitFor(() => screen.getByText(/one more step/i));

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919600000123" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "111222" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());
    const loginShortcut = screen.getByRole("button", { name: /log in instead/i });

    fireEvent.click(loginShortcut);

    // Dropped back to Landing in login mode, not stuck on the dead-end phone step.
    await waitFor(() => expect(screen.getByText(/welcome back/i)).toBeInTheDocument());
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
  });

  // "resends the email OTP..." and "shows an inline error when the email
  // OTP code is wrong" used to live here, both driven by the now-removed
  // Landing signup email form. OtpVerify's inline-error and resend
  // rendering are shared, generic behavior already exercised by surviving
  // tests below ("shows the backend's own message...", the phone-first
  // tests above) through their own still-reachable entry points.

  it("does not show the confirm-your-email acknowledgment for a Google signup's phone gate", async () => {
    vi.mocked(api.verifyGoogleCredential).mockResolvedValue({
      phone_required: { token: "gate-tok-2", prefill_email: "g@example.com" },
    });
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "999888" });
    vi.mocked(api.verifyOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    renderFlow();
    // Google's button only renders in Login mode now (Task 12 hid it from
    // signup) -- this still exercises a brand-new Google identity's
    // mandatory phone gate; the response mock, not the visible mode,
    // decides that it's a "signup".
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "fake-id-token" });
    await waitFor(() => screen.getByText(/one more step/i));
    expect(screen.getByText(/finish creating your account for g@example\.com/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919111111111" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "999888" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // "shows an inline error when email signup fails" and "shows a Log in
  // instead shortcut on the email signup duplicate error" used to live
  // here, both driven by the removed Landing signup email form's own
  // direct 409. The "Log in instead" shortcut pattern itself is still
  // covered above (phone-gate collision, via Google) and below
  // (email-login's own duplicate-error path).

  it("logs in via email OTP from Continue with Email button, no phone gate", async () => {
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "777888" });
    vi.mocked(api.verifyEmailOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fillEmail("existing@example.com");
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));

    await waitFor(() => expect(api.requestEmailOtp).toHaveBeenCalledWith("existing@example.com", undefined, "login"));
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
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "fake-id-token" });

    await waitFor(() => expect(screen.getByText(/one more step/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
  });

  it("does not render theme toggle on auth entry screen (appears from Dashboard onwards)", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByRole("button", { name: /get otp/i })).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /toggle.*theme/i })).not.toBeInTheDocument();
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

  // "clears previous signup error immediately when switching to Log in
  // mode" used to live here, driven by the removed Landing signup email
  // form's 409. onModeChange's error-clearing is generic (fires the same
  // way regardless of which error is showing) and is still verified below
  // for the opposite direction.

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

  // Staging-QA fix 1 (2026-09-30): sign-up/login checks at code-request time.
  it("sign-up sends flow=signup and a 409 offers Log in instead", async () => {
    vi.mocked(api.requestOtp).mockRejectedValue(new ApiError(409, "An account with this phone number already exists."));
    renderFlow();

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919811100001" } });
    await tickConsent();
    fireEvent.click(screen.getByRole("button", { name: /get otp/i }));

    await screen.findByText("An account with this phone number already exists.");
    expect(api.requestOtp).toHaveBeenCalledWith("+919811100001", undefined, "signup", ACCEPTED);
    expect(screen.getByRole("button", { name: /log in instead/i })).toBeInTheDocument();
  });

  it("login with an unknown number offers Sign up instead", async () => {
    vi.mocked(api.requestOtp).mockRejectedValue(
      new ApiError(404, "No account found for that phone number — sign up instead."),
    );
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with phone/i }));

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919811100004" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    await screen.findByText(/No account found for that phone number/);
    expect(api.requestOtp).toHaveBeenCalledWith("+919811100004", undefined, "login", undefined);
    fireEvent.click(screen.getByRole("button", { name: /sign up instead/i }));
    expect(await screen.findByText(/create your account/i)).toBeInTheDocument();
  });

  it("resend keeps the login flow for an email login", async () => {
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "123456" });
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fillEmail("a@b.com");
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.click(screen.getByRole("button", { name: /resend/i }));

    await waitFor(() => expect(vi.mocked(api.requestEmailOtp).mock.calls.length).toBe(2));
    expect(vi.mocked(api.requestEmailOtp).mock.calls.at(-1)).toEqual(["a@b.com", undefined, "login"]);
  });

  // Consent (Task 10).
  async function googleCallback(credential: string) {
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    fireEvent.load(document.head.querySelector("script")!);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential });
  }

  async function reachSignupOtp(phone: string) {
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: phone } });
    await tickConsent();
    fireEvent.click(screen.getByRole("button", { name: /get otp/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));
  }

  it("sign-up shows the agreement line under Get OTP, with no tick box", async () => {
    renderFlow();
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919555555557" } });
    await tickConsent();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/By continuing, you agree to our/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute("href", "/legal/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/legal/privacy");
    expect(screen.getByRole("button", { name: /get otp/i })).toBeEnabled();
  });

  it("phone sign-up Get OTP sends the accepted documents (consent recorded at the click)", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "111111" });
    renderFlow();
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919555555556" } });
    await tickConsent();
    fireEvent.click(screen.getByRole("button", { name: /get otp/i }));
    await waitFor(() =>
      expect(api.requestOtp).toHaveBeenCalledWith("+919555555556", undefined, "signup", ACCEPTED),
    );
  });

  it("login mode shows no consent line", async () => {
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    await waitFor(() => screen.getByTestId("google-button-container"));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/you agree to our/)).not.toBeInTheDocument();
  });

  it("phone sign-up verify sends accepted documents", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "111111" });
    vi.mocked(api.verifyOtp).mockResolvedValue(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();
    await reachSignupOtp("+919555555558");
    await waitFor(() =>
      expect(api.verifyOtp).toHaveBeenCalledWith("+919555555558", "111111", undefined, "signup", ACCEPTED),
    );
  });

  it("google new account asks for consent then retries", async () => {
    vi.mocked(api.verifyGoogleCredential)
      .mockRejectedValueOnce(new ApiError(422, { code: "consent_required", message: "x", missing: [] }))
      .mockResolvedValueOnce(NORMAL_SESSION);
    vi.mocked(api.getMe).mockResolvedValue(ME_RESPONSE);
    renderFlow();
    await googleCallback("g-token");

    await screen.findByText("Create your Unifolio account");
    expect(screen.getByText("It looks like you’re new here.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await tickConsent();
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(api.verifyGoogleCredential).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.verifyGoogleCredential).mock.calls[1]).toEqual(["g-token", undefined, ACCEPTED]);
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  });

  it("google consent step: Back returns to Landing", async () => {
    vi.mocked(api.verifyGoogleCredential).mockRejectedValue(new ApiError(422, { code: "consent_required", message: "x" }));
    renderFlow();
    await googleCallback("g-token");
    await screen.findByText("Create your Unifolio account");
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(await screen.findByRole("button", { name: /continue with email/i })).toBeInTheDocument();
  });

  it("google stale version refetches and shows the updated-terms message", async () => {
    vi.mocked(api.verifyGoogleCredential)
      .mockRejectedValueOnce(new ApiError(422, { code: "consent_required", message: "x" }))
      .mockRejectedValueOnce(new ApiError(422, { code: "consent_required", message: "x" }));
    renderFlow();
    await googleCallback("g-token");
    await screen.findByText("Create your Unifolio account");
    await tickConsent();
    vi.mocked(getLegalDocuments).mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText("Our terms were just updated. Please review them and continue again.");
    expect(getLegalDocuments).toHaveBeenCalledWith(true);
  });

  it("R9: consent_required at the final phone sign-up step restarts sign-up", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "111111" });
    vi.mocked(api.verifyOtp).mockRejectedValue(new ApiError(422, { code: "consent_required", message: "x" }));
    renderFlow();
    await reachSignupOtp("+919555555559");

    await screen.findByText("Our terms were just updated. Please review them and continue again.");
    expect(getLegalDocuments).toHaveBeenCalledWith(true);
    expect(screen.getByText(/create your account/i)).toBeInTheDocument();
  });
});

