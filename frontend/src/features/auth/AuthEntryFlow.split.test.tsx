import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    requestOtp: vi.fn(), requestEmailOtp: vi.fn(), signupEmail: vi.fn(), verifyOtp: vi.fn(), verifyEmailOtp: vi.fn(),
    verifyGoogleCredential: vi.fn(), getMe: vi.fn(),
  };
});

const SESSION = { session_token: "tok-1", user_id: "u1", onboarding_step: null, onboarding_completed: false };
const ME = {
  user_id: "u1", phone_number: "+919876543210", email: "asha@example.com", onboarding_step: null, onboarding_completed: false,
  investor_type: null, primary_goals: null, self_name: null, consent_outdated: [], created_at: "2025-10-14T09:30:00+05:30",
};

function renderSplit(mode: "login" | "signup" = "login") {
  return render(<AuthProvider><AuthEntryFlow initialMode={mode} variant="split" /></AuthProvider>);
}

beforeEach(() => {
  vi.mocked(getLegalDocuments).mockResolvedValue(DOCS);
});
afterEach(() => { vi.clearAllMocks(); localStorage.clear(); });

describe("AuthEntryFlow, split variant, login (UI round 2, S6 tasks 6.6 and 6.7)", () => {
  it("shows the new Welcome back screen on the Email tab, not today's three-button menu", async () => {
    renderSplit();
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Email" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: /continue with email/i })).toBeNull();
    expect(screen.queryByTestId("google-button-container")).toBeNull();
  });
  it("the legacy variant keeps today's login menu", async () => {
    render(<AuthProvider><AuthEntryFlow initialMode="login" variant="legacy" /></AuthProvider>);
    expect(await screen.findByRole("button", { name: /continue with email/i })).toBeEnabled();
    expect(screen.queryByRole("tab", { name: "Mobile number" })).toBeNull();
  });
  it("sign-up mode shows the new Let's get started screen, not Welcome back", async () => {
    renderSplit("signup");
    expect(await screen.findByRole("heading", { name: "Let's get started" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome back" })).toBeNull();
  });
  it("email login: Get OTP requests a login code and shows the email code screen with the masked address", async () => {
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "sent", otp: "654321" } as never);
    renderSplit();
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "siddharth@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(await screen.findByRole("heading", { name: "Verify your email address" })).toBeInTheDocument();
    expect(api.requestEmailOtp).toHaveBeenCalledWith("siddharth@gmail.com", undefined, "login");
    expect(screen.getAllByText("si••••••@gmail.com").length).toBeGreaterThan(0);
    expect(screen.getByText(/654 321/)).toBeInTheDocument();
  });
  it("a correct email code logs in through the existing handler", async () => {
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "sent", otp: null } as never);
    vi.mocked(api.verifyEmailOtp).mockResolvedValue(SESSION as never);
    vi.mocked(api.getMe).mockResolvedValue(ME as never);
    renderSplit();
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    await screen.findByRole("heading", { name: "Verify your email address" });
    const cells = screen.getAllByRole("textbox");
    [..."123456"].forEach((digit, index) => fireEvent.change(cells[index], { target: { value: digit } }));
    fireEvent.click(screen.getByRole("button", { name: "Verify and log in" }));
    await waitFor(() => expect(api.verifyEmailOtp).toHaveBeenCalledWith("asha@example.com", "123456", undefined));
    await waitFor(() => expect(localStorage.getItem("unifolio_session_token")).toBe("tok-1"));
  });
  it("mobile login: the Mobile tab requests a login code and shows the phone code screen", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "sent", otp: "654321" } as never);
    renderSplit();
    fireEvent.click(await screen.findByRole("tab", { name: "Mobile number" }));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "98765 43210" } });
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(await screen.findByRole("heading", { name: "Verify your mobile number" })).toBeInTheDocument();
    expect(api.requestOtp).toHaveBeenCalledWith("+919876543210", undefined, "login", undefined);
    expect(screen.getAllByText("+91 ••••• 43210").length).toBeGreaterThan(0);
  });
  it("Edit number and Back return to Welcome back with the Mobile tab and the number kept", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "sent", otp: null } as never);
    renderSplit();
    fireEvent.click(await screen.findByRole("tab", { name: "Mobile number" }));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "98765 43210" } });
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    await screen.findByRole("heading", { name: "Verify your mobile number" });
    fireEvent.click(screen.getByRole("button", { name: "Edit number" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Mobile number" })).toHaveAttribute("aria-selected", "true");
    expect((screen.getByLabelText("Mobile number") as HTMLInputElement).value.replace(/\D/g, "")).toContain("9876543210");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    await screen.findByRole("heading", { name: "Verify your mobile number" });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
  it("a wrong code shows the shared alert", async () => {
    vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "sent", otp: null } as never);
    vi.mocked(api.verifyEmailOtp).mockRejectedValue(new ApiError(400, { code: "bad", message: "That code didn't work. Try again." } as never));
    renderSplit();
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    await screen.findByRole("heading", { name: "Verify your email address" });
    const cells = screen.getAllByRole("textbox");
    [..."111111"].forEach((digit, index) => fireEvent.change(cells[index], { target: { value: digit } }));
    fireEvent.click(screen.getByRole("button", { name: "Verify and log in" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
  it("no account found shows the backend's message with a Sign up shortcut that goes to sign-up", async () => {
    vi.mocked(api.requestEmailOtp).mockRejectedValue(new ApiError(404, "No account found for this email. Sign up instead."));
    renderSplit();
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/No account found/);
    fireEvent.click(within(alert).getByRole("button", { name: "Sign up" }));
    expect(await screen.findByRole("heading", { name: "Let's get started" })).toBeInTheDocument();
  });
  it("Back on Welcome back goes to sign-up screen 1", async () => {
    renderSplit();
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Let's get started" })).toBeInTheDocument();
  });
  it("the Log in link on sign-up leads to the new Welcome back screen", async () => {
    renderSplit("signup");
    fireEvent.click(await screen.findByRole("button", { name: /^log in$/i }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
});

// Batch B item 4 (B-8): the flow turns a server hold (429 with the seconds) into the login screen's countdown.
// Red until B-8 wires it. The error is built the way features/auth/api.ts builds it (see api.test.ts).
describe("AuthEntryFlow, split variant, login: a held code (Batch B, item 4)", () => {
  const HELD = "For your security, a new code can be requested once a minute.";
  const held = (seconds: number, code = "otp_throttled", message = `Please wait ${seconds}s before requesting another code.`) =>
    Object.assign(new ApiError(429, message), { retryAfterSeconds: seconds, code });
  const typeEmail = async (value: string) =>
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value } });
  // Queued answers (mockRejectedValueOnce) survive clearAllMocks, so a test that stops early would feed the next one.
  beforeEach(() => {
    vi.mocked(api.requestEmailOtp).mockReset();
    vi.mocked(api.requestOtp).mockReset();
  });

  it("a hold on the email shows the countdown button and the red line, and no red box", async () => {
    vi.mocked(api.requestEmailOtp).mockRejectedValue(held(42));
    renderSplit();
    await typeEmail("asha@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(await screen.findByRole("button", { name: "Get OTP again in 00:42" })).toBeDisabled();
    expect(screen.getByText(HELD)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("editing the email makes the button live and a send goes to the server again (the server stays the authority)", async () => {
    vi.mocked(api.requestEmailOtp).mockRejectedValueOnce(held(42)).mockResolvedValueOnce({ message: "sent", otp: null } as never);
    renderSplit();
    await typeEmail("asha@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    await screen.findByRole("button", { name: "Get OTP again in 00:42" });
    await typeEmail("rohan@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(await screen.findByRole("heading", { name: "Verify your email address" })).toBeInTheDocument();
    expect(api.requestEmailOtp).toHaveBeenLastCalledWith("rohan@example.com", undefined, "login");
  });
  it("a hold on a different address after editing shows that address's own countdown", async () => {
    vi.mocked(api.requestEmailOtp).mockRejectedValueOnce(held(42)).mockRejectedValueOnce(held(30));
    renderSplit();
    await typeEmail("asha@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    await screen.findByRole("button", { name: "Get OTP again in 00:42" });
    await typeEmail("rohan@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(await screen.findByRole("button", { name: "Get OTP again in 00:30" })).toBeDisabled();
  });
  it("a hold on the phone number shows the countdown on the Mobile number tab", async () => {
    vi.mocked(api.requestOtp).mockRejectedValue(held(42));
    renderSplit();
    fireEvent.click(await screen.findByRole("tab", { name: "Mobile number" }));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "98765 43210" } });
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(await screen.findByRole("button", { name: "Get OTP again in 00:42" })).toBeDisabled();
    expect(screen.getByText(HELD)).toBeInTheDocument();
  });
  it("the per-network limit is a red alert with the server's sentence, and the button stays live", async () => {
    const message = "Too many attempts from this network. Try again in 4 minutes.";
    vi.mocked(api.requestEmailOtp).mockRejectedValue(held(240, "request_limited", message));
    renderSplit();
    await typeEmail("asha@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Get OTP" })).toBeEnabled();
    expect(screen.queryByText(HELD)).toBeNull();
  });
  it("an old-style 429 (the sentence only, no seconds) shows the sentence in the red box as today", async () => {
    vi.mocked(api.requestEmailOtp).mockRejectedValue(new ApiError(429, "Please wait 42s before requesting another code."));
    renderSplit();
    await typeEmail("asha@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait 42s before requesting another code.");
    expect(screen.queryByText(HELD)).toBeNull();
  });
  it("an unregistered email still shows No account found with the Sign up shortcut and never a countdown", async () => {
    vi.mocked(api.requestEmailOtp).mockRejectedValue(new ApiError(404, "No account found for this email. Sign up instead."));
    renderSplit();
    await typeEmail("new@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No account found/);
    expect(screen.queryByText(HELD)).toBeNull();
    expect(screen.getByRole("button", { name: "Get OTP" })).toBeEnabled();
  });
});
