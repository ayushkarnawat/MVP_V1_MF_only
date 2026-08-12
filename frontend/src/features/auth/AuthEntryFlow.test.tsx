import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthEntryFlow } from "./AuthEntryFlow";
import { AuthProvider } from "./AuthContext";
import * as api from "./api";
import { ApiError } from "../../lib/apiClient";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, requestOtp: vi.fn(), verifyOtp: vi.fn(), getMe: vi.fn() };
});

function renderFlow() {
  return render(
    <AuthProvider>
      <AuthEntryFlow />
    </AuthProvider>,
  );
}

describe("AuthEntryFlow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows Sign Up and Log In on the landing screen, both leading to phone entry", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
  });

  it("moves from phone entry to OTP verify after a successful request", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    renderFlow();
    await waitFor(() => screen.getByRole("button", { name: /sign up/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());
    expect(screen.getByText(/654321/)).toBeInTheDocument();
  });

  it("logs in on successful OTP verification", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    vi.mocked(api.verifyOtp).mockResolvedValue({
      session_token: "tok-1", user_id: "u1", onboarding_step: null, onboarding_completed: false,
    });
    vi.mocked(api.getMe).mockResolvedValue({
      user_id: "u1", phone_number: "+919999999999", email: null,
      onboarding_step: null, onboarding_completed: false, investor_type: null, primary_goal: null,
    });
    renderFlow();
    await waitFor(() => screen.getByRole("button", { name: /sign up/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(api.verifyOtp).toHaveBeenCalledWith("+919999999999", "654321"));
  });

  it("shows an inline error when OTP verification fails", async () => {
    vi.mocked(api.requestOtp).mockResolvedValue({ message: "OTP sent.", otp: "654321" });
    vi.mocked(api.verifyOtp).mockRejectedValue(new ApiError(401, "Invalid or expired OTP."));
    renderFlow();
    await waitFor(() => screen.getByRole("button", { name: /sign up/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: "+919999999999" } });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(screen.getByText(/invalid or expired otp/i)).toBeInTheDocument());
  });

  it("renders light/dark theme toggle on auth entry screen", async () => {
    renderFlow();
    await waitFor(() => expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument());

    const themeToggle = screen.getByRole("button", { name: /toggle.*theme/i });
    expect(themeToggle).toBeInTheDocument();
    fireEvent.click(themeToggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
