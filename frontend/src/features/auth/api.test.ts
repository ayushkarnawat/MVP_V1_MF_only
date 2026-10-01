import { afterEach, describe, expect, it, vi } from "vitest";
import {
  updateMemberProfile,
  createHouseholdMember,
  mergeMemberInto,
  getMe,
  listHouseholdMembers,
  requestEmailOtp,
  requestOtp,
  signupEmail,
  updateMe,
  verifyEmailOtp,
  verifyGoogleCredential,
  verifyOtp,
  reactivateAccount,
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
          investor_type: null, primary_goals: null,
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
          investor_type: "self_directed", primary_goals: null,
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

  it("signupEmail posts email as JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          email_otp_required: { token: "gate-tok", prefill_email: "a@example.com", otp: "111222" },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await signupEmail("a@example.com");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/signup/email");
    expect(JSON.parse(options.body as string)).toEqual({ email: "a@example.com" });
    expect(result.email_otp_required.token).toBe("gate-tok");
  });

  it("requestEmailOtp posts email as JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "OTP sent.", otp: "654321" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await requestEmailOtp("a@example.com");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/email-otp/request");
    expect(JSON.parse(options.body as string)).toEqual({ email: "a@example.com" });
    expect(result.otp).toBe("654321");
  });

  it("verifyEmailOtp posts email, otp, and pending_token as JSON when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ phone_required: { token: "gate-tok-2", prefill_email: "a@example.com" } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await verifyEmailOtp("a@example.com", "111222", "pending-tok");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/email-otp/verify");
    expect(JSON.parse(options.body as string)).toEqual({
      email: "a@example.com", otp: "111222", pending_token: "pending-tok",
    });
    expect("phone_required" in result && result.phone_required.token).toBe("gate-tok-2");
  });

  it("verifyEmailOtp omits pending_token when not provided (plain login)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ session_token: "tok-5", user_id: "u5", onboarding_step: null, onboarding_completed: false }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await verifyEmailOtp("a@example.com", "111222");

    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body as string)).toEqual({ email: "a@example.com", otp: "111222" });
    expect("session_token" in result && result.session_token).toBe("tok-5");
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

  it("updateMemberProfile PUTs the profile body and mergeMemberInto posts to the merge route", async () => {
    setToken("tok-abc");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "m1", name: "Ramesh" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ folios_moved: 2, transactions_dropped: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await updateMemberProfile("m1", { relationship: "parent", pan: "BXQPS5678L" });
    const merged = await mergeMemberInto("m2", "m1");

    expect(mockFetch.mock.calls[0][0]).toContain("/household-members/m1/profile");
    expect(mockFetch.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toEqual({ relationship: "parent", pan: "BXQPS5678L" });
    expect(mockFetch.mock.calls[1][0]).toContain("/household-members/m2/merge-into/m1");
    expect(merged.folios_moved).toBe(2);
  });

  it("requestOtp sends flow when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "OTP sent.", otp: "1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await requestOtp("+919800000000", undefined, "signup");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ phone_number: "+919800000000", flow: "signup" });
  });

  it("requestEmailOtp sends flow when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "OTP sent.", otp: "1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await requestEmailOtp("a@b.com", undefined, "login");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "a@b.com", flow: "login" });
  });

  const ACCEPTED = [
    { document_type: "terms_of_service" as const, document_version: "tos-placeholder-2026-10-01" },
    { document_type: "privacy_policy" as const, document_version: "privacy-placeholder-2026-10-01" },
  ];

  it("sends accepted_documents and X-Device-Id on signupEmail, verifyOtp and verifyGoogleCredential", async () => {
    const mockFetch = vi.fn().mockImplementation(
      async () => new Response(JSON.stringify({ session_token: "t" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await signupEmail("a@b.com", ACCEPTED);
    await verifyOtp("+919999999999", "123456", undefined, "signup", ACCEPTED);
    await verifyGoogleCredential("id-tok", undefined, ACCEPTED);

    for (const [, options] of mockFetch.mock.calls) {
      expect(JSON.parse(options.body as string).accepted_documents).toEqual(ACCEPTED);
      expect((options.headers as Record<string, string>)["X-Device-Id"]).toBeTruthy();
    }
  });

  it("omits accepted_documents when none are given", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ session_token: "t" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
    await verifyOtp("+919999999999", "123456", undefined, "login");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).not.toHaveProperty("accepted_documents");
  });

  it("reactivateAccount posts accepted_documents", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user_id: "u" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
    await reactivateAccount(ACCEPTED);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/reactivate");
    expect(JSON.parse(options.body as string)).toEqual({ accepted_documents: ACCEPTED });
  });
});
