import { describe, expect, it } from "vitest";
import type { InvestorType, PrimaryGoal } from "@/features/auth/types";
import { GOAL_OPTIONS, INVESTOR_OPTIONS, humanizeCode } from "./onboardingOptions";

// Compile-time exhaustiveness: if the PrimaryGoal / InvestorType unions gain or lose a code, these literals stop type-checking.
const ALL_GOALS: Record<PrimaryGoal, true> = { wealth_creation: true, retirement: true, childrens_education: true, buy_home: true, financial_freedom: true, tax_planning: true };
const ALL_INVESTOR_TYPES: Record<InvestorType, true> = { self_directed: true, advisor_assisted: true, mixed: true, beginner: true };

describe("GOAL_OPTIONS and INVESTOR_OPTIONS (copied from the onboarding screens Q3Purpose and Q2Investing, in onboarding order)", () => {
  it("lists the six life goals with their titles, in order, and no subtitles", () => {
    expect(GOAL_OPTIONS).toEqual([
      { value: "wealth_creation", title: "Build my wealth" },
      { value: "retirement", title: "Plan for retirement" },
      { value: "childrens_education", title: "Fund my children's education" },
      { value: "buy_home", title: "Buy a home" },
      { value: "financial_freedom", title: "Achieve financial freedom" },
      { value: "tax_planning", title: "Plan my taxes" },
    ]);
  });

  it("lists the four investor types with their onboarding titles and subtitles", () => {
    expect(INVESTOR_OPTIONS).toEqual([
      { value: "self_directed", title: "Mostly on my own", subtitle: "Direct SIPs, mutual funds, maybe some stocks" },
      { value: "advisor_assisted", title: "Through an advisor or distributor", subtitle: "Distributor, bank advisor or family office, alongside my own tracking" },
      { value: "mixed", title: "A mix of both", subtitle: "A bit of self-directed investing and a bit through an advisor" },
      { value: "beginner", title: "Just getting started", subtitle: "Haven't invested much yet, building my portfolio" },
    ]);
  });

  it("covers exactly the codes of the types the auth feature defines (no drift from the onboarding lists)", () => {
    expect(GOAL_OPTIONS.map(option => option.value).sort()).toEqual(Object.keys(ALL_GOALS).sort());
    expect(INVESTOR_OPTIONS.map(option => option.value).sort()).toEqual(Object.keys(ALL_INVESTOR_TYPES).sort());
  });
});

describe("humanizeCode (a code this build does not know is shown readable, never dropped)", () => {
  it.each([
    ["retirement_planning", "Retirement planning"],
    ["x_y", "X y"],
    ["mixed", "Mixed"],
    ["x__y", "X y"],
    ["_lead_and_trail_", "Lead and trail"],
    ["", ""],
  ])("%j gives %j", (code, expected) => {
    expect(humanizeCode(code)).toBe(expected);
  });
});
