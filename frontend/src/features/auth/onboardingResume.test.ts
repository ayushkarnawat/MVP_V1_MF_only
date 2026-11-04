import { describe, expect, it } from "vitest";
import { resumeStepSplit } from "./onboardingResume";
import type { MeResponse } from "./types";

const ME: MeResponse = {
  user_id: "u1", phone_number: "+919876543210", email: "asha@example.com", onboarding_step: null, onboarding_completed: false,
  investor_type: null, primary_goals: null, self_name: "Asha Rao", consent_outdated: [], created_at: "2025-10-14T09:30:00+05:30",
};
const at = (over: Partial<MeResponse>, completedImport = false) => resumeStepSplit({ ...ME, ...over }, completedImport);

describe("resumeStepSplit: where desktop sign-up resumes (task 6.14)", () => {
  it("a missing self name always means screen 3, whatever step was saved", () => {
    for (const step of [null, "q1_name", "q2_investing", "q3_purpose", "cas_upload", "trust_primer"]) {
      expect(at({ self_name: null, onboarding_step: step })).toBe("q1_name");
    }
    expect(resumeStepSplit(null, false)).toBe("q1_name");
  });
  it("the old saved steps q2_investing and q3_purpose both resume on screen 4", () => {
    expect(at({ onboarding_step: "q2_investing" })).toBe("q2_investing");
    expect(at({ onboarding_step: "q3_purpose" })).toBe("q2_investing");
  });
  it("a saved cas_upload resumes on screen 5, or on screen 6 when an import has completed", () => {
    expect(at({ onboarding_step: "cas_upload" }, false)).toBe("connect_accounts");
    expect(at({ onboarding_step: "cas_upload" }, true)).toBe("all_set");
  });
  it("q1_name with a saved name resumes on screen 3", () => {
    expect(at({ onboarding_step: "q1_name" })).toBe("q1_name");
  });
  it("trust_primer keeps its special case: the first unsaved answer, else the connect screen", () => {
    expect(at({ onboarding_step: "trust_primer" })).toBe("q2_investing");
    expect(at({ onboarding_step: "trust_primer", investor_type: "mixed" })).toBe("q2_investing");
    expect(at({ onboarding_step: "trust_primer", investor_type: "mixed", primary_goals: ["consolidated_view"] as never })).toBe("q2_investing");
    expect(at({ onboarding_step: "trust_primer", investor_type: "mixed", primary_goals: ["buy_home"] })).toBe("connect_accounts");
  });
  it("an unknown step or done lands on screen 3", () => {
    expect(at({ onboarding_step: "nonsense" })).toBe("q1_name");
    expect(at({ onboarding_step: "done" })).toBe("q1_name");
  });
});
