import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateDeviceId } from "./deviceId";

describe("getOrCreateDeviceId", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("generates and persists a device id on first call", () => {
    const id = getOrCreateDeviceId();

    expect(id).toBeTruthy();
    expect(window.localStorage.getItem("unifolio_device_id")).toBe(id);
  });

  it("returns the same id on subsequent calls", () => {
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();

    expect(second).toBe(first);
  });

  describe("without crypto.randomUUID (final review fix, 2026-09-28)", () => {
    const originalRandomUUID = crypto.randomUUID;

    afterEach(() => {
      crypto.randomUUID = originalRandomUUID;
    });

    it("still returns and persists an id when crypto.randomUUID is unavailable", () => {
      // @ts-expect-error -- simulating a browser/context without it (e.g.
      // Safari < 15.4, or a non-secure-context dev URL)
      crypto.randomUUID = undefined;

      const id = getOrCreateDeviceId();

      expect(id).toBeTruthy();
      expect(window.localStorage.getItem("unifolio_device_id")).toBe(id);
    });

    it("never throws even when localStorage is also unavailable", () => {
      // @ts-expect-error -- same as above
      crypto.randomUUID = undefined;
      const original = window.localStorage.getItem;
      vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });

      expect(() => getOrCreateDeviceId()).not.toThrow();

      window.localStorage.getItem = original;
    });
  });
});
