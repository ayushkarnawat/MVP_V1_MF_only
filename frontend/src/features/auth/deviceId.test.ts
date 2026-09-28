import { beforeEach, describe, expect, it } from "vitest";
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
});
