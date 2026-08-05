import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, confirmImport, parseImport } from "./api";

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
});

describe("confirmImport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends session_id and scheme_confirmations as JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ added: 1, skipped: 0, import_id: "imp1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await confirmImport("sess1", [{ temp_id: "t1", amfi_code: "12345" }]);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/imports/confirm");
    const body = JSON.parse(options.body as string);
    expect(body.session_id).toBe("sess1");
    expect(body.scheme_confirmations).toEqual([{ temp_id: "t1", amfi_code: "12345" }]);
  });

  it("throws ApiError with a string payload on a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Import session not found." }), { status: 404 }),
      ),
    );

    await expect(confirmImport("gone", [])).rejects.toBeInstanceOf(ApiError);
  });
});
