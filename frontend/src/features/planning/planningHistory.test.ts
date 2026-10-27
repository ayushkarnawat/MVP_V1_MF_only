import { afterEach, describe, expect, it } from "vitest";
import { pushPlanningState, readPlanningState, replacePlanningState } from "./planningHistory";

afterEach(() => { window.history.replaceState(null, ""); });

describe("planning history state", () => {
  it("round-trips a pushed state", () => {
    pushPlanningState({ planning: "market", scenarioId: "abc" });
    expect(readPlanningState()).toEqual({ planning: "market", scenarioId: "abc" });
    pushPlanningState({ planning: "landing", scenarioId: null });
    expect(readPlanningState()).toEqual({ planning: "landing", scenarioId: null });
  });

  it("adds a history entry on push and none on replace, without touching the address", () => {
    const before = window.history.length;
    const url = window.location.href;
    pushPlanningState({ planning: "future", scenarioId: null });
    expect(window.history.length).toBe(before + 1);
    replacePlanningState({ planning: "landing", scenarioId: null });
    expect(window.history.length).toBe(before + 1);
    expect(window.location.href).toBe(url);
    expect(readPlanningState()).toEqual({ planning: "landing", scenarioId: null });
  });

  it("keeps the other keys of the browser state (the shell's own, for example)", () => {
    window.history.replaceState({ unifolioTab: "dashboard", idx: 3 }, "");
    pushPlanningState({ planning: "market", scenarioId: "x" });
    expect(window.history.state).toMatchObject({ unifolioTab: "dashboard", idx: 3, planning: "market", scenarioId: "x" });
    replacePlanningState({ planning: "landing", scenarioId: null });
    expect(window.history.state).toMatchObject({ unifolioTab: "dashboard", idx: 3, planning: "landing", scenarioId: null });
  });

  it.each([
    ["no state", null],
    ["a string", "market"],
    ["a number", 7],
    ["an object without the keys", { other: 1 }],
    ["an unknown view", { planning: "bogus", scenarioId: null }],
    ["a numeric scenario id", { planning: "market", scenarioId: 5 }],
    ["a missing scenario id", { planning: "market" }],
  ])("reads null for %s", (_label, state) => {
    window.history.replaceState(state, "");
    expect(readPlanningState()).toBeNull();
  });

  it("accepts the three views", () => {
    for (const planning of ["landing", "future", "market"] as const) {
      window.history.replaceState({ planning, scenarioId: null }, "");
      expect(readPlanningState()).toEqual({ planning, scenarioId: null });
    }
  });
});
