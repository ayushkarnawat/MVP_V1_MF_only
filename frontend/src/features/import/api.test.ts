import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  cancelImportRequest,
  confirmImport,
  getCasImportStatus,
  getMemberCoverageGaps,
  getMemberImportHistory,
  parseImport,
  postOpeningBalance,
  requestCamsStatement,
  retryCasImportPassword,
  uploadCasImport,
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
    await parseImport(file, "secret");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/imports/parse");
    expect(options.method).toBe("POST");
    const body = options.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("password")).toBe("secret");
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
    await expect(parseImport(file, "wrong")).rejects.toMatchObject({
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
    await parseImport(file, "secret");

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

describe("uploadCasImport & lifecycle methods", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploadCasImport sends file, password, memberId, and sourceTab", async () => {
    const mockRes = {
      import_id: "imp-123",
      household_member_id: "m-1",
      status: "upload_started",
      uploaded_at: "2026-08-10T12:00:00Z",
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockRes), { status: 202 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const file = new File(["pdf"], "cas.pdf", { type: "application/pdf" });
    const res = await uploadCasImport(file, "secret", "m-1", "upload");

    expect(res.import_id).toBe("imp-123");
    expect(res.status).toBe("upload_started");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/cas-imports");
    expect(options.method).toBe("POST");
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

  it("retryCasImportPassword sends PATCH with new password", async () => {
    const mockRes = {
      import_id: "imp-123",
      household_member_id: "m-1",
      status: "import_successful",
      new_transactions_count: 5,
      uploaded_at: "2026-08-10T12:00:00Z",
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockRes), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await retryCasImportPassword("imp-123", "new_secret");
    expect(res.status).toBe("import_successful");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/cas-imports/imp-123/password");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ password: "new_secret" });
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

    const res = await requestCamsStatement("m-1");
    expect(res.status).toBe("waiting_for_user");
    expect(res.cams_url).toContain("camsonline");
    const [url, options] = mockFetch.mock.calls[0];
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



