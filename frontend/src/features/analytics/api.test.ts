import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAnalyticsScope, retryAnalyticsScope, postExportPdf, getExportPayload } from "./api";
import * as session from "../auth/session";

describe("getAnalyticsScope", () => {
  beforeEach(() => {
    vi.spyOn(session, "getToken").mockReturnValue("session-tok");
  });

  it("GETs /analytics/{scope} with the bearer token and an abort signal", async () => {
    const body = { scope: "combined", recomputing: false, sections: {} };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
    );
    const controller = new AbortController();
    const result = await getAnalyticsScope("combined", controller.signal);
    expect(result).toEqual(body);
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toContain("/analytics/combined");
    expect(options.headers.get("Authorization")).toBe("Bearer session-tok");
    expect(options.signal).toBe(controller.signal);
  });

  it("works with a member-id scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ scope: "m-1", recomputing: false, sections: {} }),
          { status: 200 },
        ),
      ),
    );
    await getAnalyticsScope("m-1");
    const [url] = (fetch as any).mock.calls[0];
    expect(url).toContain("/analytics/m-1");
  });

  it("throws ApiError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: "Household member not found." }),
      }),
    );
    await expect(getAnalyticsScope("bad-scope")).rejects.toThrow();
  });
});

describe("retryAnalyticsScope", () => {
  beforeEach(() => {
    vi.spyOn(session, "getToken").mockReturnValue("session-tok");
  });

  it("POSTs /analytics/{scope}/retry with the bearer token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ dispatched: true }) }),
    );
    const result = await retryAnalyticsScope("combined");
    expect(result).toEqual({ dispatched: true });
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toContain("/analytics/combined/retry");
    expect(options.method).toBe("POST");
    expect(options.headers.get("Authorization")).toBe("Bearer session-tok");
  });
});

describe("postExportPdf", () => {
  beforeEach(() => {
    vi.spyOn(session, "getToken").mockReturnValue("session-tok");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["%PDF-1.4"], { type: "application/pdf" })),
      }),
    );
  });

  it("POSTs the payload with the session bearer token and returns a Blob", async () => {
    const payload = { scopeName: "Family Aggregate" } as any;
    const blob = await postExportPdf({ scope: "aggregate", memberId: null, payload });
    expect(blob).toBeInstanceOf(Blob);
    const [, options] = (fetch as any).mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers.get("Authorization")).toBe("Bearer session-tok");
    expect(JSON.parse(options.body)).toEqual({ scope: "aggregate", member_id: null, payload });
  });
});

describe("getExportPayload", () => {
  it("GETs the payload by token with no Authorization header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ scopeName: "Family Aggregate" }),
      }),
    );
    const result = await getExportPayload("tok-123");
    expect(result).toEqual({ scopeName: "Family Aggregate" });
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toContain("/analytics/export/payload/tok-123");
    expect(options?.headers).toBeUndefined();
  });
});
