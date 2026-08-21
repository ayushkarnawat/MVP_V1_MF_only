import { describe, it, expect, vi, beforeEach } from "vitest";
import { postExportPdf, getExportPayload } from "./api";
import * as session from "../auth/session";

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
