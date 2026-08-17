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
  beforeEach(() => {
    // No .env is committed, so VITE_GOOGLE_OAUTH_CLIENT_ID is undefined under
    // vitest and GoogleButton would render its "not configured" banner
    // instead of the GIS container.
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    delete (window as { google?: unknown }).google;
  });

  it("renders Google, Apple (disabled), Email, and Phone in that order", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByTestId("google-button-container")).toBeInTheDocument());

    const appleButton = screen.getByRole("button", { name: /continue with apple/i });
    expect(appleButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /continue with email/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeEnabled();

    // Real DOM order, not just presence. Google is a GIS-owned container div
    // (no <button> exists until the real script renders one), so it's checked
    // by document position; the other three are checked by their index within
    // the rendered pill buttons.
    const pillNames = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => /continue with/i.test(text));
    expect(pillNames).toHaveLength(3);
    expect(pillNames[0]).toMatch(/continue with apple/i);
    expect(pillNames[1]).toMatch(/continue with email/i);
    expect(pillNames[2]).toMatch(/continue with phone/i);

    const googleContainer = screen.getByTestId("google-button-container");
    const ordered = [
      googleContainer,
      appleButton,
      screen.getByRole("button", { name: /continue with email/i }),
      screen.getByRole("button", { name: /continue with phone/i }),
    ];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      expect(
        ordered[i].compareDocumentPosition(ordered[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("surfaces a Google sign-in failure on the landing screen", async () => {
    vi.mocked(api.verifyGoogleCredential).mockRejectedValue(new ApiError(401, "Google token rejected."));
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
    renderFlow();
    const script = document.head.querySelector("script")!;
    fireEvent.load(script);
    await waitFor(() => expect(window.google!.accounts.id.initialize).toHaveBeenCalled());

    const { callback } = vi.mocked(window.google!.accounts.id.initialize).mock.calls[0][0];
    await callback({ credential: "bad-id-token" });

    await waitFor(() => expect(screen.getByText(/google token rejected/i)).toBeInTheDocument());
    // Still on the landing screen — the error has somewhere to render.
    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeInTheDocument();
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

  it("clears a stale error when navigating back from a failed phone OTP attempt", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: /change number/i }));

    expect(screen.queryByText(/invalid or expired otp/i)).not.toBeInTheDocument();
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
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
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
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
    expect(screen.queryByText(/one more step/i)).not.toBeInTheDocument();
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

  it("the link-account screen can be cancelled back to the landing screen", async () => {
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
    await waitFor(() => expect(screen.getByText(/log in with your phone/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));

    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeInTheDocument();
    expect(screen.queryByText(/log in with your phone/i)).not.toBeInTheDocument();
  });

  it("shows an error on the landing screen when login fails after a successful link", async () => {
    vi.mocked(api.sendEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "555444" });
    vi.mocked(api.verifyEmailOtp)
      .mockResolvedValueOnce({
        link_required: { token: "link-tok", matched_email: "existing@example.com", existing_method: "email" },
      })
      .mockResolvedValueOnce(NORMAL_SESSION);
    vi.mocked(api.getMe).mockRejectedValue(new ApiError(500, "Profile lookup failed."));
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "existing@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "555444" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));
    await waitFor(() => expect(screen.getByText(/log in with your email/i)).toBeInTheDocument());

    // Second leg: complete the link, but let login() blow up on getMe().
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "existing@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "555444" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(screen.getByText(/profile lookup failed/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeInTheDocument();
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
