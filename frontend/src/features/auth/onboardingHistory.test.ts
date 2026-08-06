import { describe, expect, it } from "vitest";
import {
  currentStep,
  goBack,
  goNext,
  initHistory,
  isSkipped,
  markAnswered,
  skipToNext,
} from "./onboardingHistory";

describe("onboarding history", () => {
  it("starts at the given first step", () => {
    const state = initHistory("trust_primer");
    expect(currentStep(state)).toBe("trust_primer");
  });

  it("goNext appends and moves the cursor forward", () => {
    let state = initHistory("trust_primer");
    state = goNext(state, "q1_name");
    expect(currentStep(state)).toBe("q1_name");
  });

  it("goBack moves the cursor back without losing the forward step", () => {
    let state = initHistory("trust_primer");
    state = goNext(state, "q1_name");
    state = goBack(state);
    expect(currentStep(state)).toBe("trust_primer");
  });

  it("goNext after goBack retraces the same path (no duplicate entry)", () => {
    let state = initHistory("trust_primer");
    state = goNext(state, "q1_name");
    state = goNext(state, "q2_investing");
    state = goBack(state);
    expect(currentStep(state)).toBe("q1_name");
    state = goNext(state, "q2_investing");
    expect(currentStep(state)).toBe("q2_investing");
    expect(state.order).toEqual(["trust_primer", "q1_name", "q2_investing"]);
  });

  it("goNext with a different step after going back truncates and replaces the tail", () => {
    let state = initHistory("trust_primer");
    state = goNext(state, "q1_name");
    state = goNext(state, "q4_household");
    state = goBack(state);
    state = goNext(state, "add_family");
    expect(currentStep(state)).toBe("add_family");
    expect(state.order).toEqual(["trust_primer", "q1_name", "add_family"]);
  });

  it("goBack at the first step is a no-op", () => {
    const state = goBack(initHistory("trust_primer"));
    expect(currentStep(state)).toBe("trust_primer");
  });

  it("skipToNext marks the current step skipped and advances", () => {
    let state = initHistory("q2_investing");
    state = skipToNext(state, "q3_purpose");
    expect(currentStep(state)).toBe("q3_purpose");
    expect(isSkipped(state, "q2_investing")).toBe(true);
  });

  it("markAnswered clears the skipped flag for the current step", () => {
    let state = initHistory("q2_investing");
    state = skipToNext(state, "q3_purpose");
    state = goBack(state);
    expect(isSkipped(state, "q2_investing")).toBe(true);
    state = markAnswered(state);
    expect(isSkipped(state, "q2_investing")).toBe(false);
  });
});
