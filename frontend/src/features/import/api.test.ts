import { afterEach, describe, expect, it, vi } from "vitest";
import { setPanDisclaimer } from "../legal/panDisclaimerStore";
import {
  ApiError,
  cancelImportRequest,
  confirmImport,
  getCasImportStatus,
  getMemberCoverageGaps,
  getMemberImportHistory,
  getHouseholdImportHistory,
  deleteHouseholdImport,
  deleteMemberPortfolio,
  resolveName,
  resolveSelf,
  resolvePan,
  resolveSamePerson,
  acknowledgePrompt,
  confirmPeopleImport,
  parseImport,
  discardImportSession,
  postOpeningBalance,
  requestCamsStatement,
} from "./api";

describe("parseImport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the file and password as multipart form data", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ session_id: "s1", schemes: [], transactions: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const file = new File(["pdf-bytes"], "cas.pdf", { type: "application/pdf" });
    await parseImport(file, "secret", "member-1");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/imports/parse");
    expect(options.method).toBe("POST");
    const body = options.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("password")).toBe("secret");
  });

  it("parseImport sends the disclaimer version and surface", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ session_id: "s1" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
    setPanDisclaimer("pan-v1", "onboarding_upload");
    await parseImport(new File(["x"], "cas.pdf"), "pw", "member-1");
    const [, options] = mockFetch.mock.calls[0];
    expect((options.body as FormData).get("pan_disclaimer_version")).toBe("pan-v1");
    expect(options.headers["X-Upload-Surface"]).toBe("onboarding_upload");
    setPanDisclaimer(null);
  });

  it("retry keeps disclaimer", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ session_id: "s1" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
    setPanDisclaimer("pan-v1", "import_upload");
    await parseImport(new File(["x"], "cas.pdf"), "pw", "member-1");
    await parseImport(new File(["x"], "cas.pdf"), "pw", "member-1");
    for (const [, options] of mockFetch.mock.calls) {
      expect((options.body as FormData).get("pan_disclaimer_version")).toBe("pan-v1");
      expect(options.headers["X-Upload-Surface"]).toBe("import_upload");
    }
    setPanDisclaimer(null);
  });

  it("throws ApiError with the structured payload on a 422", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ detail: { code: "wrong_password", message: "Incorrect PDF password." } }),
          { status: 422 },
        ),
      ),
    );

    const file = new File(["pdf-bytes"], "cas.pdf", { type: "application/pdf" });
    await expect(parseImport(file, "wrong", "member-1")).rejects.toMatchObject({
      status: 422,
      payload: { code: "wrong_password", message: "Incorrect PDF password." },
    });
  });

  it("attaches an Authorization header when a session token is stored", async () => {
    localStorage.setItem("unifolio_session_token", "tok-abc");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ session_id: "s1", schemes: [], transactions: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const file = new File(["pdf-bytes"], "cas.pdf", { type: "application/pdf" });
    await parseImport(file, "secret", "member-1");

    const [, options] = mockFetch.mock.calls[0];
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer tok-abc");
    localStorage.removeItem("unifolio_session_token");
  });
});

describe("confirmImport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends session_id, household_member_id, and scheme_confirmations as JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ added: 1, skipped: 0, import_id: "imp1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await confirmImport("sess1", "member-1", [{ temp_id: "t1", amfi_code: "12345" }]);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/imports/confirm");
    const body = JSON.parse(options.body as string);
    expect(body.session_id).toBe("sess1");
    expect(body.household_member_id).toBe("member-1");
    expect(body.scheme_confirmations).toEqual([{ temp_id: "t1", amfi_code: "12345" }]);
  });

  it("sends only session, member and confirmations on confirm", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ added: 1, skipped: 0, import_id: "imp1", warnings: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await confirmImport("sess1", "member-2", []);

    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body as string)).toEqual({
      session_id: "sess1",
      household_member_id: "member-2",
      scheme_confirmations: [],
    });
  });

  it("sends the household member id on parse", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ session_id: "s1" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await parseImport(new File(["x"], "cas.pdf"), "pw", "member-7");

    const [, options] = mockFetch.mock.calls[0];
    expect((options.body as FormData).get("household_member_id")).toBe("member-7");
  });

  it("posts to the discard endpoint and swallows failures", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(discardImportSession("sess 1")).resolves.toBeUndefined();
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/imports\/sessions\/sess%201\/discard$/);
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("throws ApiError with a string payload on a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Import session not found." }), { status: 404 }),
      ),
    );

    await expect(confirmImport("gone", "member-1", [])).rejects.toBeInstanceOf(ApiError);
  });

  it("attaches an Authorization header when a session token is stored", async () => {
    localStorage.setItem("unifolio_session_token", "tok-abc");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ added: 0, skipped: 0, import_id: "imp1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await confirmImport("sess1", "member-1", []);

    const [, options] = mockFetch.mock.calls[0];
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer tok-abc");
    localStorage.removeItem("unifolio_session_token");
  });
});

