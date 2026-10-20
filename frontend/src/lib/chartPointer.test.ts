import { describe, expect, it } from "vitest";
import { indexFromClientX } from "./chartPointer";
describe("indexFromClientX", () => {
  it("clamps outside the plot", () => {
    expect(indexFromClientX(-100, { left: 10, width: 320 }, 5, 640, 16)).toBe(0);
    expect(indexFromClientX(900, { left: 10, width: 320 }, 5, 640, 16)).toBe(4);
  });
  it("handles one point and zero width", () => {
    expect(indexFromClientX(50, { left: 0, width: 320 }, 1, 640, 16)).toBe(0);
    expect(indexFromClientX(50, { left: 0, width: 0 }, 5, 640, 16)).toBe(0);
  });
  it("rounds to the nearest plotted index", () => {
    expect(indexFromClientX(160, { left: 0, width: 320 }, 5, 640, 16)).toBe(2);
    expect(indexFromClientX(210, { left: 0, width: 320 }, 5, 640, 16)).toBe(3);
  });
});
