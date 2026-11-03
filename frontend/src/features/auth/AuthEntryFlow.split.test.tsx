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
  it("sign-up mode is still today's screen in this packet", async () => {
    renderSplit("signup");
    expect(await screen.findByText(/create your account/i)).toBeInTheDocument();
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
    expect(await screen.findByText(/create your account/i)).toBeInTheDocument();
  });
  it("Back on Welcome back goes to sign-up screen 1", async () => {
    renderSplit();
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByText(/create your account/i)).toBeInTheDocument();
  });
  it("the Log in link on sign-up leads to the new Welcome back screen", async () => {
    renderSplit("signup");
    fireEvent.click(await screen.findByRole("button", { name: /^log in$/i }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
});
