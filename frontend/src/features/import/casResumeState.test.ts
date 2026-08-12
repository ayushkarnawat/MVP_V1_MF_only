import { describe, expect, it, beforeEach } from "vitest";
import {
  setCasResumeStep2,
  hasCasResumeStep2,
  clearCasResumeStep2,
  getCasResumeKey,
} from "./casResumeState";

describe("casResumeState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates correct storage keys", () => {
    expect(getCasResumeKey("m-1")).toBe("unifolio_cas_resume_step2_m-1");
    expect(getCasResumeKey()).toBe("unifolio_cas_resume_step2");
  });

  it("persists resume step 2 state globally and per member", () => {
    expect(hasCasResumeStep2("m-1")).toBe(false);
    expect(hasCasResumeStep2()).toBe(false);

    setCasResumeStep2("m-1");

    expect(hasCasResumeStep2("m-1")).toBe(true);
    expect(hasCasResumeStep2()).toBe(true);
  });

  it("clears resume state properly", () => {
    setCasResumeStep2("m-1");
    setCasResumeStep2("m-2");

    expect(hasCasResumeStep2("m-1")).toBe(true);

    clearCasResumeStep2("m-1");

    expect(hasCasResumeStep2("m-1")).toBe(false);
    expect(hasCasResumeStep2()).toBe(false);
  });

  it("clears all resume state when called without arguments", () => {
    setCasResumeStep2("m-1");
    setCasResumeStep2("m-2");

    clearCasResumeStep2();

    expect(hasCasResumeStep2("m-1")).toBe(false);
    expect(hasCasResumeStep2("m-2")).toBe(false);
    expect(hasCasResumeStep2()).toBe(false);
  });
});
