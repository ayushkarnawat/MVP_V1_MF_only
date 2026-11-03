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

const PHONE = "+919876543210";
const SESSION = { session_token: "tok-1", user_id: "u1", onboarding_step: null, onboarding_completed: false };
const ME = {
  user_id: "u1", phone_number: PHONE, email: "asha@example.com", onboarding_step: null, onboarding_completed: false,
  investor_type: null, primary_goals: null, self_name: null, consent_outdated: [], created_at: "2025-10-14T09:30:00+05:30",
};
const EMAIL_REQUIRED = { email_required: { token: "pend-1", prefill_phone: PHONE } };

function renderSignup(variant: "split" | "legacy" = "split") {
  return render(<AuthProvider><AuthEntryFlow initialMode="signup" variant={variant} /></AuthProvider>);
}
const fillCode = (code: string) => {
  const cells = screen.getAllByRole("textbox");
  [...code].forEach((digit, index) => fireEvent.change(cells[index], { target: { value: digit } }));
};
async function toScreen2() {
  vi.mocked(api.requestOtp).mockResolvedValue({ message: "sent", otp: "654321" } as never);
  fireEvent.change(await screen.findByLabelText("Mobile number"), { target: { value: "98765 43210" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Get OTP" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
  await screen.findByRole("heading", { name: "Verify your number" });
}
async function toScreen3() {
  await toScreen2();
  vi.mocked(api.verifyOtp).mockResolvedValue(EMAIL_REQUIRED as never);
  fillCode("123456");
  fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
  await screen.findByRole("heading", { name: "Create your account" });
}
async function toScreen3b() {
  await toScreen3();
  vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "sent", otp: "246810" } as never);
  fireEvent.change(screen.getByLabelText("Full name (as per PAN card)"), { target: { value: "Asha Rao" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Verify your email address" });
}

beforeEach(() => {
  vi.mocked(getLegalDocuments).mockResolvedValue(DOCS);
});
afterEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe("AuthEntryFlow, split variant, sign-up (UI round 2, S6 tasks 6.8 to 6.10)", () => {
  it("shows the new Let's get started screen; the legacy variant keeps today's", async () => {
    const { unmount } = renderSignup();
    expect(await screen.findByRole("heading", { name: "Let's get started" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Step 1 of 5" })).toBeInTheDocument();
    unmount();
    renderSignup("legacy");
    expect(await screen.findByText(/create your account/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Let's get started" })).toBeNull();
  });
  it("Get OTP sends the number with the accepted document versions and shows screen 2 with the number in full", async () => {
    renderSignup();
    await toScreen2();
    expect(api.requestOtp).toHaveBeenCalledWith(PHONE, undefined, "signup", expect.anything());
    expect(screen.getByRole("group", { name: "Step 2 of 5" })).toBeInTheDocument();
    expect(screen.getAllByText("+91 98765 43210").length).toBeGreaterThan(0);
    expect(screen.getByText(/654 321/)).toBeInTheDocument();
  });
  it("Edit number and Back return to screen 1 with the number kept", async () => {
    renderSignup();
    await toScreen2();
    fireEvent.click(screen.getByRole("button", { name: "Edit number" }));
    expect(await screen.findByRole("heading", { name: "Let's get started" })).toBeInTheDocument();
    expect((screen.getByLabelText("Mobile number") as HTMLInputElement).value).toBe("9876543210");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    await screen.findByRole("heading", { name: "Verify your number" });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Let's get started" })).toBeInTheDocument();
  });
  it("an account that already exists shows the Log in instead shortcut, which opens Welcome back", async () => {
    vi.mocked(api.requestOtp).mockRejectedValue(new ApiError(409, "An account with this mobile number already exists."));
    renderSignup();
    fireEvent.change(await screen.findByLabelText("Mobile number"), { target: { value: "98765 43210" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Get OTP" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Log in instead" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
  it("a correct phone code moves to screen 3 through the existing handler", async () => {
    renderSignup();
    await toScreen3();
    expect(api.verifyOtp).toHaveBeenCalledWith(PHONE, "123456", undefined, "signup", expect.anything());
    expect(screen.getByRole("group", { name: "Step 3 of 5" })).toBeInTheDocument();
    expect(screen.queryByText(/one more step/i)).toBeNull();
  });
  it("Continue on screen 3 keeps the name in sessionStorage, asks for the email code and shows screen 3b", async () => {
    renderSignup();
    await toScreen3b();
    expect(api.requestEmailOtp).toHaveBeenCalledWith("asha@example.com", "pend-1");
    expect(JSON.parse(sessionStorage.getItem("unifolio.pendingSignup")!)).toEqual({ name: "Asha Rao", phone: PHONE });
    expect(screen.getByRole("heading", { level: 2, name: "Almost there." })).toBeInTheDocument();
    expect(screen.getAllByText("as••••••@example.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("group", { name: "Step 3 of 5" })).toBeInTheDocument();
    expect(screen.getByText(/246 810/)).toBeInTheDocument();
  });
  it("Back and Edit email address on screen 3b return to screen 3 with the name and the email kept", async () => {
    renderSignup();
    await toScreen3b();
    fireEvent.click(screen.getByRole("button", { name: "Edit email address" }));
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect((screen.getByLabelText("Full name (as per PAN card)") as HTMLInputElement).value).toBe("Asha Rao");
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("asha@example.com");
  });
  it("a correct email code creates the session through the existing handler", async () => {
    vi.mocked(api.getMe).mockResolvedValue(ME as never);
    vi.mocked(api.verifyEmailOtp).mockResolvedValue(SESSION as never);
    renderSignup();
    await toScreen3b();
    fillCode("123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
    await waitFor(() => expect(api.verifyEmailOtp).toHaveBeenCalledWith("asha@example.com", "123456", "pend-1"));
    await waitFor(() => expect(localStorage.getItem("unifolio_session_token")).toBe("tok-1"));
    expect(sessionStorage.getItem("unifolio.pendingSignup")).not.toBeNull();
  });
  it("Back on screen 3 goes to screen 1", async () => {
    renderSignup();
    await toScreen3();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Let's get started" })).toBeInTheDocument();
  });
  it("a wrong email code shows the shared alert and stays on screen 3b", async () => {
    vi.mocked(api.verifyEmailOtp).mockRejectedValue(new ApiError(400, "That code didn't work. Try again."));
    renderSignup();
    await toScreen3b();
    fillCode("111111");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work.");
    expect(screen.getByRole("heading", { name: "Verify your email address" })).toBeInTheDocument();
  });
  it("an email that is already used shows the backend's message on screen 3", async () => {
    renderSignup();
    await toScreen3();
    vi.mocked(api.requestEmailOtp).mockRejectedValue(new ApiError(409, "An account with this email already exists."));
    fireEvent.change(screen.getByLabelText("Full name (as per PAN card)"), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });
});
