import { afterEach, describe, expect, it } from "vitest";
import { clearToken, getToken, setToken, setTokenOverride } from "./session";

describe("session token store", () => {
  afterEach(() => {
    clearToken();
  });

  it("returns null when no token is stored", () => {
    expect(getToken()).toBeNull();
  });

  it("round-trips a token through set/get", () => {
    setToken("tok-123");
    expect(getToken()).toBe("tok-123");
  });

  it("clears a stored token", () => {
    setToken("tok-123");
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe("memory-only token override", () => {
  afterEach(() => { setTokenOverride(null); clearToken(); });
  it("a token override wins over localStorage and is never written to it", () => {
    setToken("stored-demo");
    setTokenOverride("print-demo");
    expect(getToken()).toBe("print-demo");
    expect(localStorage.getItem("unifolio_session_token")).toBe("stored-demo");
    expect(Object.values(localStorage)).not.toContain("print-demo");
  });
  it("clearing the override falls back to localStorage", () => {
    setToken("stored-demo");
    setTokenOverride("print-demo");
    setTokenOverride(null);
    expect(getToken()).toBe("stored-demo");
  });
});
