import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPendingSignup, readPendingSignup, savePendingSignup } from "./pendingSignup";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("pendingSignup (the name waits for the account, T6.10)", () => {
  it("saves, reads and clears under the key unifolio.pendingSignup", () => {
    expect(readPendingSignup()).toBeNull();
    savePendingSignup({ name: "Asha Rao", phone: "+919876543210" });
    expect(JSON.parse(sessionStorage.getItem("unifolio.pendingSignup")!)).toEqual({ name: "Asha Rao", phone: "+919876543210" });
    expect(readPendingSignup()).toEqual({ name: "Asha Rao", phone: "+919876543210" });
    clearPendingSignup();
    expect(readPendingSignup()).toBeNull();
    expect(sessionStorage.getItem("unifolio.pendingSignup")).toBeNull();
  });
  it.each([
    ["not JSON", "{oops"],
    ["null", "null"],
    ["a number", "5"],
    ["no phone", JSON.stringify({ name: "Asha" })],
    ["no name", JSON.stringify({ phone: "+919876543210" })],
    ["a blank name", JSON.stringify({ name: "   ", phone: "+919876543210" })],
  ])("reads %s as nothing stored", (_label, raw) => {
    sessionStorage.setItem("unifolio.pendingSignup", raw);
    expect(readPendingSignup()).toBeNull();
  });
  it("never throws when sessionStorage is blocked", () => {
    const blocked = () => { throw new Error("blocked"); };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(() => savePendingSignup({ name: "Asha", phone: "+919876543210" })).not.toThrow();
    expect(readPendingSignup()).toBeNull();
    expect(() => clearPendingSignup()).not.toThrow();
  });
});
