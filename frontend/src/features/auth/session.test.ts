import { afterEach, describe, expect, it } from "vitest";
import { clearToken, getToken, setToken } from "./session";

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
