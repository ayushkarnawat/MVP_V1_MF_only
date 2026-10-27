import { describe, expect, it } from "vitest";
import { homePath } from "./api";

// Register L9: the member id is part of the path, so it is URL-encoded (a UUID is unchanged).
describe("homePath member id encoding", () => {
  it("leaves a UUID unchanged", () => {
    expect(homePath({ viewMode: "member", memberId: "e6b4557c-b0e3-58f9-8642-54da2db3a27d" }, "summary"))
      .toBe("/household-members/e6b4557c-b0e3-58f9-8642-54da2db3a27d/home/summary");
  });

  it("encodes characters that would change the path", () => {
    expect(homePath({ viewMode: "member", memberId: "a b/c?d" }, "movers", { by: "fund" }))
      .toBe("/household-members/a%20b%2Fc%3Fd/home/movers?by=fund");
  });

  it("does not touch the family path", () => {
    expect(homePath({ viewMode: "aggregate", memberId: null }, "allocation")).toBe("/household/aggregate/home/allocation");
  });
});