describe("cas-import lifecycle methods", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getCasImportStatus queries status by import_id", async () => {
    const mockRes = {
      import_id: "imp-123",
      household_member_id: "m-1",
      status: "processing",
      uploaded_at: "2026-08-10T12:00:00Z",
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockRes), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await getCasImportStatus("imp-123");
    expect(res.status).toBe("processing");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/cas-imports/imp-123");
  });

  it("getMemberImportHistory returns list of historical imports", async () => {
    const mockRes = [
      {
        import_id: "imp-1",
        household_member_id: "m-1",
        status: "import_successful",
        new_transactions_count: 3,
        uploaded_at: "2026-08-10T12:00:00Z",
      },
    ];
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockRes), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const history = await getMemberImportHistory("m-1");
    expect(history.length).toBe(1);
    expect(history[0].import_id).toBe("imp-1");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/household-members/m-1/cas-imports");
  });

  it("loads household history and deletes one import through the profile endpoints", async () => {
    const history = [{ import_id: "imp-1", household_member_id: "m-1", status: "confirmed", uploaded_at: "2026-09-10T00:00:00Z", statement_from_date: null, statement_to_date: null, new_transactions_count: 3 }];
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(history), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted_transactions_count: 3 }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    expect(await getHouseholdImportHistory()).toEqual(history);
    expect(await deleteHouseholdImport("imp-1")).toEqual({ deleted_transactions_count: 3 });
    expect(mockFetch.mock.calls[0][0]).toContain("/imports/history");
    expect(mockFetch.mock.calls[1][0]).toContain("/imports/imp-1?scope=person");
    expect(mockFetch.mock.calls[1][1].method).toBe("DELETE");
  });

  it("getMemberCoverageGaps returns list of folios with gaps", async () => {
    const mockRes = [
      {
        folio_id: "fol-1",
        folio_number: "12345/67",
        scheme_id: "sch-1",
        scheme_name: "HDFC Top 100",
        deficit_units: "50.000",
        first_deficit_date: "2024-02-15",
      },
    ];
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockRes), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const gaps = await getMemberCoverageGaps("m-1");
    expect(gaps.length).toBe(1);
    expect(gaps[0].folio_id).toBe("fol-1");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/household-members/m-1/coverage-gaps");
  });

  it("postOpeningBalance sends opening balance payload and returns result", async () => {
    const mockRes = {
      transaction_id: "txn-1",
      folio_id: "fol-1",
      type: "opening_balance",
      date: "2024-01-01",
      units: "50.000",
      amount: "5000.00",
      nav: "100.0000",
      has_coverage_gap: false,
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockRes), { status: 201 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await postOpeningBalance("fol-1", {
      units: "50.000",
      date: "2024-01-01",
      amount: "5000.00",
      nav: "100.0000",
    });
    expect(res.transaction_id).toBe("txn-1");
    expect(res.has_coverage_gap).toBe(false);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/folios/fol-1/opening-balance");
    expect(options.method).toBe("POST");
  });

  it("requestCamsStatement sends memberId and returns cams_url and waiting status", async () => {
    const mockRes = {
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "waiting_for_user",
      cams_url: "https://www.camsonline.com/statements",
      expires_at: "2026-08-12T12:00:00Z",
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockRes), { status: 201 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await requestCamsStatement("m-1", "pan-v1");
    expect(res.status).toBe("waiting_for_user");
    expect(res.cams_url).toContain("camsonline");
    const [url, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body as string)).toEqual({ household_member_id: "m-1", pan_disclaimer_version: "pan-v1" });
    expect(url).toContain("/cas-imports/request");
    expect(options.method).toBe("POST");
  });

  it("cancelImportRequest sends cancel POST and returns expired status", async () => {
    const mockRes = {
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "expired",
      uploaded_at: "2026-08-10T12:00:00Z",
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockRes), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await cancelImportRequest("imp-req-1");
    expect(res.status).toBe("expired");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/cas-imports/imp-req-1/cancel");
    expect(options.method).toBe("POST");
  });
});


describe("session resolve and people-confirm calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stub(body: unknown = {}, status = 200) {
    const mockFetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", mockFetch);
    return mockFetch;
  }

  it.each([
    ["resolve-name", () => resolveName("s 1", "Ayush"), { name: "Ayush" }],
    ["resolve-self", () => resolveSelf("s 1", null), { person_key: null }],
    ["resolve-pan", () => resolvePan("s 1"), { choice: "statement" }],
    ["resolve-same-person", () => resolveSamePerson("s 1", "p1", "m2", false), { person_key: "p1", member_id: "m2", same: false }],
    ["acknowledge", () => acknowledgePrompt("s 1", "member_not_in_file"), { code: "member_not_in_file" }],
  ])("POSTs %s with the documented body", async (action, call, body) => {
    const mockFetch = stub();
    await call();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain(`/imports/sessions/s%201/${action}`);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual(body);
  });

  it("throws ApiError with the 409 payload from a resolve call", async () => {
    stub({ detail: { code: "which_is_self", message: "m" } }, 409);
    await expect(resolveSelf("s1", "p1")).rejects.toMatchObject({ status: 409 });
  });

  it("confirmPeopleImport sends people and top-level moved_funds", async () => {
    const mockFetch = stub({ added: 1, skipped: 0, import_id: "i", warnings: [], people: [] });
    await confirmPeopleImport("s1", [{ person_key: "p1", scheme_confirmations: [] }], { t1: "p2" });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/imports/confirm");
    expect(JSON.parse(options.body as string)).toEqual({
      session_id: "s1",
      people: [{ person_key: "p1", scheme_confirmations: [] }],
      moved_funds: { t1: "p2" },
    });
  });

  it("deleteHouseholdImport passes the group scope and deleteMemberPortfolio the remove flag", async () => {
    const mockFetch = stub({ deleted_transactions_count: 0, removed_member_ids: [], deleted_file: false });
    await deleteHouseholdImport("imp-1", "group");
    await deleteMemberPortfolio("m-1", true);
    expect(mockFetch.mock.calls[0][0]).toContain("/imports/imp-1?scope=group");
    expect(mockFetch.mock.calls[1][0]).toContain("/household-members/m-1/portfolio?remove_member=true");
    expect(mockFetch.mock.calls[1][1].method).toBe("DELETE");
  });
});
