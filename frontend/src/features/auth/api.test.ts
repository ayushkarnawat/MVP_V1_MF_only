import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHouseholdMember,
  getMe,
  listHouseholdMembers,
  loginEmail,
  requestOtp,
  signupEmail,
  updateMe,
  verifyGoogleCredential,
  verifyOtp,
} from "./api";
import { clearToken, setToken } from "./session";

describe("auth api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  it("requestOtp posts phone_number as JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "OTP sent.", otp: "123456" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await requestOtp("+919999999999");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/otp/request");
    expect(JSON.parse(options.body as string)).toEqual({ phone_number: "+919999999999" });
    expect(result.otp).toBe("123456");
  });

  it("verifyOtp posts phone_number and otp as JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session_token: "tok-1", user_id: "u1", onboarding_step: null, onboarding_completed: false,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await verifyOtp("+919999999999", "123456");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/otp/verify");
    expect(JSON.parse(options.body as string)).toEqual({ phone_number: "+919999999999", otp: "123456" });
    expect("session_token" in result && result.session_token).toBe("tok-1");
  });

  it("getMe attaches the stored token as a Bearer header", async () => {
    setToken("tok-abc");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: "u1", phone_number: "+919999999999", email: null,
          onboarding_step: "q2_investing", onboarding_completed: false,
          investor_type: null, primary_goal: null,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await getMe();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/me");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer tok-abc");
    expect(result.onboarding_step).toBe("q2_investing");
  });

  it("updateMe PATCHes the body as JSON with auth", async () => {
    setToken("tok-abc");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: "u1", phone_number: "+919999999999", email: null,
          onboarding_step: "q3_purpose", onboarding_completed: false,
          investor_type: "self_directed", primary_goal: null,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await updateMe({ onboarding_step: "q3_purpose", investor_type: "self_directed" });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/me");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({
      onboarding_step: "q3_purpose", investor_type: "self_directed",
    });
    expect(result.investor_type).toBe("self_directed");
  });

  it("createHouseholdMember posts name/relationship as JSON with auth", async () => {
    setToken("tok-abc");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: "m1", name: "Mom", relationship: "parent", relationship_other_label: null }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await createHouseholdMember("Mom", "parent");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/household-members");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      name: "Mom", relationship: "parent", relationship_other_label: null,
    });
    expect(result.id).toBe("m1");
  });

  it("listHouseholdMembers GETs the list with auth", async () => {
    setToken("tok-abc");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{ id: "m1", name: "Self", relationship: "self", relationship_other_label: null }]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await listHouseholdMembers();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/household-members");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer tok-abc");
    expect(result).toHaveLength(1);
  });

  it("signupEmail posts email and password as JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ phone_required: { token: "gate-tok", prefill_email: "a@example.com" } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await signupEmail("a@example.com", "correcthorse");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/signup/email");
    expect(JSON.parse(options.body as string)).toEqual({ email: "a@example.com", password: "correcthorse" });
    expect("phone_required" in result).toBe(true);
  });

  it("loginEmail posts email and password as JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ session_token: "tok-5", user_id: "u5", onboarding_step: null, onboarding_completed: false }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await loginEmail("a@example.com", "correcthorse");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/login/email");
    expect(JSON.parse(options.body as string)).toEqual({ email: "a@example.com", password: "correcthorse" });
    expect(result.session_token).toBe("tok-5");
  });

  it("loginEmail includes pending_token only when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ session_token: "tok-6", user_id: "u6", onboarding_step: null, onboarding_completed: false }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    await loginEmail("a@example.com", "correcthorse", "pending-xyz");

    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body as string)).toEqual({
      email: "a@example.com", password: "correcthorse", pending_token: "pending-xyz",
    });
  });

  it("verifyOtp includes pending_token only when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ session_token: "tok-3", user_id: "u3", onboarding_step: null, onboarding_completed: false }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    await verifyOtp("+919999999999", "123456", "pending-abc");

    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body as string)).toEqual({
      phone_number: "+919999999999", otp: "123456", pending_token: "pending-abc",
    });
  });

  it("verifyOtp omits pending_token when not provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ session_token: "tok-4", user_id: "u4", onboarding_step: null, onboarding_completed: false }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    await verifyOtp("+919999999999", "123456");

    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body as string)).toEqual({ phone_number: "+919999999999", otp: "123456" });
  });

  it("verifyGoogleCredential posts id_token as JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ phone_required: { token: "gate-tok", prefill_email: "a@example.com" } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await verifyGoogleCredential("fake-id-token");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/oauth/google");
    expect(JSON.parse(options.body as string)).toEqual({ id_token: "fake-id-token" });
    expect("phone_required" in result).toBe(true);
  });
});
